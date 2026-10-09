// Plays the static web build on emulated phones and tablets with real touch events, and
// measures what a phone has to hold: download, GPU memory, decoded images, wasm and the
// browser's own memory.
//
//   node tools/check-mobile.mjs --serve pages                  # every profile below
//   node tools/check-mobile.mjs --serve pages --device "iPhone 15 landscape"
//   node tools/check-mobile.mjs <url> --log artifacts/mobile/check.json --shots artifacts/mobile/shots
//
// Profiles: iPhone 15 (portrait and landscape) and iPad Pro 11 in headless WebKit, Pixel 7
// (landscape) in headless Chromium. Each one opens the game, reaches the title, taps it to
// start a fight, then uses the on-screen controls with touches the browser itself
// dispatches (WebKit's and Chromium's input protocols, several fingers at once): the stick
// walks while a second finger turns the view, FIRE and ALT fire, JUMP jumps, ▶ switches
// weapon, Ⅱ pauses and _Resume game_ resumes. It exits 0 only when every step passes with
// no page errors.
//
// Memory is measured in the page: every WebGL texture, buffer and renderbuffer the game
// allocates (and frees), the decoded images kept for those textures, the physics engine's
// wasm memory, and Chromium's JavaScript heap; and outside it: the summed PSS of every
// browser process this script started, sampled twice a second. Neither engine enforces
// iOS's per-tab limit, so these numbers are what to compare against it.
//
// Nothing needs installing: Playwright 1.63 is taken from $PLAYWRIGHT_CORE (default the
// blog's copy on this machine), WebKit from $WEBKIT (default its cached pw_run.sh) and
// Chromium from Playwright's cached headless shell. Profiles are throwaway; the server
// listens on --port (default 5291) and stops with the script.
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? fallback : args[i + 1];
};
const options = (name) =>
  args.flatMap((a, i) => (a === "--" + name ? [args[i + 1]] : []));
const valued = new Set(["--serve", "--device", "--log", "--shots", "--port"]);
const target = args.find(
  (a, i) => !a.startsWith("--") && !valued.has(args[i - 1]),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const pw = require(
  process.env.PLAYWRIGHT_CORE ??
    path.join(os.homedir(), "Sites/blog/node_modules/playwright-core"),
);
const WEBKIT =
  process.env.WEBKIT ??
  path.join(os.homedir(), ".cache/webkit-libs/webkit-2359/pw_run.sh");
function headlessShell() {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  for (const d of fs.readdirSync(cache).sort().reverse())
    if (d.startsWith("chromium_headless_shell-")) {
      const exe = path.join(
        cache,
        d,
        "chrome-headless-shell-linux64",
        "chrome-headless-shell",
      );
      if (fs.existsSync(exe)) return exe;
    }
  throw new Error("No cached chrome-headless-shell");
}
const PROFILES = {
  "iPhone 15": "webkit",
  "iPhone 15 landscape": "webkit",
  "iPad Pro 11": "webkit",
  "iPad Pro 11 landscape": "webkit",
  "Pixel 7": "chromium",
  "Pixel 7 landscape": "chromium",
};
const wanted = options("device").length
  ? options("device")
  : ["iPhone 15", "iPhone 15 landscape", "iPad Pro 11", "Pixel 7 landscape"];
for (const d of wanted)
  if (!PROFILES[d] || !pw.devices[d]) throw new Error(`unknown device ${d}`);

/** Serves DIR at /PainKiller/ like GitHub Pages, counting the bytes it sends. */
async function serve(dir, port) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".jpg": "image/jpeg",
  };
  const base = path.resolve(dir);
  const sent = { bytes: 0, files: 0 };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!url.startsWith("/PainKiller/")) return void res.writeHead(404).end();
    const rel = url.slice("/PainKiller/".length);
    const file = path.join(
      base,
      rel === "" || rel.endsWith("/") ? rel + "index.html" : rel,
    );
    const stat =
      file.startsWith(base) && fs.statSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile()) return void res.writeHead(404).end();
    sent.bytes += stat.size;
    sent.files++;
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
      "content-length": stat.size,
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}/PainKiller/`,
    sent,
    stop: () => new Promise((r) => server.close(r)),
  };
}

/**
 * Runs in the page before the game: tallies WebGL allocations by object, the image
 * sources uploaded to textures (the copies three.js keeps), wasm memories and audio
 * contexts, with peaks.
 */
const PRELOAD = `(() => {
  const M = (window.__MEM__ = { textures: 0, buffers: 0, renderbuffers: 0, images: 0,
    peakGpu: 0, peakImages: 0, peakTextures: 0, textureCount: 0, largestTexture: 0, wasm: [] });
  window.__AUDIO__ = [];
  const A = window.AudioContext || window.webkitAudioContext;
  if (A) window.AudioContext = class extends A {
    constructor(...a) { super(...a); window.__AUDIO__.push(this); }
  };
  for (const name of ["instantiate", "instantiateStreaming"]) {
    const f = WebAssembly[name];
    WebAssembly[name] = async function (...a) {
      const r = await f.apply(this, a);
      const inst = r.instance || r;
      for (const v of Object.values(inst.exports || {}))
        if (v instanceof WebAssembly.Memory) M.wasm.push(v);
      return r;
    };
  }
  const C = window.WebGL2RenderingContext;
  if (!C) return;
  const P = C.prototype, G = WebGL2RenderingContext;
  const size = new WeakMap(), sources = new WeakSet(), live = (M.live = new Map());
  const state = (gl) => gl.__mem || (gl.__mem = { unit: 0, tex: new Map(), buf: new Map(), rb: null });
  const peak = () => {
    const gpu = M.textures + M.buffers + M.renderbuffers;
    M.peakGpu = Math.max(M.peakGpu, gpu);
    M.peakTextures = Math.max(M.peakTextures, M.textures);
    M.peakImages = Math.max(M.peakImages, M.images);
  };
  const BPP = { [G.RGBA8]: 4, [G.SRGB8_ALPHA8]: 4, [G.RGBA]: 4, [G.RGB8]: 4, [G.RGB]: 4,
    [G.RGBA16F]: 8, [G.RGBA32F]: 16, [G.RGB16F]: 8, [G.RGB32F]: 16, [G.R8]: 1, [G.RG8]: 2,
    [G.R16F]: 2, [G.RG16F]: 4, [G.R32F]: 4, [G.RG32F]: 8, [G.LUMINANCE]: 1, [G.ALPHA]: 1,
    [G.LUMINANCE_ALPHA]: 2, [G.DEPTH_COMPONENT16]: 2, [G.DEPTH_COMPONENT24]: 4,
    [G.DEPTH_COMPONENT32F]: 4, [G.DEPTH24_STENCIL8]: 4, [G.DEPTH32F_STENCIL8]: 8,
    [G.DEPTH_COMPONENT]: 4, [G.DEPTH_STENCIL]: 4, [G.R11F_G11F_B10F]: 4, [G.RGB10_A2]: 4,
    [G.RGBA8UI]: 4, [G.R8UI]: 1, [G.R32UI]: 4, [G.RGBA32UI]: 16 };
  const bpp = (fmt, type) => {
    if (fmt === G.RGBA && type === G.FLOAT) return 16;
    if (fmt === G.RGBA && type === G.HALF_FLOAT) return 8;
    return BPP[fmt] || 4;
  };
  const bindingFor = (target) =>
    target >= G.TEXTURE_CUBE_MAP_POSITIVE_X && target <= G.TEXTURE_CUBE_MAP_NEGATIVE_Z ? G.TEXTURE_CUBE_MAP : target;
  const current = (gl, target) => state(gl).tex.get(state(gl).unit + ":" + bindingFor(target));
  const setTex = (t, key, bytes) => {
    if (!t) return;
    let s = size.get(t);
    if (!s) size.set(t, (s = { parts: new Map(), total: 0 }));
    live.set(t, s);
    const old = s.parts.get(key) || 0;
    s.parts.set(key, bytes);
    s.total += bytes - old;
    M.textures += bytes - old;
    M.largestTexture = Math.max(M.largestTexture, s.total);
    peak();
  };
  const dims = (src) => [src.naturalWidth || src.videoWidth || src.displayWidth || src.width || 0,
    src.naturalHeight || src.videoHeight || src.displayHeight || src.height || 0];
  const wrap = (name, fn) => { const f = P[name]; P[name] = function (...a) { fn.call(this, ...a); return f.apply(this, a); }; };
  wrap("activeTexture", function (u) { state(this).unit = u; });
  wrap("bindTexture", function (target, t) { state(this).tex.set(state(this).unit + ":" + target, t); });
  wrap("createTexture", function () { M.textureCount++; });
  wrap("deleteTexture", function (t) {
    const s = t && size.get(t);
    if (s) { M.textures -= s.total; size.delete(t); live.delete(t); }
    if (t) M.textureCount--;
  });
  wrap("texImage2D", function (target, level, internal, ...rest) {
    let w, h, format, type, src;
    if (rest.length >= 6) [w, h, , format, type, src] = rest;
    else { [format, type, src] = rest; [w, h] = dims(src); }
    setTex(current(this, target), target + ":" + level, w * h * bpp(internal, type));
    if (src && typeof src === "object" && !ArrayBuffer.isView(src) && !sources.has(src)) {
      sources.add(src);
      const [sw, sh] = dims(src);
      M.images += sw * sh * 4;
      peak();
    }
  });
  wrap("texSubImage2D", function (...a) {
    const src = a[a.length - 1];
    if (src && typeof src === "object" && !ArrayBuffer.isView(src) && !sources.has(src) && (a.length === 7 || a.length === 9)) {
      sources.add(src);
      const [sw, sh] = dims(src);
      M.images += sw * sh * 4;
      peak();
    }
  });
  wrap("texStorage2D", function (target, levels, internal, w, h) {
    let total = 0;
    for (let l = 0; l < levels; l++) total += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(internal);
    setTex(current(this, target), "storage", total * (target === G.TEXTURE_CUBE_MAP ? 6 : 1));
  });
  wrap("texStorage3D", function (target, levels, internal, w, h, d) {
    let total = 0;
    for (let l = 0; l < levels; l++) total += Math.max(1, w >> l) * Math.max(1, h >> l) * (target === G.TEXTURE_3D ? Math.max(1, d >> l) : d) * bpp(internal);
    setTex(current(this, target), "storage", total);
  });
  wrap("texImage3D", function (target, level, internal, w, h, d, b, format, type) {
    setTex(current(this, target), "3d:" + level, w * h * d * bpp(internal, type));
  });
  wrap("compressedTexImage2D", function (target, level, internal, w, h, b, data) {
    setTex(current(this, target), target + ":" + level, data && data.byteLength || 0);
  });
  wrap("generateMipmap", function (target) {
    const t = current(this, target), s = t && size.get(t);
    // Storage textures already counted every level.
    if (s && !s.parts.has("storage")) setTex(t, "mips", Math.round((s.total - (s.parts.get("mips") || 0)) / 3));
  });
  wrap("bindBuffer", function (target, b) { state(this).buf.set(target, b); });
  wrap("bufferData", function (target, data, usage, offset, length) {
    const b = state(this).buf.get(target);
    if (!b) return;
    const bytes = typeof data === "number" ? data : length ? length * (data.BYTES_PER_ELEMENT || 1) : (data && data.byteLength) || 0;
    const old = size.get(b) || 0;
    size.set(b, bytes);
    M.buffers += bytes - old;
    peak();
  });
  wrap("deleteBuffer", function (b) { const s = b && size.get(b); if (s) { M.buffers -= s; size.delete(b); } });
  wrap("bindRenderbuffer", function (target, r) { state(this).rb = r; });
  const storage = function (samples, internal, w, h) {
    const r = state(this).rb;
    if (!r) return;
    const bytes = w * h * bpp(internal) * Math.max(1, samples), old = size.get(r) || 0;
    size.set(r, bytes);
    M.renderbuffers += bytes - old;
    peak();
  };
  wrap("renderbufferStorage", function (target, internal, w, h) { storage.call(this, 1, internal, w, h); });
  wrap("renderbufferStorageMultisample", function (target, samples, internal, w, h) { storage.call(this, samples, internal, w, h); });
  wrap("deleteRenderbuffer", function (r) { const s = r && size.get(r); if (s) { M.renderbuffers -= s; size.delete(r); } });
})()`;

/** PSS of every process descended from this one (the browsers it launched), in bytes. */
function browserMemory() {
  const parent = new Map();
  for (const pid of fs.readdirSync("/proc"))
    if (/^\d+$/.test(pid))
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        parent.set(+pid, +stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      } catch {}
  let total = 0;
  for (const pid of parent.keys()) {
    let p = pid,
      mine = false;
    for (let i = 0; i < 20 && p > 1; i++)
      if ((p = parent.get(p)) === process.pid) {
        mine = true;
        break;
      }
    if (!mine) continue;
    try {
      const m = /^Pss:\s+(\d+) kB/m.exec(
        fs.readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"),
      );
      if (m) total += +m[1] * 1024;
    } catch {}
  }
  return total;
}

const MB = (n) => (n / 1048576).toFixed(1);
const report = { url: null, started: new Date().toISOString(), runs: [] };
let failed = false;
const shots = option("shots");
if (shots) fs.mkdirSync(shots, { recursive: true });
const server = option("serve")
  ? await serve(option("serve"), Number(option("port", 5291)))
  : null;
const url = server?.url ?? target;
if (!url) {
  console.error(
    'usage: node tools/check-mobile.mjs <url> | --serve DIR [--device "iPhone 15"] [--log FILE] [--shots DIR]',
  );
  process.exit(2);
}
report.url = url;

for (const device of wanted) {
  const engine = PROFILES[device];
  const run = { device, engine, steps: [], memory: {} };
  report.runs.push(run);
  const step = (name, passed, detail = "") => {
    run.steps.push({ name, passed, detail });
    if (!passed) failed = true;
    console.log(
      `${passed ? "ok  " : "FAIL"} [${device}] ${name}${detail ? ` · ${detail}` : ""}`,
    );
  };
  const errors = [];
  let browser,
    sampler,
    peakPss = 0;
  const sample = () => (peakPss = Math.max(peakPss, browserMemory()));
  try {
    browser =
      engine === "webkit"
        ? await pw.webkit.launch({ headless: true, executablePath: WEBKIT })
        : await pw.chromium.launch({
            headless: true,
            executablePath: headlessShell(),
            args: ["--enable-unsafe-swiftshader", "--mute-audio"],
          });
    run.browser = `${engine} ${browser.version()}`;
    const context = await browser.newContext({ ...pw.devices[device] });
    const page = await context.newPage();
    await page.goto("about:blank");
    run.memory.blankPss = browserMemory();
    sampler = setInterval(sample, 500);
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    page.on("requestfailed", (r) =>
      errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`),
    );
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    await page.addInitScript(PRELOAD);

    // Touches the browser dispatches itself, so the page sees trusted pointer and
    // touch events. `points` is every finger down after this event.
    let touch;
    if (engine === "webkit") {
      const session = page._connection.toImpl(page).delegate._pageProxySession;
      touch = (type, points) =>
        session.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: points.map((p) => ({
            x: Math.round(p.x),
            y: Math.round(p.y),
            id: p.id,
          })),
        });
    } else {
      const cdp = await context.newCDPSession(page);
      touch = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : points,
        });
    }
    const box = (selector) =>
      page.evaluate((s) => {
        const e = [...document.querySelectorAll(s)].find(
          (e) => e.getClientRects().length,
        );
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          w: r.width,
          h: r.height,
        };
      }, selector);
    /** Taps `selector`, first scrolling it into view as a player would. */
    const tap = async (selector) => {
      await page.evaluate((s) => {
        const e = [...document.querySelectorAll(s)].find(
          (e) => e.getClientRects().length,
        );
        const r = e?.getBoundingClientRect();
        if (r && (r.top < 0 || r.bottom > innerHeight))
          e.scrollIntoView({ block: "center" });
      }, selector);
      await sleep(150);
      const b = await box(selector);
      if (!b) throw new Error(`nothing visible matches ${selector}`);
      await page.touchscreen.tap(b.x, b.y);
      return b;
    };
    /**
     * Holds a finger on `selector` until `done(state)` or `ms` pass. Under load the
     * game's clock can run slower than the wall clock (each frame counts at most 0.1 s),
     * so a fixed hold could end inside a weapon's cooldown.
     */
    const hold = async (selector, ms, done = () => false) => {
      const b = await box(selector);
      if (!b) throw new Error(`nothing visible matches ${selector}`);
      const p = { x: b.x, y: b.y, id: 7 };
      await touch("touchStart", [p]);
      const t0 = Date.now();
      while (Date.now() - t0 < ms && !done(await state())) await sleep(100);
      await touch("touchEnd", [p]);
    };
    const state = () =>
      page
        .evaluate(() => window.__PURGATORY__?.state?.() ?? null)
        .catch(() => null);
    const until = async (what, test, ms = 240000) => {
      const t0 = Date.now();
      for (;;) {
        const s = await state();
        if (test(s)) return s;
        const fatal = await page
          .evaluate(
            () =>
              document.querySelector(".fatal, .art-retry")?.innerText ?? null,
          )
          .catch(() => null);
        if (fatal)
          throw new Error(
            `${what}: the page shows an error: ${fatal.replace(/\s+/g, " ").slice(0, 300)}`,
          );
        if (Date.now() - t0 > ms)
          throw new Error(`${what}: timed out (mode ${s?.mode ?? "none"})`);
        await sleep(250);
      }
    };
    const memory = () =>
      page.evaluate(() => {
        const M = window.__MEM__;
        return {
          gpu: M.textures + M.buffers + M.renderbuffers,
          textures: M.textures,
          buffers: M.buffers,
          renderbuffers: M.renderbuffers,
          textureCount: M.textureCount,
          images: M.images,
          sizes: Object.entries(
            [...M.live.values()].reduce((h, t) => {
              const k = (t.total / 1048576).toFixed(1);
              h[k] = (h[k] || 0) + 1;
              return h;
            }, {}),
          )
            .sort((a, b) => b[0] * b[1] - a[0] * a[1])
            .slice(0, 6)
            .map(([mb, n]) => `${n}×${mb}`)
            .join(" "),
          peakGpu: M.peakGpu,
          peakImages: M.peakImages,
          wasm: M.wasm.reduce((n, m) => n + m.buffer.byteLength, 0),
          jsHeap: performance.memory?.usedJSHeapSize ?? null,
          canvas: [
            document.querySelector("#world")?.width,
            document.querySelector("#world")?.height,
          ],
        };
      });
    const describe = (m) =>
      `GPU ${MB(m.gpu)} MB (textures ${MB(m.textures)} in ${m.textureCount}, buffers ${MB(m.buffers)}, renderbuffers ${MB(m.renderbuffers)}), image copies ${MB(m.images)} MB, wasm ${MB(m.wasm)} MB${m.jsHeap ? `, JS heap ${MB(m.jsHeap)} MB` : ""}, canvas ${m.canvas.join("×")}; largest textures (count×MB) ${m.sizes}`;
    const shot = async (name) => {
      if (!shots) return;
      // Menus slide in; wait for them to settle.
      await page
        .waitForFunction(
          () =>
            document
              .getAnimations()
              .every(
                (a) =>
                  a.playState !== "running" ||
                  a.effect?.getTiming().iterations === Infinity,
              ),
          null,
          { timeout: 5000 },
        )
        .catch(() => {});
      await sleep(300);
      const file = path.join(
        shots,
        `${device.replace(/\s+/g, "-")}-${name}.png`,
      );
      await page
        .screenshot({ path: file, timeout: 60000 })
        .catch((e) => errors.push(`screenshot ${name}: ${e.message}`));
      run.shots = [...(run.shots ?? []), path.relative(root, file)];
    };

    const t0 = Date.now();
    if (server) server.sent.bytes = server.sent.files = 0;
    await page.goto(url, { waitUntil: "commit" });
    const s0 = await until("title screen", (s) => s?.mode === "menu");
    await sleep(500);
    run.secondsToTitle = (Date.now() - t0) / 1000;
    run.download = server ? { ...server.sent } : null;
    const env = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const d = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        size: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        coarse: matchMedia("(pointer: coarse)").matches,
        fine: matchMedia("(any-pointer: fine)").matches,
        webgl2: gl
          ? d
            ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER)
          : null,
        webgpu: "gpu" in navigator,
        touchLayout: document.body.classList.contains("touch-layout"),
      };
    });
    run.env = env;
    run.memory.title = await memory();
    run.fidelity = s0.fidelity;
    step(
      "reaches the title",
      !!(await box(".title-screen")),
      `${run.secondsToTitle.toFixed(1)} s, ${run.download ? `${MB(run.download.bytes)} MB in ${run.download.files} files` : "download not counted"}, ${env.size.join("×")} @${env.dpr}x, WebGL 2: ${env.webgl2}, ${s0.fidelity.name} fidelity, pixel ratio ${s0.fidelity.pixelRatio.toFixed(2)}`,
    );
    step("title memory", true, describe(run.memory.title));
    step(
      "touch layout on a touch-first device",
      env.touchLayout,
      `pointer coarse ${env.coarse}, any fine ${env.fine}`,
    );
    const menuControls = await page.evaluate(
      () => getComputedStyle(document.getElementById("touch-controls")).display,
    );
    step(
      "no fight controls over the menus",
      menuControls === "none",
      `display ${menuControls}`,
    );
    await shot("title");

    const audioBefore = await page.evaluate(
      () => window.__AUDIO__.filter((c) => c.state === "running").length,
    );
    await tap(".title-screen [data-default]");
    await sleep(500);
    if (await box("[data-action=begin][data-default]")) {
      await shot("difficulty");
      await tap("[data-action=begin][data-default]");
    }
    let s = await until("fight starts", (s) => s?.mode === "playing", 120000);
    await sleep(2500);
    const audioAfter = await page.evaluate(() =>
      window.__AUDIO__.map((c) => c.state),
    );
    // Headless WebKit has no audio device, so its context is made but cannot run.
    step(
      "a tap starts the fight and the sound",
      audioBefore === 0 &&
        audioAfter.length > 0 &&
        (engine === "webkit" || audioAfter.includes("running")),
      `audio contexts before the tap ${audioBefore}, after: ${audioAfter.join(", ") || "none"}`,
    );
    await shot("playing");

    // The controls: on screen, thumb-sized, inside the viewport, not overlapping.
    const layout = await page.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll(
        "#touch-controls button, #touch-move",
      )) {
        const r = e.getBoundingClientRect();
        out.push({
          name: e.dataset.touch || e.id,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          visible:
            !!e.getClientRects().length &&
            getComputedStyle(e).visibility !== "hidden",
        });
      }
      return {
        controls: out,
        size: [innerWidth, innerHeight],
        display: getComputedStyle(document.getElementById("touch-controls"))
          .display,
      };
    });
    run.controls = layout;
    const shown = layout.controls.filter((c) => c.visible);
    const small = shown.filter((c) => c.w < 44 || c.h < 44);
    const outside = shown.filter(
      (c) =>
        c.x < 0 ||
        c.y < 0 ||
        c.x + c.w > layout.size[0] ||
        c.y + c.h > layout.size[1],
    );
    const overlaps = [];
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i],
          b = shown[j];
        if (
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + b.h &&
          b.y < a.y + a.h
        )
          overlaps.push(`${a.name}/${b.name}`);
      }
    step(
      "fight controls shown",
      layout.display !== "none" && shown.length >= 10,
      `${shown.length} controls, display ${layout.display}`,
    );
    step(
      "every control at least 44 × 44",
      small.length === 0,
      small
        .map((c) => `${c.name} ${c.w.toFixed(0)}×${c.h.toFixed(0)}`)
        .join(", ") ||
        `smallest ${Math.min(...shown.map((c) => Math.min(c.w, c.h))).toFixed(0)} px`,
    );
    step(
      "controls inside the screen and apart",
      outside.length === 0 && overlaps.length === 0,
      [
        ...outside.map((c) => `${c.name} outside`),
        ...overlaps.map((o) => `${o} overlap`),
      ].join(", ") || "ok",
    );

    // Stick and look at once: finger 1 pushes the stick forward, finger 2 drags right.
    s = await state();
    const stick = await box("#touch-move");
    const lookAt = { x: layout.size[0] * 0.7, y: layout.size[1] * 0.45 };
    const start = { position: s.position, yaw: s.yaw };
    const f1 = { x: stick.x, y: stick.y, id: 1 };
    const f2 = { x: lookAt.x, y: lookAt.y, id: 2 };
    await touch("touchStart", [f1]);
    await touch("touchStart", [f1, f2]);
    for (let i = 1; i <= 20; i++) {
      f1.y = stick.y - Math.min(50, i * 5);
      f2.x = lookAt.x + i * 4;
      await touch("touchMove", [f1, f2]);
      await sleep(60);
    }
    await sleep(600);
    await touch("touchEnd", [f1, f2]);
    await sleep(300);
    s = await state();
    const walked = Math.hypot(
      s.position[0] - start.position[0],
      s.position[2] - start.position[2],
    );
    const turned = ((s.yaw - start.yaw) * 180) / Math.PI;
    step(
      "stick walks while a second finger turns",
      walked > 0.5 && Math.abs(turned) > 3,
      `walked ${walked.toFixed(2)} m, turned ${turned.toFixed(1)}° for an 80 px drag`,
    );
    await shot("moving");

    const before = (await state()).weapon;
    await tap("[data-touch=next]");
    await sleep(900);
    s = await state();
    const weapon = s.weapon,
      ammo = s.ammo[weapon],
      alt = s.altAmmo[weapon];
    await hold("[data-touch=primary]", 4000, (s) => s?.ammo[weapon] < ammo);
    await sleep(300);
    s = await state();
    step(
      "▶ switches weapon and FIRE fires",
      weapon === (before + 1) % 5 && s.ammo[weapon] < ammo,
      `weapon ${before + 1} → ${weapon + 1}, ammunition ${ammo} → ${s.ammo[weapon]}`,
    );
    await sleep(300);
    await hold("[data-touch=secondary]", 4000, (s) => s?.altAmmo[weapon] < alt);
    await sleep(300);
    s = await state();
    step(
      "ALT fires the alternate mode",
      s.altAmmo[weapon] < alt,
      `alternate ammunition ${alt} → ${s.altAmmo[weapon]}`,
    );
    const y0 = s.position[1];
    await tap("[data-touch=jump]");
    let top = y0;
    for (let i = 0; i < 8; i++) {
      await sleep(60);
      top = Math.max(top, (await state()).position[1]);
    }
    step(
      "JUMP jumps",
      top > y0 + 0.2,
      `height ${y0.toFixed(2)} → ${top.toFixed(2)} m`,
    );
    // FIRE and the stick at once, with RUN held by a third finger.
    s = await state();
    const runStart = s.position;
    const fire = await box("[data-touch=primary]"),
      runButton = await box("[data-touch=sprint]");
    const g1 = { x: stick.x, y: stick.y, id: 3 },
      g2 = { x: runButton.x, y: runButton.y, id: 4 },
      g3 = { x: fire.x, y: fire.y, id: 5 };
    const ammo2 = s.ammo[s.weapon];
    await touch("touchStart", [g1]);
    await touch("touchStart", [g1, g2]);
    await touch("touchStart", [g1, g2, g3]);
    for (let i = 1; i <= 10; i++) {
      g1.y = stick.y - i * 5;
      await touch("touchMove", [g1, g2, g3]);
      await sleep(80);
    }
    await sleep(600);
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll("#touch-controls .held")]
        .map((b) => b.dataset.touch)
        .sort()
        .join(" "),
    );
    const stickOut = await page.evaluate(() =>
      getComputedStyle(document.getElementById("touch-move")).getPropertyValue(
        "--jy",
      ),
    );
    await touch("touchEnd", [g1, g2, g3]);
    await sleep(300);
    s = await state();
    const ran = Math.hypot(
      s.position[0] - runStart[0],
      s.position[2] - runStart[2],
    );
    step(
      "three fingers: stick, RUN and FIRE together",
      ran > 0.5 && pressed === "primary sprint",
      `moved ${ran.toFixed(2)} m, held: ${pressed || "none"}, stick at ${stickOut.trim()}`,
    );
    s = await state();
    run.fps = s.fps;
    run.memory.playing = await memory();
    step(
      "frame rate in the fight",
      true,
      `${s.fps} fps (headless, software rendering, shared machine), ${s.drawCalls} draw calls`,
    );
    step("fight memory", true, describe(run.memory.playing));

    await tap("[data-touch=pause]");
    s = await until("pause", (s) => s?.mode === "paused", 10000).catch(() =>
      state(),
    );
    step("Ⅱ pauses", s?.mode === "paused", `mode ${s?.mode}`);
    const hidden = await page.evaluate(
      () => getComputedStyle(document.getElementById("touch-controls")).display,
    );
    await shot("paused");
    await tap(".pause-screen [data-action=resume]");
    s = await until("resume", (s) => s?.mode === "playing", 10000).catch(() =>
      state(),
    );
    step(
      "the pause menu works by tap",
      s?.mode === "playing" && hidden === "none",
      `mode ${s?.mode}, controls over the pause menu: ${hidden}`,
    );
    await tap("[data-touch=pause]");
    await sleep(400);
    await tap(".pause-screen [data-action=page][data-value=settings]");
    await sleep(500);
    await shot("options");
    const tabs = await page.evaluate(
      () => document.querySelectorAll("[data-action=settings-tab]").length,
    );
    step("Options opens by tap", tabs > 0, `${tabs} settings tabs`);
    await tap("[data-action=settings-tab][data-value=video]");
    await shot("options-video");
    // Back to the title, then each of its pages by tap.
    await tap(".back-command");
    await sleep(400);
    await tap(".pause-screen [data-action=menu]");
    await sleep(400);
    await tap(".confirm-dialog [data-action=confirm]");
    await until("back to the title", (s) => s?.mode === "menu", 20000);
    const pages = [];
    for (const page_ of ["campaign", "arsenal", "tarot"]) {
      await tap(`.title-screen [data-action=page][data-value=${page_}]`);
      await sleep(400);
      await shot(page_);
      const fits = await page.evaluate(() => {
        const heading = document.querySelector(".screen-heading h1");
        const r = heading?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= innerHeight;
      });
      await tap(".back-command");
      await sleep(400);
      pages.push(`${page_} ${fits ? "ok" : "heading off screen"}`);
      if (!fits) failed = true;
    }
    const back = !!(await box(".title-screen"));
    step(
      "title pages open and close by tap",
      back && pages.every((p) => p.endsWith("ok")),
      pages.join(", "),
    );

    // A second arena on top of the first: Hall of Vigils needs the cathedral scene, which
    // a phone fetches only now (a desktop has it from the background downloads).
    await tap(".title-screen [data-action=page][data-value=campaign]");
    await sleep(400);
    await tap('[data-action=select-level][data-value="1"]');
    await sleep(300);
    await tap(".level-preview [data-action=level]");
    await sleep(500);
    if (await box("[data-action=begin][data-default]"))
      await tap("[data-action=begin][data-default]");
    s = await until("Hall of Vigils", (s) => s?.mode === "playing", 180000);
    await sleep(2500);
    await shot("cathedral");
    step(
      "a second arena loads and plays",
      s.level === 1 && !s.environmentsPending.includes("cathedral"),
      `level ${s.level + 1}, still to download: ${s.environmentsPending.join(", ") || "nothing"}`,
    );
    await sleep(1500);
    sample();
    run.memory.end = await memory();
    run.memory.peakPss = peakPss;
    const end = run.memory.end;
    step(
      "memory in a second arena",
      true,
      `${describe(end)}; peaks: GPU ${MB(end.peakGpu)} MB, image copies ${MB(end.peakImages)} MB; browser processes ${MB(peakPss)} MB PSS peak (${MB(run.memory.blankPss)} MB on a blank page)`,
    );
    await sleep(500);
    run.errors = [...errors];
    step("no page errors", errors.length === 0, errors.slice(0, 8).join(" | "));
  } catch (e) {
    run.errors = [...errors];
    step("runner", false, e.message.split("\n")[0]);
    if (errors.length)
      console.log(`     page errors: ${errors.slice(0, 8).join(" | ")}`);
  } finally {
    clearInterval(sampler);
    run.memory.peakPss = Math.max(peakPss, run.memory.peakPss ?? 0);
    await browser?.close().catch(() => {});
  }
}
await server?.stop();
const log = option("log");
if (log) {
  fs.mkdirSync(path.dirname(path.resolve(log)), { recursive: true });
  fs.writeFileSync(log, JSON.stringify(report, null, 2));
}
console.log(failed ? "FAILED" : "PASSED");
process.exit(failed ? 1 : 0);

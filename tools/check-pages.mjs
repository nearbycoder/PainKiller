// Checks the GitHub Pages build in a headless browser, as it is served.
//
//   node tools/check-pages.mjs https://nearbycoder.github.io/PainKiller/
//   node tools/check-pages.mjs --serve pages            # serve pages/ under /PainKiller/
//   node tools/check-pages.mjs <url> --browser firefox  # the system Firefox (default chromium)
//   node tools/check-pages.mjs <url> --play             # also play, change a setting, reload
//   node tools/check-pages.mjs <url> --log artifacts/pages-chromium.json
//
// Exits 0 only when the game reaches its title screen with no page errors: no uncaught
// exception, no console error and no failed or 4xx/5xx request. --play also starts a
// fight from the title with a real click (checking that sound starts only after it),
// checks the touch controls stay hidden, walks, fires, pauses, raises Graphics fidelity
// on the Options page, and reloads to check the setting and the saved progress survive.
// Nothing needs installing: Chromium is Playwright's cached chrome-headless-shell (or
// --chromium PATH / $CHROMIUM) over the DevTools protocol, Firefox speaks WebDriver BiDi. Each browser runs headless in a
// throwaway profile under artifacts/ that is deleted afterwards, muted.
import { spawn } from "node:child_process";
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
const flag = (name) => args.includes("--" + name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browserName = option("browser", "chromium");
const timeout = Number(option("timeout", 240)) * 1000;
const valued = new Set([
  "--browser",
  "--timeout",
  "--log",
  "--serve",
  "--chromium",
]);
const target = args.find(
  (a, i) => !a.startsWith("--") && !valued.has(args[i - 1]),
);
if (!target && !option("serve")) {
  console.error(
    "usage: node tools/check-pages.mjs <url> | --serve DIR [--browser chromium|firefox] [--play] [--log FILE]",
  );
  process.exit(2);
}

/** Serves DIR at /PainKiller/ only, like GitHub Pages: static files, no special headers. */
async function serve(dir) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };
  const base = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!url.startsWith("/PainKiller/")) return void res.writeHead(404).end();
    const rel = url.slice("/PainKiller/".length);
    const file = path.join(
      base,
      rel === "" || rel.endsWith("/") ? rel + "index.html" : rel,
    );
    if (
      !file.startsWith(base) ||
      !fs.statSync(file, { throwIfNoEntry: false })?.isFile()
    )
      return void res.writeHead(404).end();
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/PainKiller/`,
    stop: () => server.close(),
  };
}

/** Records every AudioContext, so a check can tell when sound started. Runs before the game. */
const PRELOAD = `(() => {
  const A = window.AudioContext;
  window.__CHECK_AUDIO__ = [];
  if (A) window.AudioContext = class extends A {
    constructor(...a) { super(...a); window.__CHECK_AUDIO__.push(this); }
  };
})()`;

function profileDir(name) {
  const dir = path.join(
    root,
    "artifacts",
    `check-pages-${name}-${process.pid}`,
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Collects stderr until `pattern` appears; returns the match. */
function waitForLine(proc, pattern, what) {
  return new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(new Error(`${what} did not start:\n${text.slice(-2000)}`)),
      60000,
    );
    proc.stderr.on("data", (d) => {
      if (text.length < 50000) text += d;
      const m = pattern.exec(text);
      if (m) (clearTimeout(timer), resolve(m));
    });
    proc.once("exit", () =>
      reject(new Error(`${what} exited:\n${text.slice(-2000)}`)),
    );
  });
}

function rpc(ws, onEvent) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const [resolve, reject, method] = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error)
        reject(
          new Error(
            `${method}: ${JSON.stringify(msg.error)} ${msg.message ?? ""}`,
          ),
        );
      else resolve(msg.result);
    } else onEvent(msg);
  };
  return (method, params = {}, extra = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, [resolve, reject, method]);
      ws.send(JSON.stringify({ id: i, method, params, ...extra }));
    });
}

function findChromium() {
  const given = option("chromium") ?? process.env.CHROMIUM;
  if (given) return [given, false];
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  const dirs = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().reverse()
    : [];
  for (const d of dirs.filter((d) =>
    d.startsWith("chromium_headless_shell-"),
  )) {
    const exe = path.join(
      cache,
      d,
      "chrome-headless-shell-linux64",
      "chrome-headless-shell",
    );
    if (fs.existsSync(exe)) return [exe, true];
  }
  for (const d of dirs.filter((d) => /^chromium-\d/.test(d))) {
    const exe = path.join(cache, d, "chrome-linux64", "chrome");
    if (fs.existsSync(exe)) return [exe, false];
  }
  throw new Error("No Chromium found; pass --chromium PATH");
}

/** Headless Chromium over the DevTools protocol. */
async function chromium() {
  const [exe, shell] = findChromium();
  const profile = profileDir("chromium");
  const proc = spawn(
    exe,
    [
      ...(shell ? [] : ["--headless=new"]),
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--mute-audio",
      "--enable-unsafe-swiftshader",
      "--window-size=1280,800",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const [, wsUrl] = await waitForLine(
    proc,
    /DevTools listening on (ws:\/\/\S+)/,
    "Chromium",
  );
  const ws = new WebSocket(wsUrl);
  await new Promise(
    (resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)),
  );
  const errors = [];
  let session;
  const send = rpc(ws, ({ method, params, sessionId }) => {
    if (sessionId !== session) return;
    if (method === "Runtime.exceptionThrown")
      errors.push(
        params.exceptionDetails.exception?.description ??
          params.exceptionDetails.text,
      );
    else if (method === "Runtime.consoleAPICalled" && params.type === "error")
      errors.push(
        "console.error: " +
          params.args.map((a) => a.value ?? a.description).join(" "),
      );
    else if (method === "Log.entryAdded" && params.entry.level === "error")
      errors.push(`${params.entry.text} ${params.entry.url ?? ""}`.trim());
    else if (
      method === "Network.responseReceived" &&
      params.response.status >= 400
    )
      errors.push(`HTTP ${params.response.status} ${params.response.url}`);
    else if (method === "Network.loadingFailed" && !params.canceled)
      errors.push(`request failed: ${params.errorText} (${params.type})`);
  });
  const version = (await send("Browser.getVersion")).product;
  const { targetInfos } = await send("Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  session = (
    await send("Target.attachToTarget", {
      targetId: page.targetId,
      flatten: true,
    })
  ).sessionId;
  const s = (method, params) => send(method, params, { sessionId: session });
  for (const domain of ["Page", "Runtime", "Log", "Network"])
    await s(`${domain}.enable`);
  await s("Page.addScriptToEvaluateOnNewDocument", { source: PRELOAD });
  const keyInfo = (key) =>
    ({
      Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
      Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
      ArrowRight: { code: "ArrowRight", windowsVirtualKeyCode: 39 },
      KeyW: { code: "KeyW", windowsVirtualKeyCode: 87, key: "w", text: "w" },
      Digit2: {
        code: "Digit2",
        windowsVirtualKeyCode: 50,
        key: "2",
        text: "2",
      },
    })[key];
  return {
    version,
    errors,
    async navigate(url) {
      await s("Page.navigate", { url });
    },
    async reload() {
      await s("Page.reload");
    },
    async js(expression) {
      const r = await s("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails)
        throw new Error(
          r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
        );
      return r.result.value;
    },
    async key(key, type) {
      const { code, windowsVirtualKeyCode, text, key: k = key } = keyInfo(key);
      for (const t of type ? [type] : ["keyDown", "keyUp"])
        await s("Input.dispatchKeyEvent", {
          type: t,
          key: k,
          code,
          windowsVirtualKeyCode,
          ...(t === "keyDown" && text ? { text } : {}),
        });
    },
    async click(x, y, hold = 80) {
      await s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await s("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      await sleep(hold);
      await s("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    },
    async close() {
      try {
        await send("Browser.close");
      } catch {}
      ws.close();
      if (proc.exitCode === null) {
        const exited = new Promise((r) => proc.once("exit", r));
        if (!(await Promise.race([exited.then(() => true), sleep(5000)])))
          proc.kill();
        await exited;
      }
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

/** Headless Firefox over WebDriver BiDi. */
async function firefox() {
  const profile = profileDir("firefox");
  fs.writeFileSync(
    path.join(profile, "user.js"),
    [
      ["media.volume_scale", '"0.0"'],
      ["browser.shell.checkDefaultBrowser", "false"],
      ["datareporting.policy.dataSubmissionEnabled", "false"],
      ["toolkit.telemetry.reportingpolicy.firstRun", "false"],
      ["browser.startup.homepage_override.mstone", '"ignore"'],
      ["app.update.disabledForTesting", "true"],
    ]
      .map(([k, v]) => `user_pref("${k}", ${v});`)
      .join("\n"),
  );
  const proc = spawn(
    "firefox",
    [
      "--headless",
      "--no-remote",
      "-profile",
      profile,
      "--remote-debugging-port=0",
      "--window-size=1280,800",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const [, port] = await waitForLine(
    proc,
    /WebDriver BiDi listening on ws:\/\/127\.0\.0\.1:(\d+)/,
    "Firefox",
  );
  const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise(
    (resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)),
  );
  const errors = [];
  const send = rpc(ws, ({ method, params }) => {
    if (method === "log.entryAdded" && params.level === "error")
      errors.push(
        params.stackTrace ? `${params.text} (${params.type})` : params.text,
      );
    else if (
      method === "network.responseCompleted" &&
      params.response.status >= 400
    )
      errors.push(`HTTP ${params.response.status} ${params.response.url}`);
    else if (method === "network.fetchError")
      errors.push(`request failed: ${params.errorText} ${params.request.url}`);
  });
  const { capabilities } = await send("session.new", { capabilities: {} });
  await send("session.subscribe", {
    events: [
      "log.entryAdded",
      "network.responseCompleted",
      "network.fetchError",
    ],
  });
  await send("script.addPreloadScript", {
    functionDeclaration: `() => ${PRELOAD}`,
  });
  const context = (await send("browsingContext.getTree")).contexts[0].context;
  const keys = {
    Enter: "\uE007",
    Escape: "\uE00C",
    ArrowRight: "\uE014",
    KeyW: "w",
    Digit2: "2",
  };
  return {
    version: `Firefox ${capabilities.browserVersion}`,
    errors,
    async navigate(url) {
      await send("browsingContext.navigate", { context, url, wait: "none" });
    },
    async reload() {
      await send("browsingContext.reload", { context, wait: "none" });
    },
    async js(source) {
      const r = await send("script.evaluate", {
        expression: `Promise.resolve(${source}).then((r) => JSON.stringify(r === undefined ? null : r))`,
        target: { context },
        awaitPromise: true,
      });
      if (r.type === "exception") throw new Error(r.exceptionDetails.text);
      return JSON.parse(r.result.value);
    },
    async key(key, type) {
      const value = keys[key];
      const actions = type
        ? [{ type, value }]
        : [
            { type: "keyDown", value },
            { type: "keyUp", value },
          ];
      await send("input.performActions", {
        context,
        actions: [{ type: "key", id: "keyboard", actions }],
      });
    },
    async click(x, y, hold = 80) {
      await send("input.performActions", {
        context,
        actions: [
          {
            type: "pointer",
            id: "mouse",
            actions: [
              { type: "pointerMove", x: Math.round(x), y: Math.round(y) },
              { type: "pointerDown", button: 0 },
              { type: "pause", duration: hold },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      });
    },
    async close() {
      try {
        await send("session.end");
      } catch {}
      ws.close();
      if (proc.exitCode === null) {
        const exited = new Promise((r) => proc.once("exit", r));
        if (!(await Promise.race([exited.then(() => true), sleep(5000)])))
          proc.kill();
        await exited;
      }
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

const report = { browser: browserName, steps: [] };
let failed = false;
const step = (name, passed, detail = "") => {
  report.steps.push({ name, passed, detail });
  if (!passed) failed = true;
  console.log(
    `${passed ? "ok  " : "FAIL"} ${name}${detail ? ` · ${detail}` : ""}`,
  );
};
const state = (b) =>
  b.js("window.__PURGATORY__?.state?.() ?? null").catch(() => null);
async function until(b, what, test, ms = timeout) {
  const started = Date.now();
  for (;;) {
    const s = await state(b);
    if (test(s)) return s;
    const fatal = await b
      .js("document.querySelector('.fatal, .art-retry')?.innerText ?? null")
      .catch(() => null);
    if (fatal)
      throw new Error(
        `${what}: the page shows an error: ${fatal.replace(/\s+/g, " ").slice(0, 300)}`,
      );
    const missing = b.errors.find(
      (e) => /^HTTP \d+ /.test(e) && e.endsWith(" " + url),
    );
    if (missing)
      throw new Error(`${what}: the page itself failed (${missing})`);
    if (Date.now() - started > ms)
      throw new Error(
        `${what}: timed out after ${ms / 1000}s (mode ${s?.mode ?? "none"})`,
      );
    await sleep(250);
  }
}
/** The centre of the first visible element matching `selector`, in CSS pixels. */
const centre = (b, selector) =>
  b.js(
    `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.offsetParent); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
async function press(b, selector) {
  const at = await centre(b, selector);
  if (!at) throw new Error(`nothing visible matches ${selector}`);
  await b.click(at[0], at[1]);
}
const audioRunning = (b) =>
  b.js("window.__CHECK_AUDIO__.filter((c) => c.state === 'running').length");
const downloaded = (b) =>
  b.js(
    `(() => { const all = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]; return { files: all.length, bytes: all.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0) }; })()`,
  );

const server = option("serve") ? await serve(option("serve")) : null;
const url = server?.url ?? target;
let b;
try {
  b = browserName === "firefox" ? await firefox() : await chromium();
  report.version = b.version;
  report.url = url;
  console.log(`${b.version} · ${url}`);
  const t0 = Date.now();
  await b.navigate(url);
  await until(b, "title screen", (s) => s?.mode === "menu");
  await until(b, "title screen", () => true, 1); // surface a fatal screen shown at once
  const title = await b.js("!!document.querySelector('.title-screen')");
  report.secondsToTitle = (Date.now() - t0) / 1000;
  report.download = await downloaded(b);
  report.webgl = await b.js(
    "(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null; })()",
  );
  step(
    "reaches the title screen",
    title,
    `${report.secondsToTitle.toFixed(1)} s, ${(report.download.bytes / 1048576).toFixed(1)} MB in ${report.download.files} files, WebGL 2: ${report.webgl}`,
  );

  const titleTouch = await b.js(
    "document.body.classList.contains('touch-layout')",
  );
  if (flag("play")) {
    const before = await audioRunning(b);
    step(
      "no sound before any input",
      before === 0,
      `${before} running audio contexts`,
    );
    await press(b, ".title-screen [data-default]");
    await sleep(300);
    // A first game asks for the difficulty.
    if (await centre(b, "[data-action=begin][data-default]"))
      await press(b, "[data-action=begin][data-default]");
    let s = await until(b, "fight starts", (s) => s?.mode === "playing");
    await sleep(500);
    const after = await audioRunning(b);
    step(
      "sound starts after the first click",
      after > 0,
      `${after} running audio contexts`,
    );
    // The browser may refuse pointer lock headless; the fight then waits for a click.
    const start = s.position;
    await b.click(640, 400);
    await b.key("KeyW", "keyDown");
    await sleep(1500);
    await b.key("KeyW", "keyUp");
    await b.click(640, 400);
    await sleep(400);
    s = await state(b);
    const moved = Math.hypot(
      s.position[0] - start[0],
      s.position[2] - start[2],
    );
    // A desktop with a mouse never shows the phone and tablet controls, from the start
    // or in a fight.
    const touch = await b.js(
      "({ layout: document.body.classList.contains('touch-layout'), controls: getComputedStyle(document.getElementById('touch-controls')).display })",
    );
    step(
      "no touch controls on the desktop",
      !titleTouch && !touch.layout && touch.controls === "none",
      `touch layout at the title ${titleTouch}, in the fight ${touch.layout}; controls ${touch.controls}`,
    );
    step(
      "walks forward with W",
      moved > 0.5,
      `${moved.toFixed(2)} m, level ${s.level + 1} sector ${s.room + 1}, ${s.fps} fps`,
    );
    await b.key("Digit2");
    await sleep(800);
    const loaded = (await state(b)).ammo[1];
    await b.click(640, 400, 1200);
    await sleep(300);
    s = await state(b);
    step(
      "switches weapon with 2 and fires with the mouse",
      s.weapon === 1 && s.ammo[1] < loaded,
      `weapon ${s.weapon + 1}, ammunition ${loaded} → ${s.ammo[1]}`,
    );
    await b.key("Escape");
    s = await until(b, "pause", (s) => s?.mode === "paused", 10000).catch(() =>
      state(b),
    );
    step("Esc pauses", s?.mode === "paused", `mode ${s?.mode}`);
    await press(b, ".pause-screen [data-action=menu]");
    await sleep(300);
    await press(b, ".confirm-dialog [data-action=confirm]"); // "Leave the fight?"
    await until(b, "back to the title", (s) => s?.mode === "menu", 15000);
    const quit = await b.js("!!document.querySelector('[data-action=quit]')");
    step("no Quit button in the browser", !quit);

    await press(b, ".title-screen [data-action=page][data-value=settings]");
    await sleep(300);
    await press(b, "[data-action=settings-tab][data-value=video]");
    await sleep(300);
    const was = (await state(b)).fidelity;
    await b.js("document.querySelector('#quality').focus()");
    await b.key("ArrowRight");
    await sleep(500);
    const now = (await state(b)).fidelity;
    step(
      "Graphics fidelity changes from the Options page",
      now.step === was.step + 1,
      `${was.name} → ${now.name}`,
    );
    await b.reload();
    s = await until(b, "title after reload", (s) => s?.mode === "menu");
    step(
      "the setting survives a reload",
      s.fidelity.step === now.step,
      `${s.fidelity.name} after reload`,
    );
    // Sector 1 of level 1 with no kills is not yet a "Continue", but its checkpoint is saved.
    const save = await b.js(
      "JSON.parse(localStorage.getItem('purgatory.save'))?.resume ?? null",
    );
    step(
      "the save is kept in browser storage across a reload",
      save?.level === 0 && save?.room === 0,
      save
        ? `checkpoint: level ${save.level + 1}, sector ${save.room + 1}, wave ${save.wave}`
        : "no save",
    );
  }
  // Let late errors (background downloads, a frame or two) arrive.
  await sleep(2000);
  report.errors = [...b.errors];
  step(
    "no page errors",
    b.errors.length === 0,
    b.errors.slice(0, 10).join(" | "),
  );
} catch (e) {
  report.errors = b ? [...b.errors] : [];
  step("runner", false, e.message);
  if (report.errors.length)
    console.log(`     page errors: ${report.errors.slice(0, 10).join(" | ")}`);
} finally {
  await b?.close().catch(() => {});
  server?.stop();
}
const log = option("log");
if (log) {
  fs.mkdirSync(path.dirname(path.resolve(log)), { recursive: true });
  fs.writeFileSync(path.resolve(log), JSON.stringify(report, null, 1));
  console.log("wrote", log);
}
console.log(failed ? "FAILED" : "PASSED");
process.exit(failed ? 1 : 0);

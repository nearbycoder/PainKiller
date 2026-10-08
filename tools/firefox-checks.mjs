// Runs the browser scenario checks, or plays a production build, in the system Firefox.
//
//   node tools/firefox-checks.mjs                          # every tests/*-checks.js on a dev server
//   node tools/firefox-checks.mjs --checks menu,round4     # a subset
//   node tools/firefox-checks.mjs --url http://localhost:5187/   # reuse a running dev server
//   node tools/firefox-checks.mjs --serve dist --capture docs/media/x.jpg   # play a build
//
// Firefox is driven headless over WebDriver BiDi, which it has built in, so nothing needs
// installing. It runs in a throwaway profile under artifacts/ that is deleted afterwards,
// never your own. A check's "__RUNNER__ size WxH" log resizes the viewport; Firefox has
// no touch emulation here, so "__RUNNER__ touch on|off" is answered with
// window.__RUNNER_TOUCH__ = false; "__RUNNER__ key <name>" presses a real key through
// WebDriver BiDi input actions and then sets window.__RUNNER_KEY__. Exits non-zero if
// any check fails, a script throws, or the page logs an error.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? undefined : args[i + 1];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** A static file server for a production build (no server code needed). */
async function serve(dir) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };
  const base = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(base, url.endsWith("/") ? url + "index.html" : url);
    if (!file.startsWith(base) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${port}/`, stop: () => server.close() };
}

async function devServer() {
  const port = await freePort();
  const vite = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: root, stdio: "ignore" },
  );
  return { url: `http://localhost:${port}/`, stop: () => vite.kill() };
}

async function waitForPort(url, ms) {
  const { port, hostname } = new URL(url);
  const started = Date.now();
  while (
    !(await new Promise((resolve) =>
      net
        .connect(Number(port) || 80, hostname, function () {
          this.end();
          resolve(true);
        })
        .on("error", () => resolve(false)),
    ))
  ) {
    if (Date.now() - started > ms)
      throw new Error("Nothing listening at " + url);
    await sleep(300);
  }
}

/** Starts headless Firefox in a fresh profile and opens a BiDi session. */
async function firefox() {
  const profile = path.join(
    root,
    "artifacts",
    `firefox-profile-${process.pid}`,
  );
  fs.mkdirSync(profile, { recursive: true });
  // Quiet, offline-friendly defaults; audio is muted so checks make no noise.
  fs.writeFileSync(
    path.join(profile, "user.js"),
    [
      ["media.volume_scale", '"0.0"'],
      ["media.autoplay.default", "0"],
      ["browser.shell.checkDefaultBrowser", "false"],
      ["datareporting.policy.dataSubmissionEnabled", "false"],
      ["toolkit.telemetry.reportingpolicy.firstRun", "false"],
      ["browser.startup.homepage_override.mstone", '"ignore"'],
      ["app.update.disabledForTesting", "true"],
    ]
      .map(([k, v]) => `user_pref("${k}", ${v});`)
      .join("\n"),
  );
  const port = await freePort();
  const proc = spawn(
    "firefox",
    [
      "--headless",
      "--no-remote",
      "-profile",
      profile,
      `--remote-debugging-port=${port}`,
      "--window-size=1280,800",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  proc.stderr.on("data", (d) => {
    if (stderr.length < 20000) stderr += d;
  });
  const kill = () => {
    proc.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  };
  const started = Date.now();
  while (!stderr.includes("WebDriver BiDi listening")) {
    if (proc.exitCode !== null || Date.now() - started > 60000)
      throw (kill(), new Error("Firefox did not start:\n" + stderr));
    await sleep(200);
  }
  const ws = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map(),
    logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "log.entryAdded") {
      logs.push(msg.params);
      const size = /^__RUNNER__ size (\d+)x(\d+)$/.exec(msg.params.text);
      if (size)
        void send("browsingContext.setViewport", {
          context,
          viewport: { width: Number(size[1]), height: Number(size[2]) },
        });
      const key = /^__RUNNER__ key (ArrowLeft|ArrowRight|Enter)$/.exec(
        msg.params.text,
      );
      if (key) {
        const value = {
          ArrowLeft: "\uE012",
          ArrowRight: "\uE014",
          Enter: "\uE007",
        }[key[1]];
        void send("input.performActions", {
          context,
          actions: [
            {
              type: "key",
              id: "keyboard",
              actions: [
                { type: "keyDown", value },
                { type: "keyUp", value },
              ],
            },
          ],
        }).then(() =>
          send("script.evaluate", {
            expression: `window.__RUNNER_KEY__ = ${JSON.stringify(key[1])}`,
            target: { context },
            awaitPromise: false,
          }),
        );
      }
      if (/^__RUNNER__ touch (on|off)$/.test(msg.params.text))
        void send("script.evaluate", {
          expression: "window.__RUNNER_TOUCH__ = false",
          target: { context },
          awaitPromise: false,
        });
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (msg) =>
        msg.type === "error"
          ? reject(new Error(`${method}: ${msg.error} ${msg.message}`))
          : resolve(msg.result),
      );
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  let context, version;
  try {
    const { capabilities } = await send("session.new", { capabilities: {} });
    version = `Firefox ${capabilities.browserVersion}`;
    await send("session.subscribe", { events: ["log.entryAdded"] });
    context = (await send("browsingContext.getTree")).contexts[0].context;
  } catch (e) {
    ws.close();
    kill();
    throw e;
  }
  const close = async () => {
    try {
      await send("session.end");
    } catch {}
    ws.close();
    proc.kill();
    await new Promise((r) =>
      proc.exitCode !== null ? r() : proc.once("exit", r),
    );
    fs.rmSync(profile, { recursive: true, force: true });
  };
  /** Evaluates a script's completion value (awaiting a promise) and returns it as JSON. */
  const js = async (source) => {
    const expression = `Promise.resolve(eval(${JSON.stringify(source)})).then((r) => JSON.stringify(r === undefined ? null : r))`;
    const result = await send("script.evaluate", {
      expression,
      target: { context },
      awaitPromise: true,
    });
    if (result.type === "exception")
      throw new Error(result.exceptionDetails.text);
    return JSON.parse(result.result.value);
  };
  return { send, js, context, logs, close, version };
}

const ff = await firefox();
const server = option("serve")
  ? await serve(option("serve"))
  : option("url")
    ? { url: option("url"), stop() {} }
    : await devServer();
let failed = 0;
const report = { browser: ff.version };
try {
  console.log(`${ff.version}, ${server.url}`);
  await waitForPort(server.url, 60000);
  await ff.send("browsingContext.navigate", {
    context: ff.context,
    url: server.url,
    wait: "complete",
  });
  const started = Date.now();
  // Development builds expose the game; production builds only the read-only state.
  // --no-boot: run the scripts at once, to watch the start-up screen itself.
  while (
    !process.argv.includes("--no-boot") &&
    !(await ff.js("window.__PURGATORY__?.state?.().mode === 'menu'"))
  ) {
    if (Date.now() - started > 180000)
      throw new Error("The game did not reach the menu");
    await sleep(500);
  }
  report.renderer = await ff.js(
    "(() => { const gl = document.createElement('canvas').getContext('webgl2'); return gl && gl.getParameter(gl.RENDERER); })()",
  );
  console.log("WebGL 2:", report.renderer);
  const all = fs
    .readdirSync(path.join(root, "tests"))
    .filter((f) => f.endsWith("-checks.js"))
    .map((f) => f.replace(/-checks\.js$/, ""));
  const names = option("checks")?.split(",") ?? (option("serve") ? [] : all);
  for (const name of names) {
    const t0 = Date.now();
    const file = name.endsWith(".js")
      ? path.resolve(name)
      : path.join(root, "tests", `${name}-checks.js`);
    try {
      const result = await ff.js(fs.readFileSync(file, "utf8"));
      report[name] = result;
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      if (Array.isArray(result) && result.every((r) => "passed" in r)) {
        const bad = result.filter((r) => !r.passed);
        failed += bad.length;
        console.log(
          `${bad.length ? "FAIL" : "ok  "} ${name}: ${result.length - bad.length}/${result.length} (${seconds}s)`,
        );
        for (const r of bad) console.log(`     ✗ ${r.name}: ${r.error}`);
      } else console.log(`ok   ${name} (${seconds}s)`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}: ${e.message}`);
    }
  }
  const errors = ff.logs.filter((l) => l.level === "error");
  report.errors = errors.map((l) => l.text);
  if (errors.length) {
    failed += errors.length;
    console.log(`FAIL page errors:\n  ${report.errors.join("\n  ")}`);
  }
  const capture = option("capture");
  if (capture) {
    const shot = await ff.send("browsingContext.captureScreenshot", {
      context: ff.context,
      format: { type: "image/jpeg", quality: 0.88 },
    });
    fs.mkdirSync(path.dirname(path.resolve(capture)), { recursive: true });
    fs.writeFileSync(path.resolve(capture), Buffer.from(shot.data, "base64"));
    console.log("captured", capture);
  }
  const out = option("out");
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), JSON.stringify(report, null, 1));
    console.log("wrote", out);
  }
} catch (e) {
  failed++;
  console.error("RUNNER", e);
} finally {
  server.stop();
  await ff.close();
}
process.exit(failed ? 1 : 0);

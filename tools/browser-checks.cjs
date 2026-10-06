// Runs tests/*-checks.js (and the balance autopilot) in an offscreen Electron window.
//
//   npm run test:browser                               # every scenario check
//   npm run test:browser -- --checks menu,improvement  # a subset
//   npm run test:browser -- --checks tests/balance-autopilot.js --out artifacts/balance.json
//   npm run test:browser -- --before 'window.__AUTOPILOT__ = { seeds: 1 }' --checks tests/balance-autopilot.js
//   npm run test:browser -- --url http://localhost:5187/   # reuse a running dev server
//   npm run test:browser -- --checks tools/media/round3/gate.js --capture docs/media/x.jpg
//
// --capture saves a JPEG of the window after the last script has run (a script may
// return a promise; the runner waits for it and then for two rendered frames).
//
// Without --url it starts its own Vite dev server on a free port and stops it afterwards.
// Exits non-zero if any check fails, a script throws, or the renderer logs an error.
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? undefined : args[i + 1];
};
const all = fs
  .readdirSync(path.join(root, "tests"))
  .filter((f) => f.endsWith("-checks.js"))
  .map((f) => f.replace(/-checks\.js$/, ""));
const names = option("checks")?.split(",") ?? all;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function devServer() {
  const port = await freePort();
  const vite = spawn(
    process.execPath.includes("electron") ? "node" : process.execPath,
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

app.whenReady().then(async () => {
  const server = option("url")
    ? { url: option("url"), stop() {} }
    : await devServer();
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    useContentSize: true,
    // An in-memory session: saves and options left by earlier runs cannot leak in.
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      partition: "browser-checks",
    },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  const errors = [];
  wc.on("console-message", (e) => {
    if (e.level === "error") errors.push(e.message);
  });
  const js = (code) => wc.executeJavaScript(code);
  let failed = 0;
  const report = {};
  try {
    const started = Date.now();
    const { port, hostname } = new URL(server.url);
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
      if (Date.now() - started > 60000)
        throw new Error("No dev server at " + server.url);
      await new Promise((r) => setTimeout(r, 300));
    }
    await win.loadURL(server.url);
    while (!(await js("!!window.__PURGATORY__?.game"))) {
      if (Date.now() - started > 180000)
        throw new Error("The game did not boot");
      await new Promise((r) => setTimeout(r, 300));
    }
    if (option("before")) await js(option("before"));
    for (const name of names) {
      const t0 = Date.now();
      const file = name.endsWith(".js")
        ? path.resolve(name)
        : path.join(root, "tests", `${name}-checks.js`);
      try {
        const result = await js(fs.readFileSync(file, "utf8"));
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
        console.log(`FAIL ${name}: ${e}`);
      }
    }
    if (errors.length) {
      failed += errors.length;
      console.log(`FAIL renderer console errors:\n  ${errors.join("\n  ")}`);
    }
    const capture = option("capture");
    if (capture) {
      await js(
        "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))",
      );
      const image = await wc.capturePage();
      fs.mkdirSync(path.dirname(path.resolve(capture)), { recursive: true });
      fs.writeFileSync(path.resolve(capture), image.toJPEG(88));
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
    app.exit(failed ? 1 : 0);
  }
});

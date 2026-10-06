// Renders the level-select previews (public/assets/previews/level-N.jpg) from the game itself:
// the start view of each level's first sector, without HUD or weapon.
//
//   npx electron tools/make-previews.cjs                    # all 24 levels
//   npx electron tools/make-previews.cjs --levels 4,5,6     # some of them
//   npx electron tools/make-previews.cjs --url http://localhost:5187/
//
// Without --url it starts its own Vite dev server on a free port and stops it afterwards.
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
const out = path.join(root, "public/assets/previews");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devServer() {
  const port = await new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
  const vite = spawn("node", [path.join(root, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: "ignore",
  });
  return { url: `http://localhost:${port}/`, stop: () => vite.kill() };
}

app.whenReady().then(async () => {
  const server = option("url") ? { url: option("url"), stop() {} } : await devServer();
  const win = new BrowserWindow({
    show: false,
    width: 960,
    height: 540,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, partition: "make-previews" },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  const js = (code) => wc.executeJavaScript(code);
  let code = 0;
  try {
    for (let t = Date.now(); ; ) {
      try {
        await win.loadURL(server.url);
        break;
      } catch (e) {
        if (Date.now() - t > 60000) throw e;
        await sleep(500);
      }
    }
    while (!(await js("!!window.__PURGATORY__?.game"))) await sleep(300);
    const count = await js("window.__PURGATORY__.campaign.length");
    const levels = option("levels")?.split(",").map(Number) ?? [...Array(count).keys()];
    for (const level of levels) {
      await js(`(() => {
        const api = window.__PURGATORY__, g = api.game;
        g.sound.setVolume(0);
        api.start(${level}, 0, false);
        g.waveDelay = 9999;
        g.yaw = 0;
        g.pitch = 0.03;
        g.toastTimer = 0;
        g.weaponModels.forEach((w) => (w.root.visible = false));
        document.getElementById("app").style.visibility = "hidden";
      })()`);
      await sleep(900);
      const image = (await wc.capturePage()).resize({ width: 480, height: 270, quality: "best" });
      fs.writeFileSync(path.join(out, `level-${level}.jpg`), image.toJPEG(86));
      console.log("preview", level);
    }
    await js(`(() => {
      const g = window.__PURGATORY__.game;
      document.getElementById("app").style.visibility = "";
      g.setMode("menu");
    })()`);
  } catch (e) {
    console.error(e);
    code = 1;
  } finally {
    server.stop();
    app.exit(code);
  }
});

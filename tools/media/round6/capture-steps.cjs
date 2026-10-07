// Runs window.__steps[i]() one at a time against a dev server and saves a JPEG and a PNG of
// the window after each step, in an offscreen window with an in-memory session.
//   npx electron tools/media/round6/capture-steps.cjs <url> <steps.js> <outdir> [WxH]
// e.g. npx electron tools/media/round6/capture-steps.cjs http://localhost:5187/ \
//        tools/media/round6/crosshair-scenes.js artifacts/r6/crosshair
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const [url, stepsFile, outDir, size = "1280x800"] = process.argv.slice(2);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.whenReady().then(async () => {
  const [width, height] = size.split("x").map(Number);
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, partition: "explore" },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  wc.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") console.log("console:", e.message.slice(0, 300));
  });
  const js = (c) => wc.executeJavaScript(c);
  try {
    await win.loadURL(url);
    while (!(await js("!!window.__PURGATORY__?.game"))) await new Promise((r) => setTimeout(r, 300));
    await js(fs.readFileSync(path.resolve(stepsFile), "utf8"));
    const n = await js("window.__steps.length");
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < n; i++) {
      const note = await js(`Promise.resolve(window.__steps[${i}]()).then((x) => JSON.stringify(x ?? null))`);
      await js("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
      const image = await wc.capturePage();
      const file = path.join(outDir, String(i).padStart(2, "0") + ".jpg");
      fs.writeFileSync(file, image.toJPEG(80));
      fs.writeFileSync(file.replace(/\.jpg$/, ".png"), image.toPNG());
      console.log(file, note);
    }
  } catch (e) {
    console.log("ERROR", e);
  } finally {
    app.exit(0);
  }
});

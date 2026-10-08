// Deterministic media capture for README screenshots and the trailer.
//
//   npx vite --port 5199 --strictPort &      # dev build exposes the scripted game API
//   npx electron tools/media/capture.cjs --video all --stills all --audio
//
// Options: --url <dev server>  --out <dir, default captures/>  --video <shot,...|all>
//          --stills <shot,...|all>  --audio (render SFX stems + score to WAV)
// Frames are rendered offscreen at 1920x1080 in virtual time and piped to ffmpeg.
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const url = option("url", "http://localhost:5199/");
const out = path.resolve(option("out", "captures"));
const W = 1920,
  H = 1080,
  FPS = 30;

// Keep Chromium's profile with the captures, never in a shared ~/.config/Electron.
app.setPath("userData", path.join(out, "electron-profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

function encoder(file) {
  const ffmpeg = spawn(
    "nice",
    [
      "-n", "10", "ffmpeg", "-loglevel", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) =>
    ffmpeg.on("close", (code) => (code ? reject(new Error("ffmpeg " + code)) : resolve())),
  );
  return {
    write: (buffer) =>
      new Promise((resolve) => (ffmpeg.stdin.write(buffer) ? resolve() : ffmpeg.stdin.once("drain", resolve))),
    close: () => (ffmpeg.stdin.end(), done),
  };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: W,
    height: H,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      // In memory: every run starts from a fresh save and leaves nothing behind.
      partition: "media-capture",
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  const wc = win.webContents;
  wc.setAudioMuted(true);
  wc.setFrameRate(60);
  wc.on("console-message", (e) => {
    if (e.level === "error") console.error("renderer:", e.message);
  });
  const js = (code) => wc.executeJavaScript(code);
  try {
    await win.loadURL(url);
    const started = Date.now();
    while (!(await js("!!window.__PURGATORY__?.game"))) {
      if (Date.now() - started > 120000) throw new Error("Game did not boot (is the Vite dev server running?)");
      await new Promise((r) => setTimeout(r, 200));
    }
    for (const file of ["director.js", "shots.js"]) await js(fs.readFileSync(path.join(__dirname, file), "utf8"));
    const all = await js("Object.keys(__director.shots)");
    const pick = (value, filter) =>
      value === true || value === "all" ? all.filter(filter) : String(value).split(",").filter(Boolean);

    const probe = option("probe");
    if (probe) console.log(JSON.stringify(await js(fs.readFileSync(path.resolve(probe), "utf8")), null, 1));

    const stills = option("stills");
    if (stills) {
      fs.mkdirSync(path.join(out, "stills"), { recursive: true });
      const names = pick(stills, () => true);
      for (const name of names) {
        const marks = await js(`__director.shots[${JSON.stringify(name)}].stills || []`);
        if (!marks.length) continue;
        const frames = await js(`__director.begin(${JSON.stringify(name)})`);
        for (let i = 0; i < frames && i <= Math.max(...marks); i++) {
          await js("__director.step(); __capture.present()");
          if (marks.includes(i)) {
            const file = path.join(out, "stills", `${name}-${String(i).padStart(4, "0")}.png`);
            fs.writeFileSync(file, (await wc.capturePage()).toPNG());
            console.log("still", path.relative(process.cwd(), file));
          }
        }
      }
    }

    const video = option("video");
    if (video) {
      fs.mkdirSync(path.join(out, "clips"), { recursive: true });
      for (const name of pick(video, () => true)) {
        const t0 = Date.now();
        const frames = await js(`__director.begin(${JSON.stringify(name)})`);
        const enc = encoder(path.join(out, "clips", name + ".mp4"));
        for (let i = 0; i < frames; i++) {
          await js("__director.step(); __capture.present()");
          await enc.write((await wc.capturePage()).toBitmap());
        }
        await enc.close();
        const events = await js("__director.events()");
        fs.writeFileSync(
          path.join(out, "clips", name + ".events.json"),
          JSON.stringify({ seconds: frames / FPS, events }),
        );
        console.log(`clip ${name}: ${frames} frames, ${events.length} sounds, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
    }

    if (option("audio")) {
      await js(fs.readFileSync(path.join(__dirname, "audio.js"), "utf8"));
      const clips = path.join(out, "clips");
      for (const file of fs.readdirSync(clips).filter((f) => f.endsWith(".events.json"))) {
        const data = fs.readFileSync(path.join(clips, file), "utf8");
        const wav = path.join(clips, file.replace(".events.json", ".sfx.wav"));
        await js(`__audio.renderEvents(${data}, ${JSON.stringify(wav)})`);
        console.log("audio", path.relative(process.cwd(), wav));
      }
      const score = path.join(out, "score.wav");
      const plan = path.join(out, "score.json");
      if (fs.existsSync(plan)) {
        await js(`__audio.renderScore(${fs.readFileSync(plan, "utf8")}, ${JSON.stringify(score)})`);
        console.log("audio", path.relative(process.cwd(), score));
      }
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

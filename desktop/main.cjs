const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {
  MIN_SIZE,
  windowPlacement,
  captureWindowState,
  readWindowState,
  writeWindowState,
} = require("./window-state.cjs");
app.setName("Purgatory");
let window;
const smoke = process.argv.includes("--smoke-test");
// tools/desktop-window-check.cjs: "move" resizes the window and closes it; "verify"
// reports where the next launch opened it.
const windowCheck = (() => {
  const i = process.argv.indexOf("--window-check");
  return i < 0 ? "" : process.argv[i + 1];
})();
const smokeDir = path.resolve(
  process.env.PURGATORY_SMOKE_DIR || "artifacts/desktop-smoke",
);
const testing = smoke || !!windowCheck;
if (testing) {
  fs.mkdirSync(smokeDir, { recursive: true });
  app.setPath("userData", path.join(smokeDir, "profile"));
}
function savePath() {
  return path.join(app.getPath("userData"), "campaign.json");
}
ipcMain.handle("save:read", () => {
  try {
    return fs.readFileSync(savePath(), "utf8");
  } catch {
    return null;
  }
});
ipcMain.handle("save:write", (_event, data) => {
  if (typeof data !== "string" || data.length > 100000)
    throw new Error("Invalid save");
  JSON.parse(data);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const dest = savePath();
  fs.writeFileSync(dest + ".tmp", data);
  fs.renameSync(dest + ".tmp", dest);
  return true;
});
ipcMain.handle("window:fullscreen", () => {
  window.setFullScreen(!window.isFullScreen());
  return window.isFullScreen();
});
ipcMain.handle("window:quit", () => app.quit());
app.whenReady().then(() => {
  const place = windowPlacement(
    readWindowState(app.getPath("userData")),
    screen.getAllDisplays().map((d) => d.workArea),
  );
  // Test windows must never cover the shared desktop.
  if (testing) place.maximized = place.fullscreen = false;
  window = new BrowserWindow({
    show: !testing,
    ...place.bounds,
    fullscreen: place.fullscreen,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    backgroundColor: "#101310",
    title: "Purgatory",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !smoke,
    },
  });
  if (place.maximized && !place.fullscreen) window.maximize();
  window.on("close", () =>
    writeWindowState(app.getPath("userData"), captureWindowState(window)),
  );
  // Show the isolated test window so native capture requests can complete.
  if (testing) window.showInactive();
  if (windowCheck) {
    const report = (label) =>
      console.log(
        "WINDOW_CHECK " +
          JSON.stringify({ label, bounds: window.getNormalBounds() }),
      );
    setTimeout(() => {
      report("opened");
      if (windowCheck === "move") {
        window.setBounds({ width: 1104, height: 702 });
        setTimeout(() => {
          report("moved");
          window.close();
        }, 800);
      } else app.exit(0);
    }, 1500);
  }
  const rendererErrors = [];
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") rendererErrors.push(event.message);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file:") && !url.startsWith("http://localhost:5187"))
      event.preventDefault();
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });
  if (smoke)
    window.webContents.once("did-finish-load", async () => {
      const watchdog = setTimeout(() => {
        console.error("DESKTOP_SMOKE_FAILED: timed out", rendererErrors);
        app.exit(1);
      }, 120000);
      try {
        console.log("SMOKE loading renderer");
        await window.webContents.executeJavaScript(
          `new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(window.__PURGATORY__){clearInterval(timer);resolve(true);}else if(Date.now()-start>90000){clearInterval(timer);reject(new Error('Asset loading timed out'));}},100);})`,
        );
        const initial = await window.webContents.executeJavaScript(
          "window.__PURGATORY__.state()",
        );
        if (initial.mode !== "menu") throw new Error("Menu missing");
        const bridge = await window.webContents.executeJavaScript(
          `(async()=>{const value=JSON.stringify({version:1,smoke:true});await window.desktop.writeSave(value);return (await window.desktop.readSave())===value;})()`,
        );
        if (!bridge) throw new Error("Native save round trip failed");
        fs.writeFileSync(
          path.join(smokeDir, "main-menu.png"),
          (await window.webContents.capturePage()).toPNG(),
        );
        console.log("SMOKE opening options");
        await window.webContents.executeJavaScript(`(()=>{
          document.querySelector('[data-action="page"][data-value="settings"]').click();
          document.querySelector('[data-action="settings-tab"][data-value="audio"]').click();
          const input=document.getElementById('volume');input.value='37';input.dispatchEvent(new Event('input',{bubbles:true}));
        })()`);
        console.log("SMOKE options changed; reloading");
        await new Promise((resolve) => {
          window.webContents.once("did-finish-load", resolve);
          window.webContents.reload();
        });
        await window.webContents.executeJavaScript(
          `new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(window.__PURGATORY__){clearInterval(timer);resolve(true);}else if(Date.now()-start>90000){clearInterval(timer);reject(new Error('Reload timed out'));}},100);})`,
        );
        console.log("SMOKE renderer reloaded");
        const optionsPersisted = await window.webContents
          .executeJavaScript(`(()=>{
          document.querySelector('[data-action="page"][data-value="settings"]').click();
          document.querySelector('[data-action="settings-tab"][data-value="audio"]').click();
          const persisted=document.getElementById('volume').value==='37';
          document.querySelector('[data-action="defaults"]').click();
          document.querySelector('[data-action="settings-tab"][data-value="video"]').click();
          return persisted;
        })()`);
        console.log("SMOKE settings persisted", optionsPersisted);
        if (!optionsPersisted)
          throw new Error("Settings did not survive desktop reload");
        fs.writeFileSync(
          path.join(smokeDir, "options.png"),
          (await window.webContents.capturePage()).toPNG(),
        );
        await window.webContents.executeJavaScript(
          `document.querySelector('[data-action="back"]').click()`,
        );
        const selectedLevel = Number(process.env.PURGATORY_SMOKE_LEVEL || 0);
        if (
          !Number.isInteger(selectedLevel) ||
          selectedLevel < 0 ||
          selectedLevel > 23
        )
          throw new Error("Invalid smoke level");
        if (process.env.PURGATORY_SMOKE_LEVEL) {
          await window.webContents.executeJavaScript(`(()=>{
            document.querySelector('[data-action="page"][data-value="campaign"]').click();
            const chapter=window.__PURGATORY__.campaign[${selectedLevel}].chapter;
            document.querySelector('[data-action="chapter"][data-value="'+chapter+'"]').click();
            document.querySelector('[data-action="select-level"][data-value="${selectedLevel}"]').click();
            document.querySelector('[data-action="level"][data-value="${selectedLevel}"]').click();
          })()`);
        } else {
          // A fresh save asks for the difficulty first; take the one offered.
          const chose = await window.webContents.executeJavaScript(
            `(()=>{document.querySelector('[data-action="start"]').click();const begin=document.querySelector('[data-action="begin"][data-default]');begin?.click();return begin?.dataset.value ?? null;})()`,
          );
          console.log("SMOKE difficulty offered", chose);
        }
        await new Promise((resolve) => setTimeout(resolve, 5500));
        const state = await window.webContents.executeJavaScript(
          "window.__PURGATORY__.state()",
        );
        if (!["playing", "paused"].includes(state.mode))
          throw new Error("Game did not start");
        if (process.env.PURGATORY_SMOKE_LEVEL && state.level !== selectedLevel)
          throw new Error("Level browser did not start the selected level");
        const pauseOptions = await window.webContents.executeJavaScript(`(()=>{
          const press=()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));
          if(window.__PURGATORY__.state().mode==='playing')press();
          document.querySelector('[data-action="page"][data-value="settings"]').click();
          const paused=window.__PURGATORY__.state().mode==='paused';
          press();
          return paused && !!document.querySelector('[data-action="resume"]');
        })()`);
        if (!pauseOptions) throw new Error("Pause options flow failed");
        fs.writeFileSync(
          path.join(smokeDir, "pause.png"),
          (await window.webContents.capturePage()).toPNG(),
        );
        await window.webContents.executeJavaScript(
          `document.querySelector('[data-action="resume"]').click()`,
        );
        if (rendererErrors.length) throw new Error(rendererErrors.join("; "));
        const screenshot = await window.webContents.capturePage();
        fs.writeFileSync(
          path.join(smokeDir, "desktop.png"),
          screenshot.toPNG(),
        );
        const result = {
          passed: true,
          initial,
          state,
          nativeSave: true,
          optionsPersisted,
          pauseOptions,
          rendererErrors,
        };
        fs.writeFileSync(
          path.join(smokeDir, "result.json"),
          JSON.stringify(result, null, 2),
        );
        console.log("DESKTOP_SMOKE " + JSON.stringify(result));
        clearTimeout(watchdog);
        app.exit(0);
      } catch (error) {
        clearTimeout(watchdog);
        console.error("DESKTOP_SMOKE_FAILED", error);
        app.exit(1);
      }
    });
  if (process.env.PURGATORY_DEV === "1")
    window.loadURL("http://localhost:5187");
  else window.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());

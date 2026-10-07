// Capture: the frame-rate readout during Hallowed Ground's first wave (real frames, so
// the numbers are whatever this machine managed at the time).
//   npm run test:browser -- --checks tools/media/round7/frame-rate.js --capture docs/media/improvements/round7/r7-4-frame-rate.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  g.applySettings({ ...g.settings(), showFps: true });
  api.seed(4);
  api.start(0, 0, false);
  g.invulnerable = 1e9;
  g.waveDelay = 0.5;
  for (let i = 0; i < 300; i++) await raf();
  g.toastTimer = 0;
  g.elapsed = 30;
  for (let i = 0; i < 10; i++) await raf();
  g.onHUD();
  return document.getElementById("hud-fps").textContent;
})();

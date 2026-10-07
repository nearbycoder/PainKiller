// Capture: a fight held after the mouse was refused, waiting for a click.
//   npm run test:browser -- --checks tools/media/round8/mouse-prompt.js --capture docs/media/improvements/round8/r8-1-mouse-prompt.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  api.seed(4);
  api.start(0, 0);
  g.invulnerable = 1e9;
  g.waveDelay = 0.5;
  for (let i = 0; i < 240; i++) await raf();
  g.toastTimer = 0;
  // What a refused request does once this session has had the mouse.
  g.hadMouse = true;
  g.lockRefused();
  for (let i = 0; i < 10; i++) await raf();
  g.onHUD();
  return document.getElementById("mouse-prompt").textContent;
})();

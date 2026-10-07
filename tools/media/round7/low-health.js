// Capture: the low-health warning at 18 health in Hallowed Ground's first wave.
//   npm run test:browser -- --checks tools/media/round7/low-health.js --capture docs/media/improvements/round7/r7-2-low-health.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  api.seed(4);
  api.start(0, 0, false);
  g.invulnerable = 1e9;
  g.waveDelay = 0.5;
  for (let i = 0; i < 260; i++) await raf();
  g.health = 18;
  g.armor = 0;
  g.toastTimer = 0;
  g.elapsed = 30;
  for (let i = 0; i < 40; i++) await raf();
  g.onHUD();
  return api.state().health;
})();

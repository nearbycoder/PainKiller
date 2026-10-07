// Capture: a fight in Frostbound Crossing in a narrow window with a mouse.
//   npm run test:browser -- --size 860x640 --checks tools/media/round9/narrow-window.js --capture artifacts/r9/narrow.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  api.seed(3);
  api.start(8, 0);
  g.invulnerable = 1e9;
  g.waveDelay = 0.5;
  for (let i = 0; i < 120; i++)
    await new Promise((r) => requestAnimationFrame(r));
  return { width: innerWidth, touchLayout: g.controls.mobile };
})();

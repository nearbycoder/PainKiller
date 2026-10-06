// Capture: the gate guide after a sector is cleared, with the gate behind and to the left.
//   npm run test:browser -- --checks tools/media/round3/gate.js --capture docs/media/improvements/round3/r3-4-gate-guide.jpg
(() => {
  const g = window.__PURGATORY__.game;
  g.start(6, 1, false);
  g.sound.setVolume(0);
  g.wave = 3;
  g.remaining = 0;
  g.waveDelay = 0.01;
  for (let i = 0; i < 2; i++) g.update(1 / 60);
  g.toastTimer = 0;
  g.position.set(6, 1.75, 14);
  g.yaw = -2.3;
  g.pitch = -0.05;
  g.update(1 / 60);
  g.onHUD();
  return g.gateGuide();
})();

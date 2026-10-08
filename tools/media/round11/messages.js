// Capture: the Wraith's message with an ammunition pickup on the line under it.
//   npm run test:browser -- --checks tools/media/round11/messages.js --capture artifacts/r11/messages.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  api.seed(3);
  api.start(0, 0);
  g.invulnerable = 1e9;
  g.waveDelay = 60;
  g.toastTimer = 0;
  await frames(60);
  g.souls = 65;
  g.addPickup("soul", g.position.clone().setY(1));
  await frames(40);
  g.addPickup("ammo", g.position.clone().setY(1));
  await frames(12);
  // Hold the frame: the loop stops stepping so both lines stay up for the capture.
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
  await new Promise((r) => setTimeout(r, 200));
  setTimeout(() => {
    window.requestAnimationFrame = raf;
    raf(g.loop);
  }, 3000);
  return { main: g.messages.line, under: g.messages.under };
})();

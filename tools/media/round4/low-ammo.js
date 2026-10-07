// Capture: the rocket counter turns red when low, in a fight in Hall of Vigils.
//   npm run test:browser -- --checks tools/media/round4/low-ammo.js --capture docs/media/improvements/round4/r4-2-low-ammo.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  g.start(1, 0, false);
  g.waveDelay = 9999;
  g.invulnerable = 999;
  const at = (x, z) => g.position.clone().set(x, 0, z);
  for (const [type, x, z] of [
    ["knight", -3, 12],
    ["skeleton", 2.5, 10],
    ["brute", 0.5, 4],
  ])
    g.spawnEnemy(type, at(x, z));
  g.equip(3);
  g.ammo[3] = 4;
  g.toastTimer = 0;
  for (let i = 0; i < 40; i++) {
    g.update(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  }
  g.onHUD();
  g.setMode("paused");
  g.setMode("playing");
  return "ok";
})();

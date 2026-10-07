// Capture: the HUD at an interface scale (default 150%) during a general's fight.
//   npm run test:browser -- --before 'window.__HUD_SCALE__ = 0.75' --checks tools/media/round4/hud-scale.js --capture docs/media/improvements/round4/r4-4-hud-75.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  g.applySettings({ ...g.settings(), hudScale: window.__HUD_SCALE__ || 1.5 });
  g.start(4, 4, false);
  g.waveDelay = 9999;
  g.invulnerable = 999;
  g.hints.setEnabled(false);
  const at = (x, z) => g.position.clone().set(x, 0, z);
  g.spawnEnemy("boss", at(0, 6));
  g.spawnEnemy("skeleton", at(-4, 12));
  g.spawnEnemy("witch", at(5, 10));
  g.equip(2);
  for (let i = 0; i < 30; i++) {
    g.update(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  }
  g.notify("THE GRAVEWARDEN RISES", 5);
  g.onHUD();
  return "ok";
})();

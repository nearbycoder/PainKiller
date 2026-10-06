// Capture: the death screen's recap after a general's shockwave.
//   npm run test:browser -- --checks tools/media/round3/death.js --capture docs/media/improvements/round3/r3-3-death-recap.jpg
(() => {
  const g = window.__PURGATORY__.game;
  g.start(4, 2, false);
  g.waveDelay = 9999;
  g.sound.setVolume(0);
  g.armor = 0;
  const at = (dz) => g.position.clone().setZ(g.position.z + dz);
  for (const [damage, cause, source] of [
    [22, "hellfire", "boss"],
    [22, "hellfire", "boss"],
    [15, "hellfire", "monk"],
    [13, "skeleton"],
    [13, "skeleton"],
  ]) {
    g.invulnerable = 0;
    g.hurt(damage, at(-5), cause, source);
  }
  g.invulnerable = 0;
  g.hurt(24, at(-5), "shockwave");
  return g.mode;
})();

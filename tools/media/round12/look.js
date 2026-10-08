// A quick look at the running game: chosen levels with a few enemies in view, at each
// graphics step, for judging the art. Set window.__LOOK_LEVELS__, __LOOK_STEPS__ and
// __LOOK_OUT__ with --before.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__LOOK_OUT__ || "artifacts/r12/look",
    levels = window.__LOOK_LEVELS__ || [0, 8],
    steps = window.__LOOK_STEPS__ || [0, 1, 2];
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  const capture = async (file) => {
    delete window.__RUNNER_CAPTURED__;
    console.info(`__RUNNER__ capture ${file}`);
    while (!window.__RUNNER_CAPTURED__)
      await new Promise((r) => setTimeout(r, 30));
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  for (const level of levels)
    for (const q of steps) {
      g.applySettings({ ...g.settings(), quality: q });
      api.seed(5);
      api.start(level, 0);
      g.invulnerable = 1e9;
      g.waveDelay = 60;
      g.equip(3);
      await frames(40);
      const d = g.direction();
      for (const [type, ahead, side] of [
        ["brute", 9, -2],
        ["skeleton", 7, 2.5],
        ["witch", 13, 0.5],
      ]) {
        const p = g.position
          .clone()
          .addScaledVector(d, ahead)
          .add(new (g.position.constructor)(-d.z * side, 0, d.x * side));
        p.y = 0;
        g.spawnEnemy(type, p);
      }
      g.enemies.forEach((e) => (e.speed = 0));
      await frames(50);
      g.mouse = [true, false];
      await frames(12);
      g.mouse = [false, false];
      await frames(14);
      await capture(`${out}/level-${level}-q${q}.jpg`);
    }
  g.setMode("menu");
  return "ok";
})();

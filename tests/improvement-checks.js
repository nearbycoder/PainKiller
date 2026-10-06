// Scenario checks for the October 2026 improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, like the other tests/*-checks.js scripts.
(() => {
  const g = window.__PURGATORY__.game,
    results = [],
    saved = structuredClone(g.save),
    V = g.position.constructor;
  const assert = (x, m) => {
    if (!x) throw Error(m);
  };
  const check = (name, fn) => {
    try {
      results.push({ name, passed: true, detail: fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const setup = (level = 0, room = 0) => {
    g.start(level, room, false);
    g.waveDelay = 9999;
    g.invulnerable = 0;
    g.sound.setVolume(0);
  };
  const step = (frames) => {
    for (let i = 0; i < frames; i++) g.update(1 / 60);
  };

  check(
    "a hellfire hit on the player leaves no particles at the camera",
    () => {
      setup();
      const origin = g.position.clone().add(new V(0, -0.4, -6));
      g.projectile("hellfire", origin, new V(0, 0, 1), 14, 15, 5, true);
      const before = g.health + g.armor;
      step(40);
      assert(g.health + g.armor < before, "Hellfire did not hit the player");
      const near = g.particles.filter(
        (p) => p.mesh.visible && p.mesh.position.distanceTo(g.position) < 1.5,
      );
      assert(near.length === 0, `${near.length} visible particles at the eye`);
    },
  );

  check(
    "sector retry keeps the level's earlier kills, souls and relics",
    () => {
      setup();
      g.levelKills = 30;
      g.levelSouls = 20;
      g.secrets = 1;
      g.arenaCleared = true;
      g.position.set(0, 1.75, -28);
      g.nextArena();
      assert(g.room === 1, "Did not advance to sector 2");
      g.levelKills += 7;
      g.levelSouls += 6;
      g.health = 0;
      g.setMode("dead");
      g.retry();
      assert(g.room === 1 && g.mode === "playing", "Retry left the sector");
      assert(g.levelKills === 30, `kills ${g.levelKills}, expected 30`);
      assert(g.levelSouls === 20, `souls ${g.levelSouls}, expected 20`);
      assert(g.secrets === 1, `relics ${g.secrets}, expected 1`);
      g.start(1, 0, false);
      assert(g.levelKills === 0 && g.levelSouls === 0, "New level kept stats");
    },
  );

  check("the death screen counts one enemy in the singular", () => {
    setup();
    g.levelKills = 1;
    g.setMode("dead");
    const text = document.querySelector(".end-screen")?.textContent || "";
    assert(/1 enemy slain/.test(text), text);
    g.setMode("playing");
  });

  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

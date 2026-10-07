// Scenario checks for the fourth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round4`.
// The shader check is strictest in a fresh page (`--checks round4` alone): earlier
// suites in the same page may already have compiled what it looks for.
(async () => {
  const g = window.__PURGATORY__.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    storedOptions = localStorage.getItem("purgatory.options");
  const assert = (x, m) => {
    if (!x) throw Error(m);
  };
  const check = async (name, fn) => {
    try {
      results.push({ name, passed: true, detail: await fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const step = (frames) => {
    for (let i = 0; i < frames; i++) g.update(1 / 60);
  };
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const frames = async (n) => {
    for (let i = 0; i < n; i++) await frame();
  };
  const programs = () => g.renderer.info.programs.length;
  g.sound.setVolume(0);

  // R4-1: shaders compile before the fight, not during it.
  let warmRenders = 0;
  const warmUp = g.warmUp.bind(g);
  g.warmUp = () => {
    warmRenders++;
    return warmUp();
  };
  const settle = async () => {
    const before = warmRenders,
      t0 = performance.now();
    while (warmRenders === before && performance.now() - t0 < 20000)
      await frame();
    assert(warmRenders > before, "the warm-up never drew");
    await frames(3);
  };
  const fight = async (level) => {
    g.start(level, 0, false);
    g.waveDelay = 9999;
    await settle();
    const known = new Set(g.renderer.info.programs),
      at = (x, z) => g.position.clone().set(x, 0, z);
    for (const [i, type] of [
      "skeleton",
      "revenant",
      "hound",
      "monk",
      "witch",
      "knight",
      "brute",
      "boss",
    ].entries())
      g.spawnEnemy(type, at(-7 + i * 2, 12));
    g.enemies[0].frozen = 3;
    await frames(3);
    for (let w = 0; w < 5; w++)
      for (const alt of [false, true]) {
        g.equip(w);
        g.ammo[w] = g.altAmmo[w] = 99;
        g.cooldown = 0;
        g.shoot(alt);
        step(4);
        await frames(2);
      }
    g.explode(at(0, 15), 0, 6);
    g.addPickup("soul", at(0, 20));
    g.demon = 15;
    step(30);
    await frames(4);
    g.demon = 0;
    const added = g.renderer.info.programs
      .filter((p) => !known.has(p))
      .map((p) => String(p.cacheKey).slice(0, 60));
    return { level, programs: programs(), added };
  };
  await check(
    "R4-1 procedural and authored fights compile no new shaders on Low, Medium and High",
    async () => {
      const runs = [];
      // Medium first, then Low (no composer) and High (ambient occlusion).
      for (const quality of [1, 0, 2]) {
        g.applySettings({ ...g.settings(), quality });
        runs.push(
          { quality, ...(await fight(8)) },
          { quality, ...(await fight(0)) },
        );
      }
      for (const r of runs)
        assert(
          !r.added.length,
          `level ${r.level}, quality ${r.quality}: compiled mid-fight: ${r.added.join(" | ")}`,
        );
      return runs;
    },
  );
  await check("R4-1 the warm-up leaves nothing behind", async () => {
    g.start(6, 0, false);
    g.waveDelay = 9999;
    await settle();
    let found = false;
    g.scene.traverse((o) => (found ||= o === g.warmSet));
    assert(!found, "the warm-up set is still in the scene");
    const visible = g.weaponModels.map((w) => w.root.visible);
    assert(
      visible.filter(Boolean).length === 1 && visible[g.weapon],
      "weapon visibility not restored: " + visible,
    );
    // Building the set draws no numbers from the game's random sequence.
    const random = Math.random;
    let calls = 0;
    const counter = () => (calls++, 0.5);
    Math.random = counter;
    const old = g.warmSet;
    g.warmSet = undefined;
    try {
      g.warmUpSet();
      assert(calls === 0, `${calls} draws from Math.random`);
      assert(Math.random === counter, "Math.random was not restored");
    } finally {
      Math.random = random;
      g.warmSet = old;
    }
    return { visible };
  });
  g.warmUp = warmUp;

  g.applySettings(options);
  if (storedOptions === null) localStorage.removeItem("purgatory.options");
  else localStorage.setItem("purgatory.options", storedOptions);
  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

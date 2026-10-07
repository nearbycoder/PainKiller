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

  // R4-2: running dry.
  const dry = [];
  const sound = g.sound.dry.bind(g.sound);
  g.sound.dry = () => (dry.push(g.weapon), sound());
  const setup = (autoSwitch = true) => {
    g.applySettings({ ...g.settings(), autoSwitch });
    g.start(0, 0, false);
    g.clearDynamic();
    g.waveDelay = 9999;
    g.invulnerable = 999;
    g.controls.clear();
    g.controls.poll(1 / 60, []);
    dry.length = 0;
  };
  const hold = (alt, frames) => {
    g.controls[alt ? "secondary" : "primary"] = true;
    step(frames);
    g.controls[alt ? "secondary" : "primary"] = false;
  };
  await check(
    "R4-2 holding fire with no rockets switches weapon and keeps firing",
    () => {
      setup();
      g.equip(3);
      g.ammo[3] = 0;
      const shurikens = g.ammo[4];
      hold(false, 40);
      assert(g.weapon === 4, "switched to " + g.weapon);
      assert(g.ammo[4] < shurikens, "the new weapon did not fire");
      assert(dry.length === 1 && dry[0] === 3, "dry clicks: " + dry);
      assert(g.toast === "OUT OF ROCKETS", "toast: " + g.toast);
      return { weapon: g.weapon, fired: shurikens - g.ammo[4] };
    },
  );
  await check("R4-2 the alternate button looks at alternate ammunition", () => {
    setup();
    g.equip(3);
    g.altAmmo[3] = 0;
    g.altAmmo[4] = 0;
    const grenades = g.altAmmo[2];
    hold(true, 60);
    assert(g.weapon === 2, "switched to " + g.weapon);
    const thrown = grenades - g.altAmmo[2];
    assert(thrown > 0, "no grenade was thrown");
    assert(g.toast === "OUT OF ROUNDS", "toast: " + g.toast);
    setup();
    g.equip(1);
    g.ammo = g.ammo.map((n, i) => (i ? 0 : n));
    hold(false, 30);
    assert(g.weapon === 0, "with nothing left, not the Thresher: " + g.weapon);
    return { thrown };
  });
  await check("R4-2 with the option off, an empty weapon only clicks", () => {
    setup(false);
    g.equip(3);
    g.ammo[3] = 0;
    hold(false, 40);
    assert(g.weapon === 3, "switched to " + g.weapon);
    assert(dry.length >= 2 && dry.every((w) => w === 3), "dry clicks: " + dry);
    assert(g.toast === "OUT OF ROCKETS  /  SWITCH WEAPON", "toast: " + g.toast);
    return { clicks: dry.length };
  });
  await check(
    "R4-2 low ammunition shows on the HUD and clears with a pickup",
    () => {
      setup();
      g.setMode("playing");
      g.equip(3);
      g.ammo[3] = 4;
      g.altAmmo[3] = 200;
      g.onHUD();
      const ammo = document.getElementById("hud-ammo"),
        alt = document.getElementById("hud-alt");
      assert(ammo.classList.contains("low"), "4 rockets are not low");
      assert(!alt.classList.contains("low"), "200 rounds are low");
      g.altAmmo[3] = 40;
      g.equip(0);
      g.onHUD();
      assert(
        !ammo.classList.contains("low") && !alt.classList.contains("low"),
        "the Thresher shows low",
      );
      g.equip(3);
      g.addPickup("ammo", g.position.clone().setY(0.65));
      step(5);
      g.onHUD();
      assert(
        g.ammo[3] === 9 && !ammo.classList.contains("low"),
        "rockets after a pickup: " + g.ammo[3],
      );
      assert(
        alt.classList.contains("low") === g.altAmmo[3] <= 44,
        "rounds: " + g.altAmmo[3],
      );
      return { rockets: g.ammo[3], rounds: g.altAmmo[3] };
    },
  );
  await check("R4-2 the option is on the Gameplay page and saves", () => {
    g.applySettings({ ...g.settings(), autoSwitch: true });
    g.setMode("menu");
    document
      .querySelector('[data-action="page"][data-value="settings"]')
      .click();
    document
      .querySelector('[data-action="settings-tab"][data-value="gameplay"]')
      .click();
    const off = document.querySelector(
      '[data-action="option"][data-value="autoSwitch:false"]',
    );
    assert(off, "no Switch weapon when empty option");
    off.click();
    assert(g.autoSwitch === false, "the click did not apply");
    const stored = JSON.parse(localStorage.getItem("purgatory.options"));
    assert(stored.autoSwitch === false, "not saved");
    document
      .querySelector('[data-action="option"][data-value="autoSwitch:true"]')
      .click();
    assert(g.autoSwitch === true, "could not turn it back on");
    return "ok";
  });
  g.sound.dry = sound;

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

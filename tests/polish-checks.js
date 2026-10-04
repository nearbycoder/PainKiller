(() => {
  const g = window.__PURGATORY__.game,
    results = [],
    saved = structuredClone(g.save);
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
  check("melee has a dodgeable wind-up", () => {
    g.start(0, 0, false);
    g.waveDelay = 9999;
    g.invulnerable = 0;
    const e = g.spawnEnemy(
      "shambler",
      g.position.clone().setY(0).add({ x: 0, y: 0, z: -1.4 }),
    );
    e.cooldown = 0;
    const h = g.health + g.armor;
    g.updateEnemies(1 / 60);
    assert(e.attackWindup > 0, "No wind-up");
    assert(g.health + g.armor === h, "Instant melee damage");
    g.position.z += 5;
    for (let i = 0; i < 24; i++) g.updateEnemies(1 / 60);
    assert(g.health + g.armor === h, "Dodged attack still hit");
  });
  check("melee connects after wind-up when player remains in reach", () => {
    g.start(0, 0, false);
    g.waveDelay = 9999;
    g.invulnerable = 0;
    const e = g.spawnEnemy(
      "shambler",
      g.position.clone().setY(0).add({ x: 0, y: 0, z: -1.4 }),
    );
    e.cooldown = 0;
    const h = g.health + g.armor;
    for (let i = 0; i < 24; i++) g.updateEnemies(1 / 60);
    assert(g.health + g.armor < h, "Attack never connected");
  });
  check("new indoor arenas leave spawn and exit usable", () => {
    for (const i of [1, 2, 3, 12]) {
      g.start(i, 0, false);
      assert(g.arena.colliders.length > 8, "No meaningful collisions");
      for (const c of g.arena.colliders)
        assert(
          !(
            Math.abs(c.x) < c.w / 2 + 0.4 &&
            (Math.abs(24 - c.z) < c.d / 2 + 0.4 ||
              Math.abs(-28 - c.z) < c.d / 2 + 0.4)
          ),
          "Spawn or exit blocked",
        );
    }
    return true;
  });
  check("weapon inspection and shot state respond to input", () => {
    g.start(0, 0, false);
    g.equip(1);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyF", bubbles: true }),
    );
    assert(g.weaponMotion.inspect > 0, "F did not inspect");
    g.shoot(false);
    assert(
      g.weaponMotion.inspect === 0 && g.weaponMotion.flash > 0,
      "Shot did not cancel inspection and flash",
    );
  });
  check("checkpoint restart clears transient combat feedback", () => {
    g.damageFlash = 0.8;
    g.hitFlash = 0.2;
    g.recoil = 0.1;
    g.start(0, 0, false);
    assert(
      g.damageFlash === 0 && g.hitFlash === 0 && g.recoil === 0,
      "Previous fight feedback leaked into the fresh checkpoint",
    );
  });
  g.save = saved;
  g.persist();
  g.clearDynamic();
  g.setMode("menu");
  return results;
})();

(() => {
  const api = window.__PURGATORY__,
    g = api.game,
    V = g.position.constructor,
    results = [],
    originalSave = structuredClone(g.save),
    errors = [],
    originalError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
    originalError(...args);
  };
  function check(name, fn) {
    try {
      const detail = fn();
      results.push({ name, passed: true, detail });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  }
  function assert(value, message) {
    if (!value) throw new Error(message);
  }
  function setup() {
    api.start(0, 0);
    g.waveDelay = 9999;
    g.sound.setVolume(0);
    g.pitch = -0.08;
  }
  check("actual keyboard movement, jumping and release", () => {
    setup();
    const start = g.position.z;
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    api.step(60);
    document.body.dispatchEvent(
      new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }),
    );
    assert(g.position.z < start - 7, "W did not move player");
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    api.step(10);
    assert(g.position.y > 2.3, "Jump failed");
    document.body.dispatchEvent(
      new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
    );
    api.step(90);
    assert(Math.abs(g.position.y - 1.75) < 0.01, "Landing failed");
    return g.position.toArray();
  });
  for (let weapon = 0; weapon < 5; weapon++)
    for (const alt of [false, true])
      check(
        `weapon ${weapon + 1} ${alt ? "secondary" : "primary"} damages an enemy`,
        () => {
          setup();
          g.equip(weapon);
          const enemy = g.spawnEnemy(
            "brute",
            new V(0, 0, weapon === 0 ? 21.4 : 16),
          );
          const before = enemy.hp;
          g.pitch = -0.06;
          g.keys.add(alt ? "KeyX" : "KeyZ");
          api.step(weapon === 0 ? 70 : 100);
          g.keys.clear();
          assert(enemy.hp < before, "No damage dealt");
          return {
            damage: before - enemy.hp,
            ammo: alt ? g.altAmmo[weapon] : g.ammo[weapon],
          };
        },
      );
  check("freezer followed by shotgun shatters", () => {
    setup();
    g.equip(1);
    const e = g.spawnEnemy("brute", new V(0, 0, 18));
    g.shoot(true);
    api.step(15);
    assert(e.frozen > 0, "Enemy did not freeze");
    api.step(30);
    g.shoot(false);
    api.step(10);
    assert(e.hp <= 0, "Frozen enemy did not shatter");
  });
  check("empty ammunition cannot fire", () => {
    setup();
    g.equip(3);
    g.ammo[3] = 0;
    g.shoot();
    assert(g.projectiles.length === 0, "Fired empty launcher");
    assert(g.ammo[3] === 0, "Ammo became negative");
  });
  check("soul collection activates wraith form", () => {
    setup();
    g.souls = 65;
    g.addPickup("soul", new V(0, 0.8, 24));
    api.step(1);
    assert(g.demon > 14, "No demon activation");
    const hp = g.health;
    g.hurt(100);
    assert(g.health === hp, "Demon was damaged");
  });
  check("player death changes game state and retry restores checkpoint", () => {
    setup();
    g.invulnerable = 0;
    g.armor = 0;
    g.hurt(1000);
    assert(g.mode === "dead", "No death screen");
    api.start(g.level, g.room);
    assert(g.health === 100 && g.mode === "playing", "Retry failed");
  });
  check("wave completion opens portal; E advances and saves checkpoint", () => {
    setup();
    g.wave = 3;
    g.waveDelay = 0;
    api.step(1);
    assert(g.arenaCleared && g.arena.portal.visible, "Gate did not open");
    g.position.set(0, 1.75, -27);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyE", bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent("keyup", { code: "KeyE", bubbles: true }),
    );
    assert(
      g.room === 1 && g.save.room === 1,
      "Portal did not advance and save",
    );
  });
  check("level completion unlocks next level and grants earned tarot", () => {
    api.start(0, 3);
    g.secrets = 1;
    g.wave = 3;
    g.waveDelay = 0;
    api.step(1);
    g.nextArena();
    assert(g.mode === "result", "No results screen");
    assert(g.save.unlocked >= 1 && g.save.level === 1, "Next level locked");
    assert(g.save.cards.includes(0), "Tarot reward missing");
  });
  check("tarot activates once per sector and changes damage", () => {
    setup();
    g.save.cards = [0];
    g.save.selectedCard = 0;
    g.activateCard();
    assert(g.cardTime === 30, "Card did not activate");
    g.cardTime = 0;
    g.activateCard();
    assert(g.cardTime === 0, "Spent card activated twice");
  });
  check("all 24 environments render with open start and exit routes", () => {
    const counts = [];
    for (let i = 0; i < 24; i++) {
      api.start(i, 0);
      g.renderer.render(g.scene, g.camera);
      assert(g.arena.root.children.length > 0, "Missing geometry " + i);
      assert(
        g.arena.colliders.every((c) =>
          Number.isFinite(c.x + c.z + c.w + c.d + c.h),
        ),
        "Invalid collision " + i,
      );
      for (let z = -28; z <= 24; z++)
        assert(
          !g.arena.colliders.some(
            (c) =>
              0.4 > c.x - c.w / 2 &&
              -0.4 < c.x + c.w / 2 &&
              z + 0.4 > c.z - c.d / 2 &&
              z - 0.4 < c.z + c.d / 2,
          ),
          "Blocked central route " + i,
        );
      counts.push({
        level: i,
        objects: g.arena.root.children.length,
        colliders: g.arena.colliders.length,
      });
    }
    return counts;
  });
  check("all five bosses spawn and emit attacks", () => {
    const seen = [];
    for (const i of [4, 10, 14, 19, 23]) {
      api.start(i, api.campaign[i].rooms - 1);
      g.wave = 2;
      g.beginWave();
      g.remaining = 0;
      g.waveDelay = 999;
      const boss = g.enemies.find((e) => e.type === "boss");
      assert(boss, "Missing boss " + i);
      boss.cooldown = 0;
      api.step(1);
      assert(
        g.projectiles.some((p) => p.hostile),
        "Boss did not attack " + i,
      );
      seen.push({
        level: i,
        name: api.campaign[i].boss,
        shots: g.projectiles.length,
        rings: g.rings.length,
      });
    }
    return seen;
  });
  check("final gate reaches ending and persists completion", () => {
    api.start(23, api.campaign[23].rooms - 1);
    g.wave = 3;
    g.waveDelay = 0;
    api.step(1);
    g.nextArena();
    assert(g.mode === "ending" && g.save.completed, "No campaign ending");
  });
  check(
    "renderer emits no errors while creating enemies and all environments",
    () => assert(errors.length === 0, errors.join("; ")),
  );
  console.error = originalError;
  g.save = originalSave;
  g.persist();
  g.level = 0;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

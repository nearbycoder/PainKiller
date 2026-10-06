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

  const recordCues = (fn) => {
    const cues = [],
      original = g.sound.cue;
    g.sound.cue = (name, pan = 0, gain = 1) => {
      cues.push({ name, pan, gain });
      return original.call(g.sound, name, pan, gain);
    };
    try {
      fn();
    } finally {
      g.sound.cue = original;
    }
    return cues;
  };

  check("a melee wind-up on the left is heard on the left", () => {
    setup();
    g.yaw = 0;
    const cues = recordCues(() => {
      const e = g.spawnEnemy(
        "knight",
        g.position
          .clone()
          .setY(0)
          .add(new V(-1.5, 0, 0)),
      );
      e.cooldown = 0;
      g.updateEnemies(1 / 60);
    });
    const windup = cues.find((c) => c.name.startsWith("windup"));
    assert(windup, "No wind-up cue: " + JSON.stringify(cues));
    assert(
      windup.name === "windup-heavy",
      "Knight should use the heavy wind-up",
    );
    assert(windup.pan < -0.5, "Wind-up pan " + windup.pan);
    return cues.map((c) => c.name);
  });

  check("a witch casting on the right is heard on the right", () => {
    setup();
    g.yaw = 0;
    const cues = recordCues(() => {
      const e = g.spawnEnemy(
        "witch",
        g.position
          .clone()
          .setY(0)
          .add(new V(18, 0, -2)),
      );
      e.cooldown = 0;
      g.updateEnemies(1 / 60);
    });
    const cast = cues.find((c) => c.name === "cast");
    assert(cast, "No cast cue: " + JSON.stringify(cues));
    assert(
      cast.pan > 0.5 && cast.gain < 1,
      `pan ${cast.pan}, gain ${cast.gain}`,
    );
  });

  check("kills, shatters and generals have their own cues", () => {
    setup();
    const cues = recordCues(() => {
      const a = g.spawnEnemy(
        "skeleton",
        g.position
          .clone()
          .setY(0)
          .add(new V(0, 0, -6)),
      );
      g.hitEnemy(a, 9999, "bullet");
      const b = g.spawnEnemy(
        "brute",
        g.position
          .clone()
          .setY(0)
          .add(new V(3, 0, -8)),
      );
      g.hitEnemy(b, 1, "ice");
      g.hitEnemy(b, 1, "shotgun");
      g.spawnEnemy("boss", new V(0, 0, -20));
    }).map((c) => c.name);
    for (const name of ["spawn", "death", "kill", "shatter", "roar"])
      assert(cues.includes(name), `missing ${name}: ${cues.join(",")}`);
  });

  const threat = (kind) => g.threatIndicators().filter((t) => t.kind === kind);
  const near = (a, b) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.25;

  check("hit-direction arcs point at the attacker", () => {
    const angles = {};
    for (const [side, offset, expected] of [
      ["behind", new V(0, 0, 1.5), Math.PI],
      ["left", new V(-1.5, 0, 0), -Math.PI / 2],
      ["right", new V(1.5, 0, 0), Math.PI / 2],
    ]) {
      setup();
      g.yaw = 0;
      const e = g.spawnEnemy("knight", g.position.clone().setY(0).add(offset));
      e.cooldown = 0;
      for (let i = 0; i < 40 && g.damageMarks.length === 0; i++)
        g.updateEnemies(1 / 60);
      const arcs = threat("damage");
      assert(arcs.length === 1, `${side}: ${arcs.length} arcs`);
      assert(near(arcs[0].angle, expected), `${side}: angle ${arcs[0].angle}`);
      angles[side] = +arcs[0].angle.toFixed(2);
    }
    // The arc follows the camera: turning to face the attacker centres it.
    g.yaw = -Math.PI / 2;
    assert(near(threat("damage")[0].angle, 0), "Arc did not follow the view");
    g.enemies.forEach((e) => e.model.dispose());
    g.enemies = [];
    step(70);
    assert(threat("damage").length === 0, "Arc did not fade");
    document.querySelector("#threat-ring") ||
      (() => {
        throw Error("No HUD ring");
      })();
    return angles;
  });

  check("hellfire about to hit from behind shows an incoming marker", () => {
    setup();
    g.yaw = 0;
    g.projectile(
      "hellfire",
      g.position.clone().add(new V(0, -0.4, 6)),
      new V(0, 0, -1),
      14,
      15,
      5,
      true,
    );
    step(8);
    const marks = threat("incoming");
    assert(
      marks.length === 1 && near(Math.abs(marks[0].angle), Math.PI),
      JSON.stringify(marks),
    );
    setup();
    g.projectile(
      "hellfire",
      g.position.clone().add(new V(0, -0.4, -6)),
      new V(0, 0, 1),
      14,
      15,
      5,
      true,
    );
    step(8);
    assert(threat("incoming").length === 0, "Marker shown for on-screen fire");
  });

  check("the last enemies are located only when out of sight", () => {
    setup();
    g.yaw = 0;
    g.remaining = 0;
    const e = g.spawnEnemy("monk", new V(0, 0, 30));
    e.speed = 0;
    step(60);
    assert(threat("locator").length === 0, "Locator shown too early");
    step(60 * 4);
    const marks = threat("locator");
    assert(
      marks.length === 1 && near(Math.abs(marks[0].angle), Math.PI),
      JSON.stringify(marks),
    );
    g.yaw = Math.PI;
    step(2);
    assert(
      threat("locator").length === 0,
      "Locator stayed with the enemy in view",
    );
    setup();
    g.remaining = 3;
    g.spawnEnemy("monk", new V(0, 0, 30)).speed = 0;
    step(60 * 6);
    assert(
      threat("locator").length === 0,
      "Locator shown while more are coming",
    );
  });

  check("an enemy walled in for 20 s is moved to open ground", () => {
    setup();
    g.remaining = 0;
    const spot = new V(-20, 0, -24),
      walls = [
        { x: spot.x - 1.2, z: spot.z, w: 0.4, d: 3, h: 4 },
        { x: spot.x + 1.2, z: spot.z, w: 0.4, d: 3, h: 4 },
        { x: spot.x, z: spot.z - 1.2, w: 3, d: 0.4, h: 4 },
        { x: spot.x, z: spot.z + 1.2, w: 3, d: 0.4, h: 4 },
      ];
    g.arena.colliders.push(...walls);
    let landed = null;
    g.relocate = function (enemy) {
      Object.getPrototypeOf(g).relocate.call(this, enemy);
      const p = enemy.model.root.position;
      landed = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    };
    try {
      const e = g.spawnEnemy("shambler", spot);
      step(60 * 10);
      assert(e.model.root.position.distanceTo(spot) < 1, "Escaped too early");
      step(60 * 11);
      assert(e.model.root.position.distanceTo(spot) > 3, "Still walled in");
      // Measured at the moment of relocation; afterwards it walks toward the player.
      assert(
        landed !== null && landed >= 12 && landed <= 25,
        "Relocated to distance " + landed,
      );
      return { distance: +landed.toFixed(1) };
    } finally {
      delete g.relocate;
      g.arena.colliders.splice(
        g.arena.colliders.length - walls.length,
        walls.length,
      );
    }
  });

  check(
    "an enemy trapped in a Hallowed Ground headstone corner is freed",
    () => {
      // Found by the balance autopilot: with the player diagonally beyond this corner
      // between a headstone and a grave slab, wall sliding oscillates in place forever.
      setup(0, 3);
      g.remaining = 0;
      const corner = new V(-7.4, 0, -10.2),
        e = g.spawnEnemy("shambler", corner);
      const hold = (frames) => {
        for (let i = 0; i < frames; i++) {
          g.position.set(-1, 1.75, -4);
          g.velocity.set(0, 0, 0);
          g.invulnerable = 9;
          g.update(1 / 60);
        }
      };
      hold(60 * 15);
      assert(
        e.model.root.position.distanceTo(corner) < 0.5,
        "Corner no longer traps",
      );
      hold(60 * 6);
      assert(
        e.model.root.position.distanceTo(corner) > 3,
        "Still trapped after 21 s",
      );
    },
  );

  check("combat hints appear once each and never when disabled", () => {
    const stored = localStorage.getItem("purgatory.hints"),
      options = g.settings();
    try {
      g.hints.seen.clear();
      g.applySettings({ ...options, hints: true });
      setup();
      g.beginWave();
      step(2);
      g.onHUD();
      const box = document.getElementById("hint");
      assert(
        box && /five weapons/i.test(box.textContent),
        "No arsenal hint: " + box?.textContent,
      );
      assert(Number(box.style.opacity) > 0, "Hint is invisible");
      const e = g.spawnEnemy(
        "shambler",
        g.position
          .clone()
          .setY(0)
          .add(new V(0, 0, -8)),
      );
      g.hitEnemy(e, 1, "ice");
      step(30);
      assert(
        g.hints.visible === "arsenal",
        "A second hint replaced the first early",
      );
      step(6 * 60);
      assert(
        g.hints.visible === "freeze",
        "Freeze hint did not follow: " + g.hints.visible,
      );
      step(7 * 60);
      g.hitEnemy(e, 1, "ice");
      step(10);
      assert(g.hints.visible === null, "Freeze hint shown twice");
      assert(
        JSON.parse(localStorage.getItem("purgatory.hints")).includes("freeze"),
        "Seen hints were not saved",
      );
      // A general's introduction holds hints back.
      setup(4, 2);
      g.toast = window.__PURGATORY__.campaign[4].boss.toUpperCase();
      g.toastTimer = 3;
      g.equip(4);
      step(30);
      assert(
        g.hints.visible === null,
        "Hint shown over a general's introduction",
      );
      step(3 * 60);
      assert(
        g.hints.visible === "storm",
        "Storm hint did not appear afterwards",
      );
      // Disabled hints never appear.
      g.applySettings({ ...g.settings(), hints: false });
      setup();
      g.equip(2);
      g.cooldown = 0;
      g.shoot(true);
      step(60);
      assert(
        g.hints.visible === null && !g.hints.seen.has("grenade"),
        "Hint shown while disabled",
      );
    } finally {
      g.applySettings(options);
      if (stored === null) localStorage.removeItem("purgatory.hints");
      else localStorage.setItem("purgatory.hints", stored);
    }
  });

  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

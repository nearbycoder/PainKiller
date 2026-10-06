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

  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

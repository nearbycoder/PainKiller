// Scenario checks for the fifth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round5`.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [],
    saved = structuredClone(g.save),
    volume = g.sound.volume;
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.hints.setEnabled(false);

  // A scripted fight: aim at the nearest enemy in sight, fire, strafe and hop. With
  // `pauses`, real time passes between batches of frames, so the audio clock, the music
  // beat and the enemy-cue budget all move on by different amounts each time.
  async function fight(
    level,
    room,
    seed,
    { frames = 900, pauses = false } = {},
  ) {
    api.seed(seed);
    api.start(level, room);
    g.sound.start();
    for (let f = 0; f < frames && g.mode === "playing"; f++) {
      let best = null,
        bestDistance = Infinity;
      for (const e of g.enemies) {
        const p = e.model.root.position.clone();
        p.y += e.type === "boss" ? 2.5 : 1.1;
        const d = p.distanceTo(g.position);
        if (d < bestDistance) {
          bestDistance = d;
          best = p;
        }
      }
      g.keys.clear();
      if (best) {
        const dir = best.clone().sub(g.position).normalize();
        g.yaw = Math.atan2(-dir.x, -dir.z);
        g.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        const want = bestDistance < 6 ? 1 : bestDistance < 18 ? 3 : 2;
        if (g.weapon !== want && g.ammo[want] > 0) g.equip(want);
        g.mouse = [true, false];
        g.keys.add(Math.sin(f / 90) > 0 ? "KeyA" : "KeyD");
      } else g.mouse = [false, false];
      if (f % 47 === 0) g.keys.add("Space");
      api.step(1);
      if (pauses && f % 60 === 0) {
        // Hold the simulation (the live frame loop only steps "playing") while the
        // audio clock runs on.
        g.mode = "paused";
        await wait(25 + (f % 7) * 9);
        g.mode = "playing";
      }
    }
    g.mouse = [false, false];
    g.keys.clear();
    return JSON.stringify({
      mode: g.mode,
      health: g.health,
      armor: +g.armor.toFixed(3),
      kills: g.levelKills,
      wave: g.wave,
      at: g.position.toArray().map((v) => +v.toFixed(3)),
      enemies: g.enemies.map(
        (e) =>
          e.type +
          ":" +
          [e.model.root.position.x, e.model.root.position.z]
            .map((v) => v.toFixed(3))
            .join(","),
      ),
    });
  }

  await check(
    "R5-1 a seeded fight repeats with sound playing, time passing and other sectors in between",
    async () => {
      // Sound audible to the game (the runner mutes the window, not the game).
      g.sound.setVolume(0.45);
      const first = await fight(4, 2, 123, { pauses: true });
      // Other sectors, other breeds and freshly built models in between.
      await fight(0, 3, 9, { frames: 300 });
      for (const type of ["hound", "witch", "brute", "monk", "knight"])
        api.spawn(type);
      api.step(30);
      const again = await fight(4, 2, 123, { pauses: true });
      assert(again === first, `differs:\n${first}\n${again}`);
      const other = await fight(4, 2, 124);
      assert(other !== first, "a different seed gave the same fight");
      return JSON.parse(first);
    },
  );

  await check(
    "R5-1 the storm orb hits as often at 30, 60, 120 and 144 Hz",
    () => {
      const hitEnemy = g.hitEnemy,
        rates = {};
      try {
        for (const hz of [30, 60, 120, 144])
          for (const phase of [0, 1]) {
            api.seed(5);
            api.start(0, 0);
            g.waveDelay = 9999;
            g.invulnerable = 999;
            // Displayed frames before the fight, so the two phases start differently.
            g.frame += phase;
            const at = g.position.clone().setY(0).add({ x: 0, y: 0, z: -6 });
            api.spawn("brute");
            const brute = g.enemies.at(-1);
            brute.model.root.position.set(at.x, 0, at.z);
            brute.hp = brute.maxHp = 1e6;
            brute.speed = 0;
            g.projectile(
              "storm",
              at.clone().setY(1.4).add({ x: 0, y: 0, z: 3 }),
              g.position.clone().set(0, 0, -1),
              0.001,
              140,
              3,
            );
            let hits = 0;
            g.hitEnemy = function (e, damage, kind, ...rest) {
              if (kind === "electric") hits++;
              return hitEnemy.call(this, e, damage, kind, ...rest);
            };
            // Drive the real frame loop with display timestamps for two seconds.
            let t = 1000;
            g.lastTime = t;
            for (let i = 0; i < 2 * hz; i++) g.loop((t += 1000 / hz));
            g.hitEnemy = hitEnemy;
            rates[`${hz}Hz/${phase}`] = hits / 2;
          }
      } finally {
        g.hitEnemy = hitEnemy;
      }
      const values = Object.values(rates);
      assert(
        Math.min(...values) >= 5,
        "the orb missed: " + JSON.stringify(rates),
      );
      assert(
        Math.max(...values) - Math.min(...values) <= 1,
        "hits per second differ: " + JSON.stringify(rates),
      );
      return rates;
    },
  );

  await check("R5-1 the shader warm-up leaves the sequence untouched", () => {
    const old = g.warmSet,
      before = api.randomState();
    g.warmSet = undefined;
    try {
      g.warmUpSet();
      assert(api.randomState() === before, "the warm-up moved the sequence");
    } finally {
      g.warmSet = old;
    }
    return before;
  });

  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

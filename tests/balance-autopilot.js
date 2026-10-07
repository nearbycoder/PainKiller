// Balance autopilot: a scripted player clears sample sectors on each difficulty and reports
// clear time, damage taken (by cause) and deaths. Run it headlessly with
//
//   npm run test:browser -- --checks tests/balance-autopilot.js --out artifacts/balance.json
//
// Options (set window.__AUTOPILOT__ first, e.g. with --before): { sectors, difficulties, seeds },
// or { sectors: "all" } for every sector of the campaign.
//
// The bot aims perfectly at the nearest enemy in sight, picks a weapon by range, backs off
// at close range, strafes, hops, and jumps general shockwaves. It does not path-find or route
// to pickups. Treat it as a repeatable yardstick for comparing builds, not as a human playtest.
// Each run seeds the game's random sequence, so the same build gives the same results in any
// session and in any order; a single sector can be replayed with { sectors: [[level, room]] }.
(() => {
  const api = window.__PURGATORY__,
    g = api.game,
    options = window.__AUTOPILOT__ || {};
  const SECTORS =
    options.sectors === "all"
      ? api.campaign.flatMap((l, level) =>
          Array.from({ length: l.rooms }, (_, room) => [level, room]),
        )
      : options.sectors || [
          [0, 0],
          [0, 3],
          [5, 0],
          [12, 2],
          [17, 4],
          [22, 4],
          [4, 2],
          [10, 2],
          [19, 2],
          [23, 3],
        ];
  const DIFFICULTIES = options.difficulties || [0, 1, 2];
  const SEEDS = options.seeds || 2;
  const LIMIT = 60 * 60 * 6;
  const saved = structuredClone(g.save),
    difficulty = g.difficulty,
    render = g.renderWorld,
    hurt = g.hurt,
    relocate = g.relocate;
  g.sound.setVolume(0);
  g.renderWorld = () => {};

  function run(level, room, diff, seed) {
    api.seed(1 + level * 1000 + room * 10 + diff + seed * 7919);
    g.difficulty = diff;
    api.start(level, room);
    const causes = {};
    g.hurt = function (damage, from, cause = "unknown", ...rest) {
      const before = this.health + this.armor;
      hurt.call(this, damage, from, cause, ...rest);
      const taken = before - (this.health + this.armor);
      if (taken > 0) causes[cause] = (causes[cause] || 0) + taken;
    };
    // Stuck-enemy rescues (where each enemy was wedged) and anything outside the arena.
    const rescues = [],
      escaped = new Set();
    const where = (p) => [p.x, p.z].map((v) => +v.toFixed(1));
    g.relocate = function (e) {
      rescues.push({ type: e.type, at: where(e.model.root.position) });
      return relocate.call(this, e);
    };
    const outside = (p) =>
      Math.abs(p.x) > 27.5 || Math.abs(p.z) > 32.5 || p.y < -2;
    let frames = 0,
      minHealth = 100;
    while (frames < LIMIT && g.mode === "playing" && !g.arenaCleared) {
      let best = null,
        bestDistance = Infinity;
      for (const e of g.enemies) {
        const p = e.model.root.position.clone();
        p.y += e.type === "boss" ? 2.5 : 1.1;
        const d = p.distanceTo(g.position);
        const dir = p.clone().sub(g.position).normalize();
        if (d < bestDistance && g.wallDistance(g.position, dir, d) >= d - 0.3) {
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
        const w = [want, 1, 3, 4, 2, 0].find((i) => i === 0 || g.ammo[i] > 0);
        if (g.weapon !== w) g.equip(w);
        g.mouse = [true, false];
        if (bestDistance < 7) g.keys.add("KeyS");
        g.keys.add(Math.sin(frames / 90) > 0 ? "KeyA" : "KeyD");
      } else {
        g.mouse = [false, false];
        g.yaw += 0.03;
        g.keys.add("KeyW");
      }
      const ringClose = g.rings.some((r) => {
        const d = Math.hypot(
          g.position.x - r.mesh.position.x,
          g.position.z - r.mesh.position.z,
        );
        return !r.hit && d - r.radius > 0 && d - r.radius < 2.5;
      });
      if (ringClose || frames % 47 === 0) g.keys.add("Space");
      api.step(1);
      frames++;
      if (outside(g.position)) escaped.add("player");
      for (const e of g.enemies)
        if (outside(e.model.root.position)) escaped.add(e.type);
      minHealth = Math.min(minHealth, g.health);
    }
    g.mouse = [false, false];
    g.keys.clear();
    g.hurt = hurt;
    g.relocate = relocate;
    const taken = Object.values(causes).reduce((a, b) => a + b, 0);
    return {
      level,
      room,
      boss:
        !!api.campaign[level].boss && room === api.campaign[level].rooms - 1,
      difficulty: diff,
      seed,
      outcome: g.arenaCleared
        ? "cleared"
        : g.mode === "dead"
          ? "died"
          : "timeout",
      seconds: +(frames / 60).toFixed(1),
      kills: g.levelKills,
      damageTaken: Math.round(taken),
      minHealth: Math.round(minHealth),
      // Enemies still alive when a run times out, to diagnose stuck encounters.
      leftover:
        g.mode === "playing" && !g.arenaCleared
          ? g.enemies.map((e) => ({
              type: e.type,
              at: [e.model.root.position.x, e.model.root.position.z].map(
                (v) => +v.toFixed(1),
              ),
            }))
          : [],
      rescues,
      escaped: [...escaped],
      causes: Object.fromEntries(
        Object.entries(causes).map(([k, v]) => [k, Math.round(v)]),
      ),
    };
  }

  const runs = [];
  try {
    for (const [level, room] of SECTORS)
      for (const diff of DIFFICULTIES)
        for (let seed = 0; seed < SEEDS; seed++)
          runs.push(run(level, room, diff, seed));
  } finally {
    g.renderWorld = render;
    g.hurt = hurt;
    g.relocate = relocate;
    g.difficulty = difficulty;
    g.save = saved;
    g.persist();
    g.level = saved.level;
    g.room = 0;
    g.loadArena();
    g.setMode("menu");
  }
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
  };
  const summary = [];
  for (const boss of [false, true])
    for (const diff of DIFFICULTIES) {
      const set = runs.filter((r) => r.boss === boss && r.difficulty === diff);
      if (!set.length) continue;
      summary.push({
        sectors: boss ? "general" : "ordinary",
        difficulty: ["Reverie", "Purgatory", "Torment"][diff],
        runs: set.length,
        cleared: set.filter((r) => r.outcome === "cleared").length,
        died: set.filter((r) => r.outcome === "died").length,
        timeouts: set.filter((r) => r.outcome === "timeout").length,
        rescues: set.reduce((n, r) => n + r.rescues.length, 0),
        medianSeconds: median(set.map((r) => r.seconds)),
        medianDamage: median(set.map((r) => r.damageTaken)),
      });
    }
  return { summary, runs };
})();

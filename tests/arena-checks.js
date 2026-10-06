// Guards encounter layouts: every sector's colliders and spawn points must match
// tests/fixtures/arena-colliders.json, recorded before the round-2 theme dressing.
// Regenerate the fixture only for a deliberate layout change.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [];
  const fixture = await (
    await fetch("/tests/fixtures/arena-colliders.json")
  ).json();
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  const changed = [];
  api.campaign.forEach((l, level) => {
    for (let room = 0; room < l.rooms; room++) {
      g.level = level;
      g.room = room;
      g.loadArena();
      const c = g.arena.colliders.map((c) =>
        [c.x, c.z, c.w, c.d, c.h].map((v) => +v.toFixed(3)),
      );
      const spawn = g.arena.spawn.map((v) =>
        [v.x, v.z].map((n) => +n.toFixed(3)),
      );
      const want = fixture[`${level}-${room}`];
      if (
        !want ||
        want.hash !== hash(JSON.stringify(c)) ||
        want.spawn !== hash(JSON.stringify(spawn))
      )
        changed.push(`${l.name} sector ${room + 1}`);
    }
  });
  results.push(
    changed.length
      ? {
          name: "arena layouts match the fixture",
          passed: false,
          error: "Changed: " + changed.join(", "),
        }
      : {
          name: "arena layouts match the fixture",
          passed: true,
          detail: Object.keys(fixture).length + " sectors",
        },
  );
  g.level = g.save.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

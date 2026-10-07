// Plays a production build through the real menus with the read-only API only:
// Enter Purgatory, then walk, turn and fire with synthetic keyboard and mouse input.
//   npm run package:web, extract the zip, then
//   node tools/firefox-checks.mjs --serve <folder> --checks tools/media/round4/web-play.js --capture x.jpg
(async () => {
  const api = window.__PURGATORY__,
    results = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (name, ok, detail) =>
    results.push(
      ok
        ? { name, passed: true, detail }
        : { name, passed: false, error: JSON.stringify(detail) },
    );
  const key = (type, code) =>
    window.dispatchEvent(
      new KeyboardEvent(type, { code, key: code, bubbles: true }),
    );
  const canvas = document.querySelector("#world");
  check(
    "the production API is read-only",
    !api.game && !api.start,
    Object.keys(api),
  );
  document.querySelector('[data-action="start"]').click();
  // Since round 6 a fresh save asks for the difficulty first; take the one offered.
  document.querySelector('[data-action="begin"][data-default]')?.click();
  const t0 = performance.now();
  while (api.state().mode !== "playing" && performance.now() - t0 < 60000)
    await wait(100);
  const start = api.state();
  check(
    "Enter Purgatory starts Hallowed Ground",
    start.mode === "playing" && start.level === 0,
    {
      mode: start.mode,
      level: start.level,
    },
  );
  await wait(4000); // the first wave arrives after three seconds
  const before = api.state();
  key("keydown", "KeyW");
  key("keydown", "ArrowLeft");
  await wait(1200);
  key("keyup", "KeyW");
  key("keyup", "ArrowLeft");
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { button: 0, bubbles: true }),
  );
  await wait(2500);
  window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
  await wait(500);
  const after = api.state();
  const moved = Math.hypot(
    after.position[0] - before.position[0],
    after.position[2] - before.position[2],
  );
  check("walking moves the player", moved > 3, { moved });
  const spent = before.ammo.map((n, i) =>
    typeof n === "number" ? n - after.ammo[i] : 0,
  );
  check(
    "holding the mouse button fires",
    spent.some((n) => n > 0),
    { weapon: after.weapon, spent },
  );
  check(
    "the first wave is in the arena",
    after.enemies.length + after.kills > 0,
    {
      enemies: after.enemies.length,
      kills: after.kills,
    },
  );
  check("it renders at a usable frame rate", after.fps >= 20, {
    fps: after.fps,
    drawCalls: after.drawCalls,
  });
  return results;
})();

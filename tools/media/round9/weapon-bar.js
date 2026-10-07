// Capture: the weapon bar with mixed reserves (stakes and grenades gone, rockets low).
//   npm run test:browser -- --checks tools/media/round9/weapon-bar.js --capture artifacts/r9/weapon-bar.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  api.seed(3);
  api.start(Number(window.__LEVEL__ ?? 0), 0);
  g.invulnerable = 1e9;
  g.waveDelay = 60;
  g.equip(1);
  g.ammo[1] = 40;
  g.altAmmo[1] = 3;
  g.ammo[2] = 0;
  g.altAmmo[2] = 0;
  g.ammo[3] = 4;
  g.altAmmo[3] = 380;
  for (let i = 0; i < 90; i++)
    await new Promise((r) => requestAnimationFrame(r));
  return [...document.querySelectorAll(".weapon-slots button")]
    .map((b) => b.getAttribute("aria-label"))
    .join(" · ");
})();

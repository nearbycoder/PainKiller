// Capture: the result screen after a chapter II level earns Quickening on a fresh save.
//   npm run test:browser -- --checks tools/media/round8/card-earned.js --capture artifacts/r8/card-earned.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  g.save = { ...g.save, cards: [], selectedCard: 0, records: {}, best: {} };
  delete g.save.resume;
  const level = api.campaign.findIndex((l) => l.chapter === 2);
  api.start(level, 0);
  g.levelKills = 112;
  g.levelSouls = 31;
  g.elapsed = 497;
  g.room = api.campaign[level].rooms - 1;
  g.arenaCleared = true;
  g.nextArena();
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector(".card-earned").textContent;
})();

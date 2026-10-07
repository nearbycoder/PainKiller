// Capture: the pause screen's tarot line, part way to a chapter III level's card.
//   npm run test:browser -- --checks tools/media/round8/tarot-pause.js --capture artifacts/r8/tarot-pause.jpg
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  g.save = { ...g.save, cards: [0, 1], selectedCard: 1 };
  api.start(api.campaign.findIndex((l) => l.chapter === 3), 1);
  g.levelSouls = 17;
  g.setMode("paused");
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector(".tarot-progress").textContent;
})();

// Capture: the difficulty page a fresh save opens on Enter Purgatory.
//   npm run test:browser -- --checks tools/media/round6/difficulty.js --capture docs/media/improvements/round6/r6-2-difficulty.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  const { freshSave } = await import("/src/core.ts");
  g.sound.setVolume(0);
  g.save = freshSave();
  g.setMode("playing");
  g.setMode("menu");
  document.querySelector('[data-action="start"]').click();
  await new Promise((r) => setTimeout(r, 600));
  return document.querySelector("h1").textContent;
})();

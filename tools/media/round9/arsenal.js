// Capture: the arsenal page with the default keys, on the Tempest.
//   npm run test:browser -- --checks tools/media/round9/arsenal.js --capture docs/media/improvements/round9/r9-4-arsenal.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  g.setMode("playing");
  g.setMode("menu");
  document.querySelector('[data-action="page"][data-value="arsenal"]').click();
  document.querySelector('[data-action="weapon"][data-value="4"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector(".weapon-trick").textContent;
})();

// Capture: Options asks before Restore all defaults resets every option and binding.
//   npm run test:browser -- --checks tools/media/round8/defaults-dialog.js --capture docs/media/improvements/round8/r8-4-defaults-dialog.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  g.setMode("playing");
  g.setMode("menu");
  document.querySelector('[data-action="page"][data-value="settings"]').click();
  document
    .querySelector('[data-action="settings-tab"][data-value="controls"]')
    .click();
  document.querySelector('[data-action="defaults"]').click();
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector(".confirm-dialog").textContent;
})();

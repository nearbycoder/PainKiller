// Capture: Options › Controls with the stick layout swapped and sprint on toggle.
//   npm run test:browser -- --checks tools/media/round7/controls.js --capture docs/media/improvements/round7/r7-3-controls.jpg
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  g.applySettings({ ...g.settings(), swapSticks: true, toggleSprint: true });
  g.setMode("playing");
  g.setMode("menu");
  document.querySelector('[data-action="page"][data-value="settings"]').click();
  document
    .querySelector('[data-action="settings-tab"][data-value="controls"]')
    .click();
  await new Promise((r) => setTimeout(r, 300));
  const row = [...document.querySelectorAll(".option-row")].find((r) =>
    r.textContent.startsWith("Stick dead zone"),
  );
  row.scrollIntoView({ block: "start" });
  await new Promise((r) => setTimeout(r, 300));
  return row.textContent.slice(0, 20);
})();

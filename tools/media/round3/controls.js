// Capture: Options › Controls with controller rows mid-rebind.
//   npm run test:browser -- --checks tools/media/round3/controls.js --capture docs/media/improvements/round3/r3-1-controller-rebinding.jpg
(() => {
  const g = window.__PURGATORY__.game;
  const s = g.settings();
  s.padBindings.jump = 7;
  s.padBindings.primary = 4;
  s.padBindings.previous = null;
  s.padBindings.weapon4 = 15;
  g.applySettings(s);
  g.setMode("menu");
  document.querySelector('[data-action="page"][data-value="settings"]').click();
  document
    .querySelector('[data-action="settings-tab"][data-value="controls"]')
    .click();
  document
    .querySelector('[data-action="pad-rebind"][data-value="use"]')
    .click();
  document.querySelector(".pad-list").scrollIntoView({ block: "start" });
  return "ok";
})();

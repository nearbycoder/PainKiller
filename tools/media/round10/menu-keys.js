// Capture: the title screen's key line with the keyboard and with a (synthetic)
// controller, for docs/media/improvements/round10/r10-4-menu-keys.jpg.
//   npm run test:browser -- --checks tools/media/round10/menu-keys.js --size 960x600
(async () => {
  const g = window.__PURGATORY__.game,
    out = window.__KEYS_OUT__ || "artifacts/r10/keys";
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  const capture = async (file) => {
    delete window.__RUNNER_CAPTURED__;
    console.info(`__RUNNER__ capture ${out}/${file}`);
    while (!window.__RUNNER_CAPTURED__)
      await new Promise((r) => setTimeout(r, 30));
  };
  g.sound.setVolume(0);
  g.setMode("menu");
  await frames(30);
  await capture("keyboard.png");
  // The frame loop polls the real (absent) controllers every frame; hold it off so the
  // synthetic one stays connected for the capture.
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
  await frames(2);
  g.controls.poll(1 / 60, [
    {
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    },
  ]);
  await new Promise((r) => setTimeout(r, 200));
  await capture("controller.png");
  window.requestAnimationFrame = raf;
  raf(g.loop);
  return document.querySelector(".menu-keys").innerText;
})();

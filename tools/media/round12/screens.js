// A look at the menus as a player meets them: the title, Options › Video, level select,
// the pause and death screens. Set window.__SCREENS_OUT__ with --before.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__SCREENS_OUT__ || "artifacts/r12/screens";
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  const capture = async (file) => {
    delete window.__RUNNER_CAPTURED__;
    console.info(`__RUNNER__ capture ${file}`);
    while (!window.__RUNNER_CAPTURED__)
      await new Promise((r) => setTimeout(r, 30));
  };
  const click = (sel) => document.querySelector(sel).click();
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  g.setMode("menu");
  await frames(60);
  await capture(`${out}/title.jpg`);
  click('[data-action="page"][data-value="settings"]');
  await frames(20);
  await capture(`${out}/options-video.jpg`);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
  await frames(10);
  const level = document.querySelector(
    '[data-action="page"][data-value="campaign"]',
  );
  if (level) {
    level.click();
    await frames(20);
    await capture(`${out}/levels.jpg`);
  }
  api.seed(2);
  api.start(3, 0);
  g.invulnerable = 1e9;
  g.waveDelay = 60;
  await frames(60);
  g.setMode("paused");
  await frames(20);
  await capture(`${out}/pause.jpg`);
  g.setMode("playing");
  g.invulnerable = 0;
  g.hurt(9999, g.position.clone().setX(g.position.x + 3), "melee", "brute");
  await frames(40);
  await capture(`${out}/death.jpg`);
  g.setMode("menu");
  return "ok";
})();

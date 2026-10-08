// Capture: a sector change through the gate and a menu page change, frozen at set
// moments of their animations (the Web Animations API pins each time), for a strip.
//   npm run test:browser -- --before 'window.__TRANSITIONS_OUT__="artifacts/r12/transitions"' --checks tools/media/round12/transitions.js
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__TRANSITIONS_OUT__ || "artifacts/r12/transitions";
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
  const pin = async (el, ms) => {
    for (const a of el.getAnimations()) {
      a.pause();
      a.currentTime = ms;
    }
    await frames(2);
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  // Through the gate: Hallowed Ground sector 1 cleared, then sector 2 fades in.
  api.seed(4);
  api.start(0, 0);
  g.invulnerable = 1e9;
  g.waveDelay = 1e9;
  await frames(60);
  g.enemies = [];
  g.remaining = 0;
  g.arenaCleared = true;
  await frames(5);
  await capture(`${out}/gate-0-before.jpg`);
  g.nextArena();
  g.messages.clear();
  for (const ms of [0, 200, 350, 500, 750]) {
    await pin(g.sceneFade, ms);
    await capture(`${out}/gate-${ms}.jpg`);
  }
  for (const a of g.sceneFade.getAnimations()) a.finish();
  // A page change: the title, then Options fading in.
  g.setMode("menu");
  await frames(30);
  for (const a of document.getAnimations()) a.finish();
  await capture(`${out}/page-0-title.jpg`);
  document.querySelector('[data-action="page"][data-value="settings"]').click();
  const main = document.querySelector("#app main");
  for (const ms of [0, 90, 180, 260]) {
    await pin(main, ms);
    await capture(`${out}/page-${ms}.jpg`);
  }
  for (const a of document.getAnimations()) a.finish();
  g.setMode("playing");
  g.setMode("menu");
  return "ok";
})();

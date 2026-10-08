// Measurement: the level-complete (and ending) screen as a frozen frame pair, with its
// text and without, for tools/media/round9/hud-contrast.mjs. Anything behind the text
// (the arena, the menu's vignette, a backing) counts as background. Set
// window.__RESULT_LEVELS__ (level indices; 23 gives the ending) and window.__RESULT_OUT__
// (a folder) with --before.
//   npm run test:browser -- --before 'window.__RESULT_LEVELS__=[0,8,14,23]; window.__RESULT_OUT__="artifacts/r10/result/after"' --checks tools/media/round10/result-contrast.js --out artifacts/r10/result/after.json
//   node tools/media/round9/hud-contrast.mjs artifacts/r10/result/after.json artifacts/r10/result/after
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__RESULT_OUT__ || "artifacts/r10/result",
    levels = window.__RESULT_LEVELS__ || [8],
    headings = window.__RESULT_HEADINGS__ || [0, 180];
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
  const selectors = {
    kicker: ".end-screen > .menu-kicker",
    title: ".end-screen > h1",
    subtitle: ".end-screen > p:not(.menu-kicker):not(.record-line)",
    "stat numbers": ".result-stats b",
    "stat labels": ".result-stats span",
    "record line": ".record-line",
    "card line": ".card-earned",
    commands: ".end-screen nav button",
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  const report = {};
  const raf = window.requestAnimationFrame;
  let frozen = false;
  const thaw = () => {
    if (!frozen) return;
    window.requestAnimationFrame = raf;
    raf(g.loop);
    frozen = false;
  };
  for (const level of levels) {
    for (const heading of headings) {
      thaw();
      api.seed(3);
      api.start(level, api.campaign[level].rooms - 1);
      g.invulnerable = 1e9;
      g.waveDelay = 60; // no enemies: the same arena view every run
      await frames(60);
      g.yaw += (heading * Math.PI) / 180;
      g.pitch = 0;
      await frames(20);
      // A deathless record clear with a relic: every line the screen can show, including
      // a tarot card won for the first time (chapters I–IV; the ending has none).
      g.levelKills = 61;
      g.levelSouls = 14;
      g.secrets = 1;
      g.elapsed = 512;
      g.arenaCleared = true;
      g.completeLevel();
      await frames(30);
      window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
      frozen = true;
      await new Promise((r) => setTimeout(r, 400));
      const boxes = {};
      for (const [name, selector] of Object.entries(selectors)) {
        const nodes = [...document.querySelectorAll(selector)].filter(
          (n) => n.getBoundingClientRect().width > 0,
        );
        if (!nodes.length) continue;
        boxes[name] = nodes.map((n) => {
          const r = n.getBoundingClientRect(),
            c = getComputedStyle(n)
              .color.match(/\d+(\.\d+)?/g)
              .map(Number);
          return {
            box: [r.left, r.top, r.right, r.bottom].map(Math.round),
            color: c.slice(0, 3),
          };
        });
      }
      const file = `${g.mode}-${level}-h${heading}`,
        name = `${out}/${file}`;
      await capture(`${name}-hud.png`);
      // Hide only the text: the screen itself (and any backing it draws) stays.
      const screen = document.querySelector(".end-screen");
      for (const child of screen.children) child.style.visibility = "hidden";
      await new Promise((r) => setTimeout(r, 200));
      await capture(`${name}-bare.png`);
      for (const child of screen.children) child.style.visibility = "";
      report[`${level}-${heading}`] = {
        name: g.mode === "ending" ? "Ending" : api.campaign[level].name,
        heading,
        file,
        dpr: devicePixelRatio,
        boxes,
      };
    }
  }
  thaw();
  g.setMode("menu");
  return report;
})();

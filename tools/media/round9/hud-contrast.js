// Measurement: the same frozen frame with and without the HUD, for
// tools/media/round9/hud-contrast.mjs. Set window.__HUD_LEVELS__ (level indices) and
// window.__HUD_OUT__ (a folder) with --before.
//   npm run test:browser -- --before 'window.__HUD_LEVELS__=[8,14]; window.__HUD_OUT__="artifacts/r9/hud/after"' --checks tools/media/round9/hud-contrast.js
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__HUD_OUT__ || "artifacts/r9/hud",
    levels = window.__HUD_LEVELS__ || [8];
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
  // The labels measured, with the colour each is drawn in.
  const selectors = {
    "health label": ".health > span:last-child",
    "armor label": ".armor > span:last-child",
    health: "#hud-health",
    armor: "#hud-armor",
    souls: "#hud-souls",
    "ammo label": "#hud-primary-label",
    "alt label": "#hud-secondary-label",
    ammo: "#hud-ammo",
    "alt ammo": "#hud-alt",
    weapon: "#hud-weapon",
    card: "#hud-card",
    "key line": "#hud-help",
    chapter: "#hud-chapter",
    level: "#hud-level",
    gate: "#hud-gate",
    objective: "#hud-objective",
    remaining: ".combat-stats p",
    slain: ".combat-stats > span",
    "slot numbers": ".weapon-slots small",
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
    thaw();
    api.seed(3);
    api.start(level, 0);
    g.invulnerable = 1e9;
    g.waveDelay = 60; // no enemies yet: the same arena view every run
    g.equip(1);
    await frames(90);
    // Freeze: the frame loop stops rescheduling, so the canvas keeps its last frame.
    window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
    frozen = true;
    g.toastTimer = 0;
    g.onHUD();
    await new Promise((r) => setTimeout(r, 300));
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
    const name = `${out}/level-${level}`;
    await capture(`${name}-hud.png`);
    // The edge shade (round 9) belongs to the background: only the text and icons go.
    const scrim = document.getElementById("hud-scrim");
    document.getElementById("app").style.visibility = "hidden";
    if (scrim) scrim.style.visibility = "visible";
    await new Promise((r) => setTimeout(r, 200));
    await capture(`${name}-bare.png`);
    document.getElementById("app").style.visibility = "";
    if (scrim) scrim.style.visibility = "";
    report[level] = {
      name: api.campaign[level].name,
      dpr: devicePixelRatio,
      boxes,
    };
  }
  thaw();
  g.setMode("menu");
  return report;
})();

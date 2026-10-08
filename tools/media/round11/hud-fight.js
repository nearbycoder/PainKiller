// Measurement: round 9's frame pairs (with and without the HUD) in the views rounds 9 and
// 10 left out: looking down at the ground, a rocket blast five metres ahead and the
// chaingun's muzzle flash, plus level gazes at four headings. Every frame also shows the
// mid-screen messages (a wave toast, the gate prompt and a general's name and bar), so
// they are measured with the HUD. Read by tools/media/round9/hud-contrast.mjs. Set
// window.__FIGHT_LEVELS__ (level indices) and window.__FIGHT_OUT__ (a folder) with --before.
//   npm run test:browser -- --before 'window.__FIGHT_LEVELS__=[8,0,14,1]; window.__FIGHT_OUT__="artifacts/r11/fight/after"' --checks tools/media/round11/hud-fight.js --out artifacts/r11/fight/after.json
//   node tools/media/round9/hud-contrast.mjs artifacts/r11/fight/after.json artifacts/r11/fight/after
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__FIGHT_OUT__ || "artifacts/r11/fight",
    levels = window.__FIGHT_LEVELS__ || [8];
  // [view, heading in degrees, pitch in radians, what happens just before the frame]
  const views = window.__FIGHT_VIEWS__ || [
    ["level", 0, 0, ""],
    ["level", 90, 0, ""],
    ["level", 180, 0, ""],
    ["level", 270, 0, ""],
    ["down", 0, -1.0, ""],
    ["down", 180, -1.0, ""],
    ["blast", 0, -0.15, "blast"],
    ["flash", 0, -0.15, "flash"],
  ];
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
    chapter: "#hud-chapter",
    level: "#hud-level",
    gate: "#hud-gate",
    objective: "#hud-objective",
    remaining: ".combat-stats p",
    slain: ".combat-stats > span",
    "slot numbers": ".weapon-slots small",
    toast: "#toast",
    "gate prompt": "#gate-prompt",
    "general name": "#boss-name",
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
    let index = 0;
    for (const [view, heading, pitch, event] of views) {
      thaw();
      api.seed(3);
      api.start(level, 0);
      g.invulnerable = 1e9;
      g.waveDelay = 60; // no enemies yet: the same arena view every run
      g.equip(3);
      await frames(90);
      g.yaw += (heading * Math.PI) / 180;
      g.pitch = pitch;
      await frames(30);
      if (event === "blast") {
        const at = g.position.clone().addScaledVector(g.direction(), 5);
        at.y = 0.6;
        g.explode(at, 0, 4);
        await frames(3);
      } else if (event === "flash") {
        g.mouse = [false, true]; // the chaingun
        await frames(7);
        g.mouse = [false, false];
      }
      // Freeze: the frame loop stops rescheduling, so the canvas keeps its last frame.
      window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
      frozen = true;
      g.toast = "WAVE 2  /  THE GATES ARE SEALED";
      g.toastTimer = 60;
      // The gate prompt and a general's bar as they look in play, kept through the one
      // frame still scheduled when the loop froze; nothing else changes.
      const hud = g.onHUD;
      g.onHUD = () => {
        hud();
        document.getElementById("gate-prompt").textContent =
          `[ ${g.keyFor("use")} ]  NEXT SECTOR`;
        document.getElementById("boss-hud").style.display = "block";
        document.getElementById("boss-name").textContent = "The Sand Colossus";
        document.getElementById("boss-fill").style.width = "70%";
      };
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
      const file = `level-${level}-${view}-${heading}-${index++}`,
        name = `${out}/${file}`;
      await capture(`${name}-hud.png`);
      // The edge shade (round 9) and any shade drawn behind a message belong to the
      // background: only the text, icons and bars go.
      const scrim = document.getElementById("hud-scrim"),
        shades = document.createElement("style");
      shades.textContent =
        "#toast::before, #gate-prompt::before, #boss-name::before { visibility: visible !important; }";
      document.head.append(shades);
      document.getElementById("app").style.visibility = "hidden";
      if (scrim) scrim.style.visibility = "visible";
      await new Promise((r) => setTimeout(r, 200));
      await capture(`${name}-bare.png`);
      document.getElementById("app").style.visibility = "";
      if (scrim) scrim.style.visibility = "";
      shades.remove();
      g.onHUD = hud;
      report[`${level}-${file}`] = {
        name: `${api.campaign[level].name} · ${view}`,
        heading,
        file,
        dpr: devicePixelRatio,
        boxes,
      };
    }
  }
  thaw();
  g.toastTimer = 0;
  document.getElementById("gate-prompt").textContent = "";
  g.setMode("menu");
  return report;
})();

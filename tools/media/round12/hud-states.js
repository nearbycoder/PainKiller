// Measurement: round 9's frame pairs (with and without the HUD) in the three states
// round 11 left out: a crowded fight (a dozen enemies close in front, hellfire in the air),
// Wraith form (the cyan edge glow) and the low-health vignette at its strongest, with the
// pulsing health readout pinned at its faintest. The overlays belong to the background.
// Read by tools/media/round9/hud-contrast.mjs. Set window.__STATE_LEVELS__,
// __STATE_OUT__ and, optionally, __STATE_VIEWS__ with --before.
//   npm run test:browser -- --before 'window.__STATE_LEVELS__=[8,0]; window.__STATE_OUT__="artifacts/r12/states/before"' --checks tools/media/round12/hud-states.js --out artifacts/r12/states/before.json
//   node tools/media/round9/hud-contrast.mjs artifacts/r12/states/before.json artifacts/r12/states/before
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__STATE_OUT__ || "artifacts/r12/states",
    levels = window.__STATE_LEVELS__ || [8];
  // [view, heading in degrees, pitch in radians, what happens just before the frame]
  const views = window.__STATE_VIEWS__ || [
    ["crowd", 0, -0.05, "crowd"],
    ["crowd", 180, -0.05, "crowd"],
    ["wraith", 0, 0, "wraith"],
    ["wraith", 180, 0, "wraith"],
    ["low", 0, 0, "low"],
    ["low", 180, 0, "low"],
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
      if (event === "crowd") {
        // A dozen of the damned close in front, casters among them, mid-fight.
        const d = g.direction(),
          side = new g.position.constructor(-d.z, 0, d.x);
        const types = [
          "brute",
          "skeleton",
          "witch",
          "shambler",
          "monk",
          "knight",
        ];
        for (let i = 0; i < 12; i++) {
          const p = g.position
            .clone()
            .addScaledVector(d, 4 + (i % 4) * 2.2)
            .addScaledVector(side, ((i % 5) - 2) * 1.6);
          p.y = 0;
          g.spawnEnemy(types[i % types.length], p);
        }
        g.mouse = [true, false];
        await frames(50);
        g.mouse = [false, false];
        await frames(8);
      } else if (event === "wraith") {
        g.demon = 15;
        await frames(20);
      } else if (event === "low") {
        g.health = 3;
        g.armor = 0;
        await frames(20);
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
      await new Promise((r) => setTimeout(r, 400));
      // The low-health readout pulses: pin it (450 ms is half way; 0 its start).
      for (const a of document.getAnimations())
        if (a.animationName === "low-health") {
          a.pause();
          a.currentTime = window.__STATE_PULSE__ ?? 450;
        }
      await frames(2);
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
      const overlays = ["low-health-overlay", "demon-overlay", "damage-overlay"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);
      for (const o of overlays) o.style.visibility = "visible";
      await new Promise((r) => setTimeout(r, 200));
      await capture(`${name}-bare.png`);
      document.getElementById("app").style.visibility = "";
      if (scrim) scrim.style.visibility = "";
      for (const o of overlays) o.style.visibility = "";
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
  g.demon = 0;
  g.health = 100;
  g.toastTimer = 0;
  document.getElementById("gate-prompt").textContent = "";
  g.setMode("menu");
  return report;
})();

// Measurement: the focused menu command against what is around it, on the title, pause,
// death, level-complete and ending screens, as frozen frame pairs with the screen's text
// and without it (anything behind the text counts as background, including each
// command's own background). Read by tools/media/round9/hud-contrast.mjs. Set
// window.__FOCUS_LEVELS__ (levels for pause, death and result) and window.__FOCUS_OUT__.
//   npm run test:browser -- --before 'window.__FOCUS_LEVELS__=[8,0]; window.__FOCUS_OUT__="artifacts/r11/focus/after"' --checks tools/media/round11/menu-focus.js --out artifacts/r11/focus/after.json
//   node tools/media/round9/hud-contrast.mjs artifacts/r11/focus/after.json artifacts/r11/focus/after
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__FOCUS_OUT__ || "artifacts/r11/focus",
    levels = window.__FOCUS_LEVELS__ || [8];
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
    "focused command": ".menu-command.nav-current",
    "other commands": ".menu-command:not(.nav-current)",
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  const saved = structuredClone(g.save);
  const report = {};
  const raf = window.requestAnimationFrame;
  let frozen = false;
  const thaw = () => {
    if (!frozen) return;
    window.requestAnimationFrame = raf;
    raf(g.loop);
    frozen = false;
  };
  const arena = async (level, room = 0) => {
    thaw();
    api.seed(3);
    api.start(level, room);
    g.invulnerable = 1e9;
    g.waveDelay = 60;
    await frames(60);
  };
  const screens = [["title", null]];
  for (const level of levels)
    screens.push(["pause", level], ["death", level], ["result", level]);
  screens.push(["ending", 23]);
  for (const [screen, level] of screens) {
    if (screen === "title") {
      thaw();
      g.setMode("menu");
      await frames(60);
    } else if (screen === "pause") {
      await arena(level);
      g.setMode("paused");
    } else if (screen === "death") {
      await arena(level);
      g.invulnerable = 0;
      g.hurt(9999, g.position.clone().setX(g.position.x + 3), "melee", "brute");
    } else {
      await arena(level, api.campaign[level].rooms - 1);
      g.levelKills = 61;
      g.levelSouls = 14;
      g.secrets = 1;
      g.elapsed = 512;
      g.arenaCleared = true;
      g.completeLevel();
    }
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
    const file = `${screen}-${level ?? "title"}`,
      name = `${out}/${file}`;
    await capture(`${name}-hud.png`);
    // Hide only the screen's text: the menu's vignette, the arena, any backing and each
    // command's own background stay. (Hiding the whole command, as round 10's
    // result-screen measurement does, counts the focused command's background ellipse
    // as part of its letters, which understates it most over a dark arena.)
    const main = document.querySelector(".game-menu main"),
      textOnly = document.createElement("style");
    textOnly.textContent =
      ".menu-command { color: transparent !important; text-shadow: none !important; } .menu-command > span { visibility: hidden; }";
    for (const child of main.children)
      if (!child.querySelector(".menu-command"))
        child.style.visibility = "hidden";
    document.head.append(textOnly);
    await new Promise((r) => setTimeout(r, 200));
    await capture(`${name}-bare.png`);
    textOnly.remove();
    for (const child of main.children) child.style.visibility = "";
    report[file] = {
      name:
        screen === "title"
          ? "Title"
          : `${screen[0].toUpperCase()}${screen.slice(1)} · ${api.campaign[level].name}`,
      file,
      dpr: devicePixelRatio,
      boxes,
    };
  }
  thaw();
  g.save = saved;
  g.persist();
  g.setMode("menu");
  await frames(2);
  return report;
})();

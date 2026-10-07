// Scenario checks for the ninth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round9`.
// The narrow-window checks ask the runner to resize the window ("__RUNNER__ size"), and
// the touch checks ask it to emulate a touchscreen; Firefox's runner cannot, so those
// checks say so and pass there.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    volume = g.sound.volume,
    startSize = [innerWidth, innerHeight];
  const assert = (x, m) => {
    if (!x) throw Error(m);
  };
  const check = async (name, fn) => {
    try {
      results.push({ name, passed: true, detail: await fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const frames = async (n) => {
    for (let i = 0; i < n; i++)
      await new Promise((r) => requestAnimationFrame(r));
  };
  const until = async (test, what, ms = 5000) => {
    const t0 = performance.now();
    while (!test()) {
      if (performance.now() - t0 > ms) throw Error("timed out: " + what);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  const resize = async (w, h) => {
    if (innerWidth === w && innerHeight === h) return;
    console.info(`__RUNNER__ size ${w}x${h}`);
    await until(
      () => innerWidth === w && innerHeight === h,
      `the window to become ${w}×${h} (now ${innerWidth}×${innerHeight})`,
    );
    await frames(2);
  };
  /** Turns touch emulation on or off; false when this runner cannot emulate touch. */
  const touchEmulation = async (on) => {
    delete window.__RUNNER_TOUCH__;
    console.info(`__RUNNER__ touch ${on ? "on" : "off"}`);
    await until(
      () => "__RUNNER_TOUCH__" in window,
      "the runner's touch answer",
    );
    await frames(2);
    return window.__RUNNER_TOUCH__;
  };
  const pointer = (type, pointerType, extra = {}) =>
    window.dispatchEvent(
      new PointerEvent(type, {
        pointerType,
        bubbles: true,
        isPrimary: true,
        ...extra,
      }),
    );
  const touchLayout = () => document.body.classList.contains("touch-layout");
  g.hints.setEnabled(false);
  g.sound.setVolume(0);

  // Pointer lock, simulated: these windows are offscreen, and the shared desktop's mouse
  // must not be grabbed.
  let lockRequests = 0;
  const requestLock = g.canvas.requestPointerLock;
  g.canvas.requestPointerLock = () => {
    lockRequests++;
    return Promise.resolve();
  };
  const fight = (level = 8) => {
    api.seed(9);
    api.start(level, 0);
    g.invulnerable = 1e9;
    g.waveDelay = 0.3;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
  };

  /** Every HUD panel on screen and none touching its neighbours. */
  const hudFits = async (label) => {
    const panels = {
      title: ".hud-top > div:first-child",
      objective: ".objective",
      stats: ".combat-stats",
      boss: "#boss-hud",
      vitals: ".vitals",
      weapons: ".weapon-hud",
      ammo: ".ammo",
      help: "#hud-help",
      hint: "#hint",
    };
    const apart = [
      ["title", "objective"],
      ["objective", "stats"],
      ["title", "boss"],
      ["stats", "boss"],
      ["objective", "boss"],
      ["vitals", "weapons"],
      ["weapons", "ammo"],
      ["vitals", "ammo"],
      ["help", "weapons"],
      ["hint", "help"],
      ["hint", "weapons"],
    ];
    const widths = {};
    for (const hudScale of [0.75, 1, 1.5]) {
      g.applySettings({ ...g.settings(), hudScale });
      g.onHUD();
      const hint = document.getElementById("hint"),
        boss = document.getElementById("boss-hud");
      hint.textContent =
        "Shoot a frozen enemy with the shotgun to shatter it · RMB fires the freezer";
      hint.style.opacity = "1";
      boss.style.display = "block";
      document.getElementById("boss-name").textContent = "The Gravewarden";
      // Measured at once: the next HUD refresh hides the boss bar (no general here).
      const rects = {};
      for (const [name, selector] of Object.entries(panels)) {
        const r = document.querySelector(selector).getBoundingClientRect();
        rects[name] = r;
        assert(
          r.width > 0 &&
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight,
          `${label}: ${name} leaves the ${innerWidth}×${innerHeight} screen at ${hudScale}: ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`,
        );
      }
      for (const [a, b] of apart) {
        const p = rects[a],
          q = rects[b];
        assert(
          p.right <= q.left ||
            q.right <= p.left ||
            p.bottom <= q.top ||
            q.bottom <= p.top,
          `${label}: ${a} and ${b} overlap at ${hudScale} in ${innerWidth}×${innerHeight}`,
        );
      }
      widths[hudScale] = Math.round(rects.weapons.width);
      boss.style.display = "";
      hint.style.opacity = "0";
    }
    g.applySettings({ ...g.settings(), hudScale: 1 });
    return widths;
  };

  // R9-1: the touch layout follows touch, not a narrow window.
  for (const [w, h] of [
    [860, 640],
    [700, 500],
  ])
    await check(
      `R9-1 a mouse in a ${w}×${h} window keeps the desktop layout and the mouse`,
      async () => {
        await resize(w, h);
        assert(!matchMedia("(pointer: coarse)").matches, "a coarse pointer");
        fight();
        assert(!touchLayout(), "touch layout in a narrow window");
        assert(!g.controls.mobile, "treated as touch");
        assert(
          getComputedStyle(document.getElementById("touch-controls"))
            .display === "none",
          "touch buttons shown",
        );
        assert(
          getComputedStyle(document.querySelector(".weapon-hud")).display !==
            "none",
          "weapon bar hidden",
        );
        const before = lockRequests;
        g.lock();
        assert(lockRequests === before + 1, "the mouse was not asked for");
        Object.defineProperty(g.hints, "visible", {
          configurable: true,
          get: () => "freeze",
        });
        const hint = g.hintText();
        delete g.hints.visible;
        assert(!/FIRE blast/.test(hint), "touch wording: " + hint);
        const widths = await hudFits(`${w}×${h}`);
        return { hint, weaponBarWidths: widths };
      },
    );
  await check(
    "R9-1 a touch switches to the touch layout and the mouse switches back",
    async () => {
      await resize(860, 640);
      fight();
      pointer("pointerdown", "touch");
      pointer("pointerup", "touch");
      assert(touchLayout() && g.controls.mobile, "a touch kept the desktop");
      await frames(1);
      assert(
        getComputedStyle(document.getElementById("touch-controls")).display ===
          "block",
        "touch buttons hidden after a touch",
      );
      const before = lockRequests;
      g.lock();
      assert(lockRequests === before, "asked for the mouse in touch layout");
      // A mouse event without movement (some touchscreens send one) does not switch.
      pointer("pointermove", "mouse");
      assert(touchLayout(), "a still mouse event switched back");
      pointer("pointermove", "mouse", { movementX: 4 });
      assert(!touchLayout() && !g.controls.mobile, "the mouse did not return");
      pointer("pointerdown", "touch");
      pointer("pointerdown", "mouse");
      assert(!touchLayout(), "a mouse click did not return");
      // A pen is neither: it leaves the layout alone.
      pointer("pointerdown", "touch");
      pointer("pointerdown", "pen");
      assert(touchLayout(), "a pen switched the layout");
      pointer("pointermove", "mouse", { movementY: 2 });
      return "touch → touch layout, mouse move or click → desktop";
    },
  );
  await check(
    "R9-1 an emulated touchscreen opens the touch layout at any width",
    async () => {
      await resize(1280, 800);
      if (!(await touchEmulation(true)))
        return "skipped: this runner cannot emulate a touchscreen";
      try {
        await until(
          () => matchMedia("(pointer: coarse)").matches,
          "a coarse pointer",
        );
        await until(touchLayout, "the touch layout on a coarse pointer");
        fight();
        const before = lockRequests;
        g.lock();
        assert(lockRequests === before, "asked a touchscreen for the mouse");
      } finally {
        await touchEmulation(false);
      }
      await until(() => !touchLayout(), "the desktop layout after touch");
      return "coarse pointer → touch layout; fine → desktop";
    },
  );

  // R9-2: the edge shade and the halo. Their effect on contrast is measured from
  // captures by tools/media/round9/hud-contrast.mjs; this checks they are in place.
  await check(
    "R9-2 the HUD has its edge shade and halo, and the shade takes no clicks",
    async () => {
      await resize(1280, 800);
      fight(0);
      g.onHUD();
      const scrim = document.getElementById("hud-scrim");
      assert(scrim, "no edge shade");
      const r = scrim.getBoundingClientRect();
      assert(
        r.width === innerWidth && r.height === innerHeight,
        "the shade does not cover the screen",
      );
      assert(
        getComputedStyle(scrim).pointerEvents === "none",
        "the shade takes clicks",
      );
      const slot = document.getElementById("slot-3").getBoundingClientRect();
      const hit = document.elementFromPoint(
        slot.left + slot.width / 2,
        slot.top + slot.height / 2,
      );
      assert(
        hit && hit.closest("#slot-3"),
        "a weapon slot is covered by " + hit?.id,
      );
      for (const selector of [
        ".hud-bottom",
        ".hud-top",
        "#hud-help",
        "#gate-prompt",
      ])
        assert(
          (getComputedStyle(document.querySelector(selector)).textShadow.match(
            /rgb\(0, 0, 0\)/g,
          )?.length ?? 0) >= 2,
          selector + " has no halo",
        );
      // The shade grows with the interface scale, like the panels it sits under.
      const shade = () => getComputedStyle(scrim).backgroundImage;
      const normal = shade();
      g.applySettings({ ...g.settings(), hudScale: 1.5 });
      const large = shade();
      g.applySettings({ ...g.settings(), hudScale: 1 });
      assert(normal !== large, "the shade ignores the interface scale");
      return "shade under the HUD, halo on its text";
    },
  );

  await resize(...startSize);
  g.canvas.requestPointerLock = requestLock;
  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

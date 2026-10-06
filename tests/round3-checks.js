// Scenario checks for the third improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round3`.
(() => {
  const g = window.__PURGATORY__.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    storedOptions = localStorage.getItem("purgatory.options");
  const assert = (x, m) => {
    if (!x) throw Error(m);
  };
  const check = (name, fn) => {
    try {
      results.push({ name, passed: true, detail: fn() });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  const step = (frames) => {
    for (let i = 0; i < frames; i++) g.update(1 / 60);
  };
  const key = (type, code, target = window) =>
    target.dispatchEvent(
      new KeyboardEvent(type, { code, key: code, bubbles: true }),
    );
  const click = (selector) => {
    const el = document.querySelector(selector);
    assert(el, "Missing " + selector);
    el.click();
  };
  const text = (id) => document.getElementById(id)?.textContent || "";
  /** A synthetic standard-mapping controller; `vibration` records rumble requests. */
  const rumbles = [];
  const pad = (buttons = [], axes = [0, 0, 0, 0], actuator = true) => ({
    connected: true,
    mapping: "standard",
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
      value: buttons.includes(i) ? 1 : 0,
    })),
    vibrationActuator: actuator
      ? {
          playEffect: (type, params) => {
            rumbles.push({ type, ...params });
            return Promise.resolve("complete");
          },
        }
      : undefined,
  });
  let actuator = true;
  const poll = (buttons = [], axes) =>
    g.controls.poll(1 / 60, [pad(buttons, axes, actuator)]);
  /** Press a button for one frame, then release it. */
  const tapPad = (button) => {
    poll([button]);
    poll([]);
  };
  const setup = (level = 0, room = 0) => {
    g.setMode("menu");
    g.controls.poll(1 / 60, []);
    g.start(level, room, false);
    g.clearDynamic();
    g.waveDelay = 9999;
    g.invulnerable = 0;
    g.sound.setVolume(0);
    poll([]);
  };
  /** Rebind a controller action through the real Options › Controls page. */
  const padRebind = (action, input) => {
    g.setMode("menu");
    poll([]);
    if (!document.querySelector('[data-action="settings-tab"]'))
      click('[data-action="page"][data-value="settings"]');
    click('[data-action="settings-tab"][data-value="controls"]');
    click(`[data-action="pad-rebind"][data-value="${action}"]`);
    assert(
      document.querySelector('[data-action="pad-rebind"].listening'),
      "Controller slot is not listening",
    );
    if (typeof input === "number") tapPad(input);
    else key("keydown", input);
    return document.querySelector(".pad-list .rebind-note")?.textContent || "";
  };

  check("a controller button is rebound through the Options page", () => {
    const note = padRebind("jump", 7);
    assert(/RT moved from Primary fire to Jump/.test(note), note);
    assert(g.padBindings.jump === 7 && g.padBindings.primary === null, note);
    const shown = document.querySelector(
      '[data-action="pad-rebind"][data-value="jump"]',
    ).textContent;
    assert(shown === "RT", "Jump slot shows " + shown);
    // While listening, A and B do not click or go back; Start cancels.
    padRebind("tarot", 9);
    assert(g.padBindings.tarot === 3, "Start changed the tarot button");
    assert(
      document.querySelector('[data-action="settings-tab"]'),
      "Start left the Options page",
    );
    return note;
  });

  check("rebound buttons jump and fire; the old buttons do nothing", () => {
    padRebind("primary", 4);
    setup();
    const y = g.position.y;
    poll([0]);
    step(3);
    poll([]);
    assert(g.position.y <= y + 0.01, "Old jump button A still jumps");
    poll([7]);
    step(3);
    poll([]);
    assert(g.position.y > y + 0.05, "RT did not jump");
    step(60);
    g.equip(1);
    const shells = g.ammo[1];
    poll([4]);
    step(3);
    poll([]);
    assert(g.ammo[1] < shells, "LB did not fire");
    assert(g.weapon === 1, "LB still switched weapon");
    return { shells, after: g.ammo[1] };
  });

  check("a D-pad button uses the gate and picks a weapon", () => {
    padRebind("use", 12);
    padRebind("weapon4", 15);
    setup();
    tapPad(15);
    assert(g.weapon === 3, "D-pad right did not pick weapon 4");
    g.arenaCleared = true;
    g.position.set(0, 1.75, -27);
    g.onHUD();
    assert(/\[ D-PAD ↑ \]/.test(text("gate-prompt")), text("gate-prompt"));
    tapPad(2);
    assert(g.room === 0, "Old X still used the gate");
    tapPad(12);
    assert(g.room === 1, "D-pad up did not use the gate");
  });

  check("Start always pauses; HUD and hints name the bound buttons", () => {
    padRebind("tarot", 8);
    setup();
    tapPad(9);
    assert(g.mode === "paused", "Start did not pause");
    tapPad(9);
    assert(g.mode === "playing", "Start did not resume");
    g.save.cards = [0];
    g.save.selectedCard = 0;
    g.onHUD();
    const help = text("hud-help");
    assert(/LB \/ LT FIRE/.test(help) && /RT JUMP/.test(help), help);
    assert(/D-PAD ↑ USE/.test(help), help);
    assert(text("hud-card").startsWith("BACK"), text("hud-card"));
    g.hints.seen.delete("tarot");
    g.hints.clear();
    g.hint("tarot");
    g.hints.update(0.1);
    assert(/^Press BACK /.test(g.hintText()), g.hintText());
    g.hints.clear();
    return help;
  });

  check(
    "controller bindings persist; Esc cancels, Backspace clears, reset",
    () => {
      const stored = JSON.parse(localStorage.getItem("purgatory.options"));
      assert(stored.padBindings.use === 12, JSON.stringify(stored.padBindings));
      assert(/Unchanged/.test(padRebind("inspect", "Escape")), "Esc");
      assert(g.padBindings.inspect === 1, "Esc changed inspect");
      padRebind("inspect", "Backspace");
      assert(g.padBindings.inspect === null, "Backspace did not clear");
      // Keyboard bindings are untouched by controller changes.
      assert(g.bindings.jump[0] === "Space", "Keyboard jump changed");
      click('[data-action="reset-pad-bindings"]');
      assert(
        g.padBindings.jump === 0 &&
          g.padBindings.primary === 7 &&
          g.padBindings.use === 2 &&
          g.padBindings.weapon4 === null,
        "Reset did not restore defaults",
      );
      // Leaving the page stops listening.
      click('[data-action="pad-rebind"][data-value="jump"]');
      click('[data-action="settings-tab"][data-value="video"]');
      assert(g.controls.capture === null, "Still listening off the page");
      return JSON.parse(localStorage.getItem("purgatory.options")).padBindings;
    },
  );

  check("stick look speed is its own option, not mouse sensitivity", () => {
    const turn = (sensitivity, stickSpeed) => {
      const s = g.settings();
      Object.assign(s, { sensitivity, stickSpeed });
      g.applySettings(s);
      const yaw = g.yaw;
      for (let i = 0; i < 30; i++) poll([], [0, 0, 1, 0]);
      poll([]);
      return yaw - g.yaw;
    };
    setup();
    const slowMouse = turn(0.001, 1),
      fastMouse = turn(0.004, 1),
      fastStick = turn(0.001, 2);
    assert(slowMouse > 0.5, "Stick did not turn: " + slowMouse);
    assert(
      Math.abs(slowMouse - fastMouse) < 1e-6,
      `Mouse sensitivity changed stick speed: ${slowMouse} vs ${fastMouse}`,
    );
    assert(
      Math.abs(fastStick - 2 * slowMouse) < 1e-6,
      `Stick speed 2 turned ${fastStick} vs ${slowMouse}`,
    );
    // The slider lives on the Controls page and saves.
    g.setMode("menu");
    click('[data-action="page"][data-value="settings"]');
    click('[data-action="settings-tab"][data-value="controls"]');
    const slider = document.getElementById("stickSpeed");
    slider.value = "150";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const stored = JSON.parse(localStorage.getItem("purgatory.options"));
    assert(stored.stickSpeed === 1.5, "Stick speed not saved");
    return { slowMouse, fastMouse, fastStick };
  });

  check("hits rumble the controller, harder for heavier hits", () => {
    const s = g.settings();
    s.vibration = true;
    g.applySettings(s);
    setup();
    const hit = (damage, cause) => {
      g.invulnerable = 0;
      g.health = 100;
      g.armor = 0;
      const n = rumbles.length;
      g.hurt(damage, g.position.clone().setZ(g.position.z - 3), cause);
      return rumbles.length > n ? rumbles[rumbles.length - 1] : null;
    };
    const hound = hit(9, "hound"),
      brute = hit(25, "brute"),
      shock = hit(24, "shockwave");
    assert(hound && brute && shock, "A hit did not rumble");
    assert(hound.type === "dual-rumble", hound.type);
    assert(
      brute.strongMagnitude > hound.strongMagnitude &&
        brute.duration > hound.duration,
      "A brute's hit was not stronger than a hound's",
    );
    assert(shock.strongMagnitude === 1, "Shockwave was not the strongest");
    const n = rumbles.length;
    g.explode(g.position.clone().setZ(g.position.z - 9), 0, 6);
    assert(rumbles.length === n + 1, "A nearby explosion did not rumble");
    g.explode(g.position.clone().setZ(g.position.z - 30), 0, 6);
    assert(rumbles.length === n + 1, "A distant explosion rumbled");
    return { hound, brute, shock };
  });

  check("no rumble when vibration is off or the pad cannot", () => {
    g.setMode("menu");
    click('[data-action="page"][data-value="settings"]');
    click('[data-action="settings-tab"][data-value="controls"]');
    click('[data-action="option"][data-value="vibration:false"]');
    assert(g.vibration === false, "Option did not turn vibration off");
    setup();
    const n = rumbles.length;
    g.invulnerable = 0;
    g.hurt(20, g.position.clone().setZ(g.position.z - 3), "brute");
    assert(rumbles.length === n, "Rumbled with vibration off");
    const s = g.settings();
    s.vibration = true;
    g.applySettings(s);
    actuator = false;
    poll([]);
    g.invulnerable = 0;
    g.health = 100;
    g.hurt(20, g.position.clone().setZ(g.position.z - 3), "brute");
    actuator = true;
    assert(rumbles.length === n, "Rumbled a pad without an actuator");
  });

  g.controls.poll(1 / 60, []);
  g.applySettings(options);
  if (storedOptions === null) localStorage.removeItem("purgatory.options");
  else localStorage.setItem("purgatory.options", storedOptions);
  g.save = saved;
  g.persist();
  g.level = saved.level;
  g.room = 0;
  g.loadArena();
  g.setMode("menu");
  return results;
})();

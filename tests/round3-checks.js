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

  const recap = () => document.querySelector(".death-recap")?.innerText || "";
  /** Step until the player dies (or give up), with hits landing for real. */
  const untilDead = (frames = 900) => {
    for (let i = 0; i < frames && g.mode === "playing"; i++) {
      g.invulnerable = Math.min(g.invulnerable, 0);
      g.update(1 / 60);
    }
    assert(g.mode === "dead", "Player did not die");
  };

  check("death by a witch's hellfire names it, with a tip", () => {
    setup(5);
    g.health = 8;
    g.armor = 0;
    const origin = g.position.clone().setY(1.6);
    origin.z -= 12;
    const dir = g.position.clone().sub(origin).normalize();
    g.projectile("hellfire", origin, dir, 14, 15, 5, true, "witch");
    untilDead(240);
    const text = recap();
    assert(/Slain by a witch's hellfire/.test(text), text);
    assert(/strafe across it/.test(text), text);
    return text;
  });

  check("death by melee lists the sources of this attempt", () => {
    setup(5);
    g.armor = 0;
    // An earlier, non-lethal hit from the player's own rocket.
    g.explode(g.position.clone().setZ(g.position.z - 3), 180, 6);
    g.invulnerable = 0;
    g.health = 6;
    g.spawnEnemy("brute", g.position.clone().setZ(g.position.z - 2));
    untilDead();
    const text = recap();
    assert(/Slain by a brute/.test(text), text);
    assert(/A brute\s+\d+/.test(text), text);
    assert(/Your own blast\s+\d+/.test(text), text);
    assert(/freeze it and shatter it/.test(text), text);
    return text;
  });

  check("death by your own blast says so", () => {
    setup(5);
    g.health = 5;
    g.armor = 0;
    g.explode(g.position.clone().setZ(g.position.z - 1), 180, 6);
    assert(g.mode === "dead", "Blast did not kill");
    const text = recap();
    assert(/Slain by your own blast/.test(text), text);
    assert(/switch to the shotgun/.test(text), text);
    return text;
  });

  check("death by a general's shockwave names the general", () => {
    setup(4);
    g.health = 10;
    g.armor = 0;
    const Object3D = Object.getPrototypeOf(g.scene.constructor);
    const mesh = new Object3D();
    mesh.position.set(g.position.x, 0.12, g.position.z - 6);
    g.scene.add(mesh);
    g.rings.push({ mesh, radius: 0.5, hit: false });
    untilDead(240);
    const text = recap();
    assert(/Slain by the Gravewarden's shockwave/.test(text), text);
    assert(/jump as a ring reaches you/.test(text), text);
    return text;
  });

  check(
    "the recap starts fresh after Rise again, a new sector and Continue",
    () => {
      g.retry();
      assert(g.mode === "playing", "Rise again did not restart");
      assert(Object.keys(g.damageLog).length === 0, "Log kept after retry");
      g.invulnerable = 0;
      g.hurt(10, g.position.clone().setZ(g.position.z - 2), "hound");
      assert(g.damageLog.hound > 0, "Hit not logged");
      g.arenaCleared = true;
      g.nextArena();
      assert(Object.keys(g.damageLog).length === 0, "Log kept in a new sector");
      // Die, quit from the death screen, Continue, then die of something else.
      g.health = 4;
      g.armor = 0;
      g.invulnerable = 0;
      g.hurt(20, g.position.clone().setZ(g.position.z - 2), "knight");
      assert(g.mode === "dead", "Knight did not kill");
      g.setMode("menu");
      g.continueGame();
      assert(g.mode === "playing", "Continue did not start");
      assert(Object.keys(g.damageLog).length === 0, "Log survived Continue");
      g.health = 4;
      g.armor = 0;
      g.invulnerable = 0;
      g.hurt(20, g.position.clone().setZ(g.position.z - 2), "hound");
      const text = recap();
      assert(/Slain by a hound/.test(text) && !/knight/i.test(text), text);
      return text;
    },
  );

  check("the gate guide points to the open gate while it is off-screen", () => {
    setup(0, 1);
    g.position.set(4, 1.75, 20);
    g.yaw = Math.PI;
    assert(g.gateGuide() === null, "Guide shown before the sector is clear");
    // Clear the sector the way the game does: the last wave ends.
    g.wave = 3;
    g.remaining = 0;
    g.waveDelay = 0.01;
    step(2);
    assert(g.arenaCleared && g.arena.portal.visible, "Sector did not clear");
    g.position.set(4, 1.75, 20);
    const at = (yaw) => {
      g.yaw = yaw;
      return g.gateGuide();
    };
    assert(at(0) === null, "Guide shown with the gate ahead");
    const behind = at(Math.PI),
      left = at(-Math.PI / 2),
      right = at(Math.PI / 2);
    assert(behind && Math.abs(behind.angle) > 2.8, JSON.stringify(behind));
    assert(left && right, "No guide with the gate to the side");
    assert(
      Math.sign(left.angle) !== Math.sign(right.angle) &&
        Math.abs(Math.abs(left.angle) - Math.PI / 2) < 0.3,
      JSON.stringify({ left, right }),
    );
    // The arena's gate is 48 m from (4, 20) in this layout.
    const metres = Math.round(Math.hypot(4, 48));
    assert(behind.label === `GATE ${metres} M`, behind.label);
    // Drawn on the HUD, distinct from the enemy locator.
    g.yaw = Math.PI;
    g.onHUD();
    const mark = document.querySelector("#threat-ring i.gate");
    assert(mark && mark.style.display === "block", "Gate marker not drawn");
    assert(mark.dataset.label === behind.label, mark.dataset.label);
    assert(
      getComputedStyle(mark, "::after").borderTopColor !==
        getComputedStyle(document.body).color,
      "Gate marker has no colour",
    );
    // Standing in the gate: the prompt takes over.
    g.position.set(0, 1.75, -26);
    assert(g.gateGuide() === null, "Guide shown at the gate");
    g.useGate();
    assert(g.room === 2 && g.gateGuide() === null, "Guide in the next sector");
    g.onHUD();
    assert(
      !document.querySelector("#threat-ring i.gate") ||
        document.querySelector("#threat-ring i.gate").style.display === "none",
      "Marker left on the HUD",
    );
    return { behind, left, right };
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

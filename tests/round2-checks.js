// Scenario checks for the second improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round2`.
(() => {
  const g = window.__PURGATORY__.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    storedOptions = localStorage.getItem("purgatory.options"),
    V = g.position.constructor;
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
  const setup = (level = 0, room = 0) => {
    g.start(level, room, false);
    g.waveDelay = 9999;
    g.invulnerable = 0;
    g.sound.setVolume(0);
  };
  const step = (frames) => {
    for (let i = 0; i < frames; i++) g.update(1 / 60);
  };
  const key = (type, code, target = document.body) =>
    target.dispatchEvent(
      new KeyboardEvent(type, { code, key: code, bubbles: true }),
    );
  const tap = (code) => {
    key("keydown", code);
    key("keyup", code);
  };
  const mouse = (type, button, target) =>
    target.dispatchEvent(
      new MouseEvent(type, { button, bubbles: true, cancelable: true }),
    );
  const click = (selector) => {
    const el = document.querySelector(selector);
    assert(el, "Missing " + selector);
    el.click();
  };
  /** Rebind through the real Options › Controls page. */
  const rebind = (action, slot, input) => {
    g.setMode("menu");
    if (!document.querySelector('[data-action="settings-tab"]'))
      click('[data-action="page"][data-value="settings"]');
    click('[data-action="settings-tab"][data-value="controls"]');
    click(`[data-action="rebind"][data-value="${action}:${slot}"]`);
    assert(
      document.querySelector(".rebind-slot.listening"),
      "Slot is not listening",
    );
    if (typeof input === "number") {
      mouse("mousedown", input, window);
      mouse("mouseup", input, window);
      mouse("auxclick", input, window);
    } else key("keydown", input, window);
    return document.querySelector(".rebind-note")?.textContent || "";
  };

  check("a rebound movement key moves and the old key does not", () => {
    const note = rebind("forward", 0, "KeyI");
    assert(/Move forward: I/.test(note), note);
    setup();
    let z = g.position.z;
    key("keydown", "KeyW");
    step(30);
    key("keyup", "KeyW");
    assert(Math.abs(g.position.z - z) < 0.01, "Old key W still moves");
    key("keydown", "KeyI");
    step(30);
    key("keyup", "KeyI");
    assert(g.position.z < z - 2, "Rebound key I did not move");
    assert(
      document
        .getElementById("hud-help")
        .textContent.startsWith("I A S D MOVE"),
      document.getElementById("hud-help").textContent,
    );
  });

  check("a key taken from another action is moved, and says so", () => {
    const note = rebind("jump", 0, "KeyA");
    assert(/A moved from Strafe left to Jump/.test(note), note);
    assert(g.bindings.left.length === 0, "Strafe left kept A");
    setup();
    key("keydown", "KeyA");
    step(2);
    key("keyup", "KeyA");
    assert(g.velocity.y > 0 || g.position.y > 1.76, "A did not jump");
  });

  check("rebound fire and weapon keys work", () => {
    rebind("alternate", 1, "KeyJ");
    rebind("weapon4", 0, "KeyU");
    setup();
    tap("KeyU");
    assert(g.weapon === 3, "U did not select weapon 4");
    const before = g.altAmmo[3];
    key("keydown", "KeyJ");
    step(3);
    key("keyup", "KeyJ");
    assert(g.altAmmo[3] < before, "J did not fire the chaingun");
  });

  check("a mouse side button can use the gate", () => {
    const note = rebind("use", 0, 3);
    assert(/Use gate: MOUSE 4/.test(note), note);
    setup();
    g.arenaCleared = true;
    g.position.set(0, 1.75, -27);
    mouse("mousedown", 3, g.canvas);
    mouse("mouseup", 3, window);
    assert(g.room === 1, "Side button did not use the gate");
    g.onHUD();
  });

  check("bindings persist with the options and Escape always pauses", () => {
    rebind("pause", 0, "KeyO");
    const stored = JSON.parse(localStorage.getItem("purgatory.options"));
    assert(
      stored.bindings.use[0] === "Mouse3",
      JSON.stringify(stored.bindings.use),
    );
    assert(stored.bindings.pause[0] === "KeyO", "Pause binding not saved");
    setup();
    tap("KeyP");
    assert(g.mode === "playing", "Unbound P still paused");
    tap("KeyO");
    assert(g.mode === "paused", "O did not pause");
    g.setMode("playing");
    tap("Escape");
    assert(g.mode === "paused", "Escape did not pause");
  });

  check("Escape cancels a capture and reset restores defaults", () => {
    const note = rebind("tarot", 0, "Escape");
    assert(/Unchanged/.test(note) && g.bindings.tarot[0] === "KeyQ", note);
    rebind("inspect", 0, "Backspace");
    assert(g.bindings.inspect.length === 0, "Backspace did not clear");
    click('[data-action="reset-bindings"]');
    assert(
      g.bindings.forward[0] === "KeyW" && g.bindings.left[0] === "KeyA",
      "Reset did not restore defaults",
    );
    return document.querySelector(".rebind-note").textContent;
  });

  check("quitting in wave 3 and continuing resumes wave 3", () => {
    setup(5, 1);
    const supply = g.pickups.find((p) => p.slot === 0);
    g.position.copy(supply.mesh.position).setY(1.75);
    g.health = 60;
    step(2);
    assert(g.taken.has(0), "Health supply was not collected");
    g.beginWave();
    g.enemies.forEach((e) => e.model.dispose());
    g.enemies = [];
    g.remaining = 0;
    g.beginWave();
    g.enemies.forEach((e) => e.model.dispose());
    g.enemies = [];
    g.remaining = 0;
    g.health = 55;
    g.armor = 9;
    g.ammo[1] = 7;
    g.souls = 23;
    g.levelKills = 40;
    g.beginWave();
    assert(g.wave === 3, "Not in wave 3");
    // Quit to the main menu through the pause menu, as a player would.
    g.setMode("paused");
    const pause = document.querySelector(".checkpoint-caption").textContent;
    assert(/start of wave 3/.test(pause), pause);
    click('[data-action="menu"]');
    click('[data-action="confirm"]');
    assert(g.mode === "menu", "Did not return to the menu");
    const stored = JSON.parse(localStorage.getItem("purgatory.save"));
    assert(stored.resume?.wave === 3, JSON.stringify(stored.resume));
    const caption = document.querySelector(".checkpoint-caption").textContent;
    assert(/SECTOR 2 · WAVE 3/.test(caption), caption);
    click('[data-action="start"]');
    assert(
      g.mode === "playing" && g.level === 5 && g.room === 1,
      "Wrong sector",
    );
    assert(
      g.health === 55 && g.armor === 9,
      `health ${g.health}, armor ${g.armor}`,
    );
    assert(
      g.ammo[1] === 7 && g.ammo[0] === Infinity,
      "Ammunition not restored",
    );
    assert(
      g.souls === 23 && g.levelKills === 40,
      "Souls or kills not restored",
    );
    assert(!g.pickups.some((p) => p.slot === 0), "Collected supply came back");
    assert(
      g.pickups.some((p) => p.slot === 1),
      "Uncollected supply missing",
    );
    g.waveDelay = 0.1;
    step(10);
    assert(
      g.wave === 3 && g.remaining + g.enemies.length > 0,
      "Wave 3 did not begin",
    );
  });

  check("death returns the save to the sector start", () => {
    setup(5, 1);
    g.beginWave();
    g.beginWave();
    assert(g.save.resume?.wave === 2, "No snapshot");
    g.invulnerable = 0;
    g.hurt(9999);
    assert(g.mode === "dead", "Did not die");
    const after = JSON.parse(localStorage.getItem("purgatory.save")).resume;
    assert(
      after?.wave === 1 && after.health === 100 && after.deaths === 1,
      "Death did not save a sector restart: " + JSON.stringify(after),
    );
    g.setMode("menu");
    g.continueGame();
    assert(
      g.wave === 0 && g.health === 100 && g.levelDeaths === 1,
      `wave ${g.wave}, health ${g.health}, deaths ${g.levelDeaths}`,
    );
  });

  check("level select and finishing a level ignore the snapshot", () => {
    setup(5, 0);
    g.beginWave();
    g.health = 30;
    g.beginWave();
    g.start(5, 0, false);
    assert(g.health === 100 && g.wave === 0, "Level select resumed a wave");
    g.beginWave();
    g.completeLevel();
    assert(!g.save.resume, "Snapshot survived the level's end");
    g.setMode("menu");
  });

  check("finishing a level records and shows the best clear", () => {
    g.save.records = {};
    setup(6, 4);
    g.invulnerable = 0;
    g.hurt(9999);
    assert(g.levelDeaths === 1, "Death not counted");
    g.retry();
    assert(g.levelDeaths === 1, "Retry forgot the death");
    g.elapsed = 200;
    g.levelKills = 90;
    g.completeLevel();
    let r = g.save.records[6];
    assert(
      r && r.time === 200 && !r.deathless && r.kills === 90,
      JSON.stringify(r),
    );
    let text = document.querySelector(".end-screen").textContent;
    assert(/NEW BEST TIME/.test(text) && !/DEATHLESS/.test(text), text);
    // A slower, deathless clear with the relic keeps the time and adds the rest.
    setup(6, 4);
    g.elapsed = 250;
    g.secrets = 1;
    g.levelKills = 70;
    g.completeLevel();
    r = g.save.records[6];
    assert(
      r.time === 200 && r.deathless && r.secrets === 1 && r.kills === 90,
      JSON.stringify(r),
    );
    text = document.querySelector(".end-screen").textContent;
    assert(
      /BEST 3:20/.test(text) &&
        /DEATHLESS/.test(text) &&
        !/NEW BEST/.test(text),
      text,
    );
    assert(
      JSON.parse(localStorage.getItem("purgatory.save")).records["6"].time ===
        200,
      "Record not saved",
    );
    // Level select shows it.
    g.setMode("menu");
    click('[data-action="page"][data-value="campaign"]');
    click('[data-action="chapter"][data-value="2"]');
    click('[data-action="select-level"][data-value="6"]');
    const line = document.querySelector(
      ".level-preview .record-line",
    ).textContent;
    assert(/BEST 3:20 · 90 SLAIN · RELIC FOUND · DEATHLESS/.test(line), line);
    click('[data-action="select-level"][data-value="7"]');
    const none = document.querySelector(
      ".level-preview .record-line",
    ).textContent;
    assert(/NOT YET CLEARED|CLEARED/.test(none), none);
  });

  check("quitting from the death screen cannot erase a death", () => {
    setup(6, 1);
    g.invulnerable = 0;
    g.hurt(9999);
    g.setMode("menu");
    g.continueGame();
    assert(g.levelDeaths === 1, "Death erased by quitting");
    assert(g.health === 100 && g.wave === 0, "Did not restart the sector");
    g.setMode("menu");
  });

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

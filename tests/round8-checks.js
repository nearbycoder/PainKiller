// Scenario checks for the eighth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round8`.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    volume = g.sound.volume;
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
  const click = (action, value) =>
    document
      .querySelector(
        `[data-action="${action}"]` +
          (value === undefined ? "" : `[data-value="${value}"]`),
      )
      .click();
  g.hints.setEnabled(false);
  g.sound.setVolume(0);

  // R8-1: pointer lock, simulated. These windows are offscreen, so the real one is never
  // granted, and the shared desktop's mouse must not be grabbed anyway.
  const canvas = g.canvas;
  let answer = "grant",
    locked = null,
    requests = 0;
  const lockChanged = () =>
    document.dispatchEvent(new Event("pointerlockchange"));
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => locked,
  });
  canvas.requestPointerLock = () => {
    requests++;
    if (answer === "refuse")
      return Promise.reject(new DOMException("refused", "SecurityError"));
    return new Promise((resolve) =>
      setTimeout(() => {
        locked = canvas;
        lockChanged();
        resolve();
      }, 0),
    );
  };
  document.exitPointerLock = () => {
    if (!locked) return;
    locked = null;
    lockChanged();
  };
  // What pressing Esc does in a browser: the mouse is released, then the game pauses.
  const escape = () => {
    locked = null;
    lockChanged();
  };
  const esc = (target) => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
    );
    target.dispatchEvent(
      new KeyboardEvent("keyup", { code: "Escape", bubbles: true }),
    );
  };
  const prompt = () => {
    const el = document.getElementById("mouse-prompt");
    return !!el && !el.hidden && getComputedStyle(el).display !== "none";
  };
  const frozen = () =>
    JSON.stringify({
      tick: g.tick,
      health: g.health,
      armor: g.armor,
      position: g.position.toArray(),
      enemies: g.enemies.map((e) => e.model.root.position.toArray()),
      random: api.randomState(),
    });
  const fight = () => {
    api.seed(8);
    g.start(1, 0, true);
    g.waveDelay = 0;
    g.invulnerable = 0;
  };

  await check(
    "a session that never had the mouse plays on, as before",
    async () => {
      g.hadMouse = false;
      answer = "refuse";
      fight();
      await frames(30);
      assert(g.mode === "playing", "mode " + g.mode);
      assert(!g.awaitingMouse && !prompt(), "held");
      assert(g.tick > 10, "no steps: " + g.tick);
      return { tick: g.tick, toast: g.toast };
    },
  );

  await check("a granted capture plays on with nothing shown", async () => {
    answer = "grant";
    g.setMode("paused");
    click("resume");
    await frames(10);
    assert(locked === canvas, "not captured");
    assert(g.hadMouse && !g.awaitingMouse && !prompt(), "held");
    const tick = g.tick;
    await frames(10);
    assert(g.tick > tick, "no steps");
    return { tick: g.tick };
  });

  let before;
  await check("Esc, then a refused resume, holds the fight", async () => {
    g.invulnerable = 0;
    g.health = 100;
    g.spawnEnemy(
      "hound",
      g.position.clone().add(g.direction().multiplyScalar(3)).setY(0),
    );
    escape();
    assert(g.mode === "paused", "Esc did not pause: " + g.mode);
    answer = "refuse";
    click("resume");
    await frames(3);
    assert(g.mode === "playing", "mode " + g.mode);
    assert(g.awaitingMouse, "not held");
    assert(prompt(), "no prompt");
    const text = document.getElementById("mouse-prompt").textContent;
    assert(/click to return to the fight/i.test(text), text);
    before = frozen();
    const weapon = g.weapon;
    for (const code of ["Digit4", "KeyR", "KeyE"]) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
    }
    await frames(120);
    assert(frozen() === before, "the fight moved while held");
    assert(g.weapon === weapon, "a key acted while held");
    return { text, enemies: g.enemies.length };
  });

  await check(
    "the click that brings the mouse back does not fire",
    async () => {
      const ammo = [...g.ammo],
        alt = [...g.altAmmo];
      // A refused click keeps waiting, and asks again.
      const asked = requests;
      canvas.dispatchEvent(
        new MouseEvent("mousedown", { button: 0, bubbles: true }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { button: 0, bubbles: true }),
      );
      await frames(3);
      assert(requests === asked + 1, "did not ask again");
      assert(g.awaitingMouse && prompt(), "stopped holding");
      assert(frozen() === before, "moved after a refused click");
      answer = "grant";
      canvas.dispatchEvent(
        new MouseEvent("mousedown", { button: 0, bubbles: true }),
      );
      await frames(3);
      assert(locked === canvas, "not captured");
      assert(!g.awaitingMouse && !prompt(), "still held");
      assert(
        !g.keys.has("Mouse0") && !g.firing(false),
        "the click is held as fire",
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", { button: 0, bubbles: true }),
      );
      assert(
        JSON.stringify(g.ammo) === JSON.stringify(ammo) &&
          JSON.stringify(g.altAmmo) === JSON.stringify(alt),
        "ammunition spent",
      );
      const tick = g.tick;
      await frames(10);
      assert(g.tick > tick, "the fight did not continue");
      return { requests };
    },
  );

  await check("Esc while held pauses", async () => {
    g.invulnerable = 1e9;
    escape();
    answer = "refuse";
    click("resume");
    await frames(3);
    assert(g.awaitingMouse, "not held");
    // A key press reaches the page (the focused element), not the window.
    esc(document.body);
    assert(g.mode === "paused" && !g.awaitingMouse, "mode " + g.mode);
    await frames(3);
    assert(g.mode === "paused", "resumed by the same Esc: " + g.mode);
    return g.mode;
  });

  await check(
    "Esc pauses a fight without the mouse, and stays paused",
    async () => {
      g.hadMouse = false;
      const out = {};
      // A real key press reaches the page; a script may dispatch at the window, which
      // the menus used to read as "back" as well, resuming at once.
      for (const [name, target] of [
        ["page", document.body],
        ["window", window],
      ]) {
        click("resume");
        await frames(3);
        assert(g.mode === "playing" && !g.awaitingMouse, "mode " + g.mode);
        esc(target);
        await frames(3);
        assert(g.mode === "paused", `Esc at the ${name}: ${g.mode}`);
        out[name] = g.mode;
      }
      // Esc in the pause menu still resumes.
      esc(document.body);
      assert(g.mode === "playing", "Esc did not resume: " + g.mode);
      g.setMode("paused");
      g.hadMouse = true;
      return out;
    },
  );

  await check("a controller player is never held", async () => {
    const pad = {
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    // Held first with the mouse, then a controller wakes: the fight goes on.
    answer = "refuse";
    click("resume");
    await frames(3);
    assert(g.awaitingMouse, "not held");
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [pad],
    });
    try {
      await frames(3);
      assert(!g.awaitingMouse && !prompt(), "still held with a controller");
      let tick = g.tick;
      await frames(10);
      assert(g.tick > tick, "no steps with a controller");
      // Pausing and resuming with the controller never asks for the mouse.
      g.setMode("paused");
      const asked = requests;
      click("resume");
      await frames(5);
      assert(requests === asked && !g.awaitingMouse, "asked for the mouse");
      tick = g.tick;
      await frames(10);
      assert(g.tick > tick, "no steps after resuming");
    } finally {
      delete navigator.getGamepads;
      await frames(2);
    }
    return { requests };
  });

  delete document.pointerLockElement;
  delete canvas.requestPointerLock;
  delete document.exitPointerLock;
  g.hadMouse = false;

  // R8-2: the tarot says what you earned, and never offers a card you do not own.
  const chapterLevel = (chapter) =>
    api.campaign.findIndex((l) => l.chapter === chapter);
  const text = (selector) =>
    document.querySelector(selector)?.textContent.replace(/\s+/g, " ") ?? "";
  const hudCard = () => {
    g.onHUD();
    return text("#hud-card");
  };
  const finishLevel = () => {
    // What walking through the last sector's open gate does.
    g.room = api.campaign[g.level].rooms - 1;
    g.arenaCleared = true;
    g.nextArena();
  };
  const fresh = () => {
    const save = structuredClone(saved);
    Object.assign(save, { cards: [], selectedCard: 0, records: {}, best: {} });
    delete save.resume;
    g.save = save;
  };

  await check(
    "a chapter II clear on a fresh save earns and equips Quickening",
    async () => {
      fresh();
      api.start(chapterLevel(2), 0);
      g.invulnerable = 1e9;
      assert(
        !/WRATH|QUICKENING/.test(hudCard()),
        "offers a card: " + hudCard(),
      );
      // The 25th soul of the level, picked up for real.
      g.levelSouls = 24;
      g.addPickup("soul", g.position.clone().setY(1));
      api.step(10);
      assert(g.levelSouls === 25, "souls " + g.levelSouls);
      // Round 11: it waits its turn behind the level's title.
      assert(g.messages.has("25 SOULS  /  TAROT CONDITION MET"), g.toast);
      finishLevel();
      assert(g.mode === "result", "mode " + g.mode);
      const line = text(".card-earned");
      assert(/TAROT CARD EARNED · QUICKENING/.test(line), line);
      assert(/Equipped: press Q in combat/.test(line), line);
      assert(
        JSON.stringify(g.save.cards) === "[1]" && g.save.selectedCard === 1,
        JSON.stringify([g.save.cards, g.save.selectedCard]),
      );
      // The next fight offers it, and Q awakens it.
      click("next");
      g.invulnerable = 1e9;
      assert(hudCard() === "Q · QUICKENING", hudCard());
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "KeyQ", bubbles: true }),
      );
      assert(g.cardTime === 30 && g.cardUsed, "not awakened: " + g.toast);
      return line;
    },
  );

  await check("a second clear does not announce the card again", async () => {
    api.start(chapterLevel(2), 0);
    g.levelSouls = 30;
    finishLevel();
    assert(g.mode === "result", "mode " + g.mode);
    assert(!document.querySelector(".card-earned"), text(".card-earned"));
    assert(
      JSON.stringify(g.save.cards) === "[1]",
      JSON.stringify(g.save.cards),
    );
    return text(".record-line");
  });

  await check("a card chosen among owned ones is kept", async () => {
    g.save.cards = [0, 1];
    g.save.selectedCard = 0;
    api.start(chapterLevel(3), 0);
    g.secrets = 1;
    finishLevel();
    const line = text(".card-earned");
    assert(/TAROT CARD EARNED · BULWARK/.test(line), line);
    assert(/Equip it under Grave tarot/.test(line), line);
    assert(g.save.selectedCard === 0, "selected " + g.save.selectedCard);
    assert(
      JSON.stringify(g.save.cards) === "[0,1,2]",
      JSON.stringify(g.save.cards),
    );
    return line;
  });

  await check("the HUD never offers an unowned card", async () => {
    // As an old save could hold it: Quickening owned, Wrath selected.
    fresh();
    g.save.cards = [1];
    api.start(chapterLevel(2), 0);
    const shown = hudCard();
    assert(!/WRATH/.test(shown), shown);
    // A save in that state loads with the owned card equipped.
    const { parseSave } = await import("/src/core.ts");
    const loaded = parseSave(JSON.stringify({ ...g.save, selectedCard: 0 }));
    assert(loaded.selectedCard === 1, "loaded " + loaded.selectedCard);
    return shown;
  });

  await check(
    "the pause screen shows this level's card and progress",
    async () => {
      fresh();
      const out = {};
      const pauseLine = () => {
        g.setMode("paused");
        const line = text(".tarot-progress");
        g.setMode("playing");
        return line;
      };
      api.start(chapterLevel(3), 0);
      out.start = pauseLine();
      assert(
        /BULWARK: 0 \/ 25 souls this level, or find the relic/i.test(out.start),
        out.start,
      );
      g.levelSouls = 12;
      out.twelve = pauseLine();
      assert(/12 \/ 25/.test(out.twelve), out.twelve);
      g.levelSouls = 25;
      out.souls = pauseLine();
      assert(
        /BULWARK is yours when this level ends/i.test(out.souls),
        out.souls,
      );
      g.levelSouls = 0;
      g.secrets = 1;
      out.relic = pauseLine();
      assert(/yours when this level ends/i.test(out.relic), out.relic);
      g.save.cards = [2];
      out.owned = pauseLine();
      assert(/BULWARK, is already yours/i.test(out.owned), out.owned);
      return out;
    },
  );
  // R8-4: Restore all defaults asks first; the confirmations say where Continue resumes.
  const stored = () =>
    JSON.parse(localStorage.getItem("purgatory.options") || "{}");
  const dialog = () => text(".confirm-dialog");
  await check(
    "Restore all defaults changes nothing until confirmed",
    async () => {
      g.setMode("menu");
      g.applySettings({
        ...g.settings(),
        fov: 100,
        bindings: { ...g.settings().bindings, jump: ["KeyK"] },
      });
      g.saveOptions();
      click("page", "settings");
      const changed = () =>
        g.fov === 100 &&
        g.bindings.jump.join() === "KeyK" &&
        stored().fov === 100 &&
        stored().bindings.jump.join() === "KeyK";
      click("defaults");
      assert(/Restore all defaults\?/.test(dialog()), "no dialog: " + dialog());
      assert(/key and controller bindings/.test(dialog()), dialog());
      assert(
        document.activeElement?.dataset.action === "cancel",
        "focused: " + document.activeElement?.textContent,
      );
      assert(changed(), "reset before confirming");
      click("cancel");
      assert(!dialog() && changed(), "Cancel reset them");
      click("defaults");
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
      );
      assert(!dialog() && changed(), "Esc reset them");
      assert(
        document.querySelector(".settings-layout"),
        "Esc left the options page",
      );
      click("defaults");
      click("confirm");
      assert(!dialog(), "dialog stayed open");
      assert(
        g.fov === 80 &&
          g.bindings.jump.join() === "Space" &&
          stored().fov === 80,
        "not reset: " + JSON.stringify([g.fov, g.bindings.jump]),
      );
      return "ok";
    },
  );

  await check("leaving and quitting say where Continue resumes", async () => {
    fresh();
    api.start(1, 2);
    g.invulnerable = 1e9;
    // As the third wave of Hall of Vigils' third sector begins.
    g.save.resume = g.snapshot(3);
    g.setMode("paused");
    click("menu");
    const leave = dialog();
    assert(/Leave the fight\?/.test(leave), leave);
    assert(
      /Continue resumes Hall of Vigils, sector 3, at the start of wave 3\./.test(
        leave,
      ),
      leave,
    );
    assert(!/beginning of this sector/.test(leave), leave);
    click("cancel");
    finishLevel();
    click("menu");
    const after = dialog();
    assert(/Return to the main menu\?/.test(after), after);
    assert(/Continue starts The Ossuary, sector 1\./.test(after), after);
    click("cancel");
    return { leave, after };
  });

  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

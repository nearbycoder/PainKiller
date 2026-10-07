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
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keyup", { code: "Escape", bubbles: true }),
    );
    assert(g.mode === "paused" && !g.awaitingMouse, "mode " + g.mode);
    await frames(3);
    assert(g.mode === "paused", "resumed by the same Esc: " + g.mode);
    return g.mode;
  });

  await check(
    "Esc pauses a fight without the mouse, and stays paused",
    async () => {
      // Before round 8 the menus read the same Esc as "back" and resumed at once.
      g.hadMouse = false;
      click("resume");
      await frames(3);
      assert(g.mode === "playing" && !g.awaitingMouse, "mode " + g.mode);
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Escape", bubbles: true }),
      );
      await frames(3);
      assert(g.mode === "paused", "mode " + g.mode);
      // Esc in the pause menu still resumes.
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
      );
      assert(g.mode === "playing", "Esc did not resume: " + g.mode);
      g.setMode("paused");
      g.hadMouse = true;
      return g.mode;
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
  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

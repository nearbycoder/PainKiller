(() => {
  const api = window.__PURGATORY__,
    g = api.game,
    results = [],
    saved = structuredClone(g.save),
    options = g.settings(),
    raw = localStorage.getItem("purgatory.options");
  const assert = (ok, message) => {
    if (!ok) throw Error(message);
  };
  const click = (action, value) => {
    const b = document.querySelector(
      `[data-action="${action}"]${value === undefined ? "" : `[data-value="${value}"]`}`,
    );
    assert(b && !b.disabled, "Missing enabled " + action + ":" + value);
    b.click();
  };
  const key = (code, shiftKey = false) =>
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        code,
        key: code,
        bubbles: true,
        shiftKey,
      }),
    );
  const range = (id, value) => {
    const t = document.getElementById(id);
    assert(t, "Missing " + id);
    t.value = value;
    t.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const home = () => {
    g.setMode("playing");
    g.setMode("menu");
  };
  const check = (name, fn) => {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: String(e) });
    }
  };
  try {
    check("main menu supports keyboard selection", () => {
      home();
      const before = document.activeElement;
      key("ArrowDown");
      assert(document.activeElement !== before, "Down did not move focus");
      key("ArrowUp");
      assert(document.activeElement === before, "Up did not return focus");
    });
    check("video options update the renderer and save", () => {
      click("page", "settings");
      click("settings-tab", "video");
      click("option", "quality:0");
      assert(
        !g.ao.enabled && !g.renderer.shadowMap.enabled,
        "Low preset not applied",
      );
      click("option", "quality:2");
      assert(
        g.ao.enabled && g.renderer.shadowMap.enabled,
        "High preset not applied",
      );
      range("renderScale", 75);
      assert(
        Math.abs(
          g.renderer.getPixelRatio() - Math.min(devicePixelRatio, 1.5) * 0.75,
        ) < 0.001,
        "Resolution not applied",
      );
      range("brightness", 120);
      range("fov", 92);
      assert(
        g.renderer.toneMappingExposure === 1.2 && g.camera.fov === 92,
        "Exposure/FOV not applied",
      );
      assert(
        JSON.parse(localStorage.getItem("purgatory.options")).renderScale ===
          0.75,
        "Options not saved",
      );
    });
    check("music and effects have independent gain controls", () => {
      click("settings-tab", "audio");
      range("volume", 40);
      range("effectsVolume", 25);
      range("musicVolume", 10);
      assert(
        Math.abs(g.sound.gain.gain.value - 0.4) < 0.001,
        "Master gain mismatch",
      );
      assert(
        Math.abs(g.sound.effectsGain.gain.value - 0.25) < 0.001,
        "Effects gain mismatch",
      );
      assert(
        Math.abs(g.sound.musicGain.gain.value - 0.1) < 0.001,
        "Music gain mismatch",
      );
      click("option", "music:false");
      assert(!g.sound.music, "Music toggle failed");
    });
    check("controls and gameplay preferences persist", () => {
      click("settings-tab", "controls");
      range("sensitivity", 35);
      click("option", "invertY:true");
      click("settings-tab", "gameplay");
      click("option", "headBob:false");
      click("option", "crosshair:false");
      click("option", "difficulty:2");
      assert(
        g.sensitivity === 0.0035 &&
          g.invertY &&
          !g.headBob &&
          !g.crosshair &&
          g.difficulty === 2,
        "Preferences not applied",
      );
    });
    check("new game requires confirmation and cancel retains progress", () => {
      key("Escape");
      const before = JSON.stringify(g.save);
      click("new");
      assert(document.querySelector('[role="dialog"]'), "No confirmation");
      key("Tab");
      assert(
        document.activeElement.closest('[role="dialog"]'),
        "Tab escaped dialog",
      );
      key("Escape");
      assert(
        !document.querySelector('[role="dialog"]') &&
          JSON.stringify(g.save) === before,
        "Cancel changed progress",
      );
    });
    check(
      "all chapters expose playable levels through the new selector",
      () => {
        click("page", "campaign");
        let count = 0;
        for (let c = 1; c <= 5; c++) {
          click("chapter", c);
          const levels = [
            ...document.querySelectorAll('[data-action="select-level"]'),
          ];
          count += levels.length;
          for (const l of levels) assert(!l.disabled, "Locked level");
        }
        assert(count === 24, "Missing levels");
        click("chapter", 3);
        click("select-level", 12);
        assert(
          document.querySelector(".level-preview img").alt ===
            "Soul Foundry environment",
          "Preview mismatch",
        );
        click("level", 12);
        assert(
          g.level === 12 && g.mode === "playing",
          "Selected level did not launch",
        );
      },
    );
    check(
      "pause options do not resume or reset the fight; Escape returns then resumes",
      () => {
        g.waveDelay = 9999;
        g.health = 73;
        g.position.x = 2;
        key("Escape");
        assert(g.mode === "paused", "Escape did not pause");
        click("page", "settings");
        click("settings-tab", "gameplay");
        assert(g.mode === "paused", "Options resumed simulation");
        key("Escape");
        assert(
          g.mode === "paused" &&
            document.querySelector('[data-action="resume"]'),
          "Escape skipped pause menu",
        );
        key("Escape");
        assert(
          g.mode === "playing" && g.health === 73 && g.position.x === 2,
          "Resume changed fight or re-paused",
        );
        g.onHUD();
        assert(
          document.getElementById("crosshair").style.visibility === "hidden",
          "Crosshair option not applied",
        );
      },
    );
    check("restore defaults updates rendering and audio together", () => {
      g.setMode("paused");
      click("page", "settings");
      click("defaults");
      assert(
        g.quality === 1 &&
          g.renderScale === 1 &&
          g.brightness === 1 &&
          g.crosshair &&
          g.headBob &&
          !g.invertY,
        "Defaults incomplete",
      );
      assert(
        g.sound.effectsVolume === 1 &&
          g.sound.musicVolume === 0.65 &&
          g.sound.music,
        "Audio defaults incomplete",
      );
    });
  } finally {
    g.applySettings(options);
    if (raw === null) localStorage.removeItem("purgatory.options");
    else localStorage.setItem("purgatory.options", raw);
    g.save = saved;
    g.persist();
    g.level = saved.level;
    g.room = 0;
    g.loadArena();
    g.setMode("playing");
    g.setMode("menu");
  }
  return results;
})();

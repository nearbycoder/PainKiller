// Scenario checks for the twelfth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round12`.
// The keyboard checks ask the runner for real key presses ("__RUNNER__ key").
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
  const until = async (test, what, ms = 5000) => {
    const t0 = performance.now();
    while (!test()) {
      if (performance.now() - t0 > ms) throw Error("timed out: " + what);
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  /** A real key press from the runner; false if this runner cannot press keys. */
  const press = async (key) => {
    delete window.__RUNNER_KEY__;
    console.info(`__RUNNER__ key ${key}`);
    const t0 = performance.now();
    while (window.__RUNNER_KEY__ !== key) {
      if (performance.now() - t0 > 3000) return false;
      await new Promise((r) => setTimeout(r, 20));
    }
    await frames(2);
    return true;
  };
  const click = (action, value) => {
    const el = document.querySelector(
      `[data-action="${action}"]${value === undefined ? "" : `[data-value="${value}"]`}`,
    );
    assert(el, `no ${action} ${value ?? ""}`);
    el.click();
  };
  const stored = () => JSON.parse(localStorage.getItem("purgatory.options"));
  const videoPage = async () => {
    g.setMode("playing");
    g.setMode("menu");
    click("page", "settings");
    click("settings-tab", "video");
    await frames(2);
    return document.getElementById("quality");
  };
  const pad = (pressed = []) => ({
    id: "synthetic",
    mapping: "standard",
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
    })),
  });
  g.sound.setVolume(0);
  g.hints.setEnabled(false);
  g.applySettings({ ...options, quality: 1 });

  // R12-1: Graphics fidelity, one slider of four steps.
  await check(
    "R12-1 Graphics fidelity is one four-step slider, Low to Ultra, Medium by default",
    async () => {
      const slider = await videoPage();
      assert(slider && slider.type === "range", "no fidelity slider");
      assert(
        slider.min === "0" && slider.max === "3" && slider.step === "1",
        `range ${slider.min}–${slider.max} step ${slider.step}`,
      );
      const names = [...document.querySelectorAll("[data-fidelity-step]")].map(
        (x) => x.textContent,
      );
      assert(
        names.join() === "Low,Medium,High,Ultra",
        "step names " + names.join(),
      );
      const row = slider.closest(".option-row");
      assert(
        row.querySelector("b").textContent === "Graphics fidelity",
        "row title",
      );
      assert(row.querySelector("output").textContent === "Medium", "output");
      assert(slider.getAttribute("aria-valuetext") === "Medium", "aria");
      assert(
        !document.querySelector('[data-value^="quality:"]'),
        "the old preset buttons are still there",
      );
      // Every step's name and the value sit inside the row, clear of each other.
      const box = row.getBoundingClientRect(),
        labels = [...row.querySelectorAll("[data-fidelity-step], output")].map(
          (x) => x.getBoundingClientRect(),
        );
      for (const r of labels)
        assert(
          r.left >= box.left - 1 && r.right <= box.right + 1,
          "a step name leaves the row",
        );
      for (let i = 1; i < labels.length; i++)
        assert(labels[i].left >= labels[i - 1].right, "step names overlap");
      return names.join(" · ");
    },
  );

  await check(
    "R12-1 the slider moves with the arrow keys, the D-pad and a click on a step's name, and saves",
    async () => {
      const slider = await videoPage(),
        row = slider.closest(".option-row"),
        seen = [];
      const at = (step, how) => {
        assert(
          g.quality === step &&
            slider.value === String(step) &&
            stored().quality === step,
          `${how}: quality ${g.quality}, slider ${slider.value}, saved ${stored().quality}`,
        );
        assert(
          row.querySelector("output").textContent ===
            ["Low", "Medium", "High", "Ultra"][step],
          how + ": output",
        );
        seen.push(`${how} → ${row.querySelector("output").textContent}`);
      };
      slider.focus();
      if (await press("ArrowRight")) {
        at(2, "→");
        await press("ArrowRight");
        at(3, "→");
        await press("ArrowRight");
        at(3, "→ at the end");
        await press("ArrowLeft");
        at(2, "←");
        assert(
          document.getElementById("fidelity-note").textContent.includes("half"),
          "the note did not follow the step",
        );
      } else seen.push("this runner cannot press real keys");
      // The D-pad: right and left adjust the focused slider.
      slider.focus();
      const start = g.quality;
      g.controls.poll(0.016, [pad()]);
      g.controls.poll(0.016, [pad([14])]);
      g.controls.poll(0.016, [pad()]);
      await frames(1);
      at(start - 1, "D-pad ←");
      g.controls.poll(0.016, [pad([15])]);
      g.controls.poll(0.016, [pad()]);
      await frames(1);
      at(start, "D-pad →");
      g.controls.poll(0.016, []);
      document.querySelector('[data-fidelity-step="0"]').click();
      await frames(1);
      at(0, "click Low");
      assert(document.activeElement === slider, "focus did not stay on it");
      document.querySelector('[data-fidelity-step="3"]').click();
      await frames(1);
      at(3, "click Ultra");
      return seen.join(", ");
    },
  );

  await check("R12-1 each step sets the renderer up as described", async () => {
    const rows = [];
    for (const step of [0, 1, 2, 3]) {
      g.applySettings({ ...options, quality: step, adaptiveResolution: false });
      g.start(8, 0, false);
      g.waveDelay = 1e9;
      g.invulnerable = 1e9;
      await frames(6);
      // A burst of 10 sparks: Low draws half, Ultra adds 10 more.
      const at = g.position.clone();
      at.z -= 6;
      g.burst(at, 0xffffff, 10, 4);
      g.updateEffects(1 / 60);
      const f = api.state().fidelity,
        drawn = g.particles.filter((p) => p.mesh.visible).length;
      rows.push({ ...f, drawn, particles: g.particles.length });
    }
    const [low, medium, high, ultra] = rows;
    const ratio = Math.min(devicePixelRatio, 1.5);
    assert(
      low.shadowMap === 0 &&
        low.ao === 0 &&
        low.antialiasing === "none" &&
        low.atmosphere === 64 &&
        low.bloom === 0 &&
        !low.grade &&
        low.drawn === 5 &&
        low.sparks === 0 &&
        low.pixelRatio === Math.min(devicePixelRatio, 1),
      "Low " + JSON.stringify(low),
    );
    assert(
      medium.shadowMap === 1024 &&
        medium.ao === 0 &&
        medium.antialiasing === "fxaa" &&
        medium.atmosphere === 128 &&
        medium.bloom === 0 &&
        !medium.grade &&
        medium.drawn === 10 &&
        medium.sparks === 0 &&
        medium.pixelRatio === ratio,
      "Medium " + JSON.stringify(medium),
    );
    assert(
      high.shadowMap === 2048 &&
        Math.abs(high.ao - 0.5) < 0.01 &&
        high.aoSamples === 16 &&
        high.antialiasing === "fxaa" &&
        high.bloom > 0 &&
        high.grade &&
        high.drawn === 10,
      "High " + JSON.stringify(high),
    );
    assert(
      ultra.shadowMap === 4096 &&
        Math.abs(ultra.ao - 1) < 0.01 &&
        ultra.aoSamples === 32 &&
        ultra.antialiasing === "smaa" &&
        ultra.bloom > high.bloom &&
        ultra.grade &&
        ultra.atmosphere === 384 &&
        ultra.drawn === 10 &&
        ultra.sparks === 10 &&
        ultra.pixelRatio === Math.min(devicePixelRatio, 2),
      "Ultra " + JSON.stringify(ultra),
    );
    // Every step draws the same number of game particles: only visibility differs.
    assert(
      rows.every((r) => r.particles === 10),
      "particle counts " + rows.map((r) => r.particles),
    );
    // Ultra raises every registered texture's filtering; Medium puts it back.
    const { filteredTextures } = await import("/src/fidelity.ts"),
      most = g.renderer.capabilities.getMaxAnisotropy();
    const filtering = () => filteredTextures().map((t) => t.anisotropy);
    assert(
      filtering().length > 10 && filtering().every((a) => a >= most),
      `Ultra filtering ${[...new Set(filtering())]} (GPU ${most})`,
    );
    g.applySettings({ ...options, quality: 1 });
    assert(
      filtering().every((a) => a === 4 || a === 8),
      `Medium filtering ${[...new Set(filtering())]}`,
    );
    // Flames burn brighter than white only while bloom is on (R12-2).
    const flames = () => {
      const seen = [];
      g.arena.root.traverse((o) => {
        if (o.material?.userData?.glow === 2.6)
          seen.push(Math.max(o.material.color.r, o.material.color.g));
      });
      return seen;
    };
    g.applySettings({ ...options, quality: 1 });
    const plain = flames();
    g.applySettings({ ...options, quality: 2 });
    const lit = flames();
    g.applySettings({ ...options, quality: 1 });
    assert(plain.length > 0, "no flames in Frostbound Crossing");
    assert(
      plain.every((v) => v <= 1) && lit.every((v) => v > 1.5),
      `flames ${plain[0]} → ${lit[0]}`,
    );
    assert(flames()[0] === plain[0], "the flames did not go back after bloom");
    return rows
      .map(
        (r) =>
          `${r.name}: shadow ${r.shadowMap}, AO ${r.ao.toFixed(2)}×${r.aoSamples}, ${r.antialiasing}, bloom ${r.bloom}${r.grade ? " + grade" : ""}, ×${r.pixelRatio}, ${r.atmosphere} motes, ${r.drawn}+${r.sparks} sparks`,
      )
      .join("; ");
  });

  await check(
    "R12-1 a seeded rocket fight ends in exactly the same state at every step",
    async () => {
      const fight = (step) => {
        g.applySettings({
          ...options,
          quality: step,
          adaptiveResolution: false,
        });
        api.seed(12);
        api.start(1, 0);
        g.invulnerable = 0;
        g.waveDelay = 1e9;
        const at = (x, z) => g.position.clone().set(x, 0, z);
        for (const [i, type] of [
          "skeleton",
          "shambler",
          "brute",
          "witch",
          "hound",
          "monk",
        ].entries())
          g.spawnEnemy(type, at(-5 + i * 2, g.position.z - 14 - (i % 3)));
        for (let i = 0; i < 600; i++) {
          const target = g.enemies
            .map((e) => e.model.root.position)
            .sort(
              (a, b) => a.distanceTo(g.position) - b.distanceTo(g.position),
            )[0];
          if (target)
            g.yaw = Math.atan2(
              g.position.x - target.x,
              g.position.z - target.z,
            );
          g.pitch = -0.06;
          g.weapon = i < 300 ? 3 : 1;
          g.mouse = [!!target && i % 90 < 60, false];
          api.step(1);
        }
        g.mouse = [false, false];
        const s = api.state();
        delete s.fidelity;
        return {
          state: JSON.stringify({
            ...s,
            fps: 0,
            drawCalls: 0,
            triangles: 0,
            kills: g.levelKills,
            particles: g.particles.length,
            ragdolls: [...g.physics.ragdolls].map((r) =>
              r.bodies.map((b) => Object.values(b.translation())),
            ),
            random: api.randomState(),
          }),
          kills: g.levelKills,
        };
      };
      const runs = [1, 0, 2, 3].map(fight);
      assert(runs[0].kills > 0, "nothing was killed; the fight did not happen");
      for (const [i, step] of [0, 2, 3].entries())
        assert(
          runs[i + 1].state === runs[0].state,
          `the fight ended differently at step ${step}`,
        );
      return `${runs[0].kills} kills, identical at Low, Medium, High and Ultra`;
    },
  );

  // R12-3: transitions and button feedback.
  const fading = () => {
    const [a] = g.sceneFade.getAnimations();
    if (!a) return null;
    const t = a.currentTime;
    a.pause();
    a.currentTime = 0;
    const start = Number(getComputedStyle(g.sceneFade).opacity);
    a.currentTime = t;
    a.play();
    return { start, duration: a.effect.getComputedTiming().endTime };
  };
  await check(
    "R12-3 the world fades in from black on a level start, a gate and a retry, takes no clicks and is gone within a second",
    async () => {
      const seen = [];
      const expectFade = async (what) => {
        const f = fading();
        assert(f, what + ": no fade");
        assert(f.start > 0.99, `${what}: starts at ${f.start}`);
        assert(f.duration <= 1000, `${what}: lasts ${f.duration} ms`);
        assert(
          getComputedStyle(g.sceneFade).pointerEvents === "none",
          what + ": takes clicks",
        );
        seen.push(`${what} ${Math.round(f.duration)} ms`);
      };
      g.applySettings({ ...options, quality: 1 });
      api.seed(3);
      api.start(0, 0);
      g.invulnerable = 1e9;
      g.waveDelay = 1e9;
      await expectFade("level start");
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      assert(hit !== g.sceneFade, "the fade is hit by the pointer");
      await new Promise((r) => setTimeout(r, 1000));
      await frames(2);
      assert(
        Number(getComputedStyle(g.sceneFade).opacity) === 0,
        "still dark after a second",
      );
      g.enemies = [];
      g.remaining = 0;
      g.arenaCleared = true;
      g.nextArena();
      await expectFade("gate");
      g.retry();
      await expectFade("retry");
      // Reduced motion keeps a short fade.
      const reduced = [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter((r) => r.media?.mediaText.includes("prefers-reduced-motion"))
        .flatMap((r) => [...r.cssRules])
        .find((r) => r.selectorText === "#scene-fade.on");
      assert(
        reduced && parseFloat(reduced.style.animationDuration) <= 0.3,
        "no shorter fade under reduced motion",
      );
      seen.push(`reduced motion ${reduced.style.animationDuration}`);
      return seen.join(", ");
    },
  );

  await check(
    "R12-3 a new menu screen fades in; a re-render of the same page does not",
    async () => {
      g.setMode("playing");
      g.setMode("menu");
      await frames(1);
      click("page", "settings");
      let main = document.querySelector("#app main");
      assert(main.classList.contains("entering"), "Options did not fade in");
      assert(main.getAnimations().length > 0, "no animation on Options");
      click("settings-tab", "video");
      click("option", "adaptiveResolution:false");
      main = document.querySelector("#app main");
      assert(
        !main.classList.contains("entering"),
        "an option change replayed the page's fade",
      );
      click("option", "adaptiveResolution:true");
      // A confirmation dialog rises in too.
      click("defaults");
      assert(
        document
          .querySelector(".confirm-dialog")
          ?.classList.contains("entering"),
        "the dialog did not fade in",
      );
      click("cancel");
      // The whole menu fades in when it appears over a fight (pause).
      api.start(0, 0);
      g.setMode("paused");
      assert(
        document.querySelector(".game-menu").classList.contains("entering"),
        "the pause menu did not fade in",
      );
      return "Options, a dialog and the pause menu fade in; option changes do not";
    },
  );

  await check(
    "R12-3 a press shows for the mouse, a real Enter and the controller's A",
    async () => {
      const seen = [];
      g.setMode("playing");
      g.setMode("menu");
      click("page", "settings");
      click("settings-tab", "video");
      // Mouse: a click on a choice lights the (re-rendered) choice.
      click("option", "adaptiveResolution:false");
      const choice = () =>
        document.querySelector(
          '[data-action="option"][data-value="adaptiveResolution:false"]',
        );
      assert(choice().classList.contains("pressed"), "click: no press");
      await new Promise((r) => setTimeout(r, 250));
      assert(!choice().classList.contains("pressed"), "the press stayed on");
      seen.push("click");
      // Enter, as a real key press.
      const on = () =>
        document.querySelector(
          '[data-action="option"][data-value="adaptiveResolution:true"]',
        );
      on().focus();
      if (await press("Enter")) {
        assert(g.adaptiveResolution, "Enter did not choose");
        assert(on().classList.contains("pressed"), "Enter: no press");
        seen.push("Enter");
      } else seen.push("(this runner cannot press real keys)");
      await new Promise((r) => setTimeout(r, 250));
      // The controller's A on the focused choice.
      choice().focus();
      g.controls.poll(0.016, [pad()]);
      g.controls.poll(0.016, [pad([0])]);
      g.controls.poll(0.016, [pad()]);
      assert(!g.adaptiveResolution, "A did not choose");
      assert(choice().classList.contains("pressed"), "A: no press");
      // Unplug it here, in the menu: unplugging during a fight pauses it.
      g.controls.poll(0.016, []);
      seen.push("A");
      g.applySettings({ ...g.settings(), adaptiveResolution: true });
      // The focused command keeps round 11's dark halo while pressed.
      g.setMode("playing");
      g.setMode("menu");
      const command = document.querySelector(".menu-command");
      command.classList.add("pressed");
      const shadow = getComputedStyle(command).textShadow;
      command.classList.remove("pressed");
      assert(
        /^rgb\(0, 0, 0\) 0px 0px 2px/.test(shadow),
        "pressed halo " + shadow,
      );
      return seen.join(", ");
    },
  );

  await check(
    "R12-3 the fade changes nothing in a seeded fight through a gate",
    async () => {
      const run = (fade) => {
        const original = g.fadeIn;
        if (!fade) g.fadeIn = () => {};
        try {
          api.seed(21);
          api.start(0, 0);
          g.invulnerable = 0;
          for (let i = 0; i < 400; i++) {
            g.mouse = [i % 50 < 30, false];
            api.step(1);
          }
          g.enemies.forEach((e) => (e.hp = 0));
          g.enemies = [];
          g.remaining = 0;
          g.arenaCleared = true;
          g.nextArena();
          for (let i = 0; i < 400; i++) {
            g.mouse = [i % 50 < 30, false];
            api.step(1);
          }
          g.mouse = [false, false];
          const s = api.state();
          delete s.fidelity;
          return JSON.stringify({
            ...s,
            fps: 0,
            drawCalls: 0,
            triangles: 0,
            tick: g.tick,
            random: api.randomState(),
          });
        } finally {
          g.fadeIn = original;
        }
      };
      const a = run(true),
        b = run(false);
      assert(a === b, "the fight differed with the fade");
      return `room ${JSON.parse(a).room}, identical`;
    },
  );

  // R12-4: the low-health readout pulses brighter, never fainter.
  await check(
    "R12-4 the low-health readout pulses brighter, never fainter, and stays red",
    async () => {
      api.start(0, 0);
      g.invulnerable = 1e9;
      g.waveDelay = 1e9;
      g.health = 5;
      g.armor = 0;
      await frames(10);
      g.onHUD();
      const number = document.getElementById("hud-health");
      assert(number, `no health readout (mode ${g.mode})`);
      assert(number.closest(".health").classList.contains("low"), "not low");
      const [pulse] = number
        .getAnimations()
        .filter((a) => a.animationName === "low-health");
      assert(pulse, "no pulse");
      const at = (ms) => {
        pulse.pause();
        pulse.currentTime = ms;
        const style = getComputedStyle(number),
          [r, gr, b] = style.color.match(/\d+/g).map(Number);
        return { opacity: Number(style.opacity), r, g: gr, b };
      };
      const samples = [0, 150, 300, 450, 600, 750].map(at);
      pulse.play();
      assert(
        samples.every((s) => s.opacity === 1),
        "the readout fades: " + samples.map((s) => s.opacity),
      );
      assert(
        samples.every((s) => s.r === 255 && s.g < s.r - 40 && s.b < s.r - 50),
        "not red at every moment",
      );
      const lum = (s) => 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
      assert(lum(samples[3]) > lum(samples[0]), "the pulse does not brighten");
      g.health = 100;
      return samples.map((s) => `rgb(${s.r}, ${s.g}, ${s.b})`).join(" → ");
    },
  );

  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("playing");
  g.setMode("menu");
  await frames(2);
  return results;
})();

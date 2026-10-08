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
        high.drawn === 10,
      "High " + JSON.stringify(high),
    );
    assert(
      ultra.shadowMap === 4096 &&
        Math.abs(ultra.ao - 1) < 0.01 &&
        ultra.aoSamples === 32 &&
        ultra.antialiasing === "smaa" &&
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
    return rows
      .map(
        (r) =>
          `${r.name}: shadow ${r.shadowMap}, AO ${r.ao.toFixed(2)}×${r.aoSamples}, ${r.antialiasing}, ×${r.pixelRatio}, ${r.atmosphere} motes, ${r.drawn}+${r.sparks} sparks`,
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

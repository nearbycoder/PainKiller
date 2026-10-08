// Measurement: the same frozen frame at every Graphics fidelity step, as a screenshot
// and as render times. Each scene starts seeded, puts a brute, a skeleton and a witch in
// view, fires a rocket and freezes the frame loop just after the blast; then, for each
// step, the frame is drawn again exactly as the loop draws it (world, composer and
// weapon), captured, and drawn 60 more times with gl.finish() to time it.
//   npm run test:browser -- --before 'window.__FIDELITY_OUT__="artifacts/r12/fidelity/1280"' --checks tools/media/round12/fidelity.js --out artifacts/r12/fidelity/1280.json
// Set window.__FIDELITY_LEVELS__ (level indices), __FIDELITY_STEPS__ and __FIDELITY_RUNS__
// (frames timed per step) with --before; --size 1920x1080 for another window size.
(async () => {
  const api = window.__PURGATORY__,
    g = api.game;
  const out = window.__FIDELITY_OUT__ || "artifacts/r12/fidelity",
    levels = window.__FIDELITY_LEVELS__ || [0, 8, 3],
    steps = window.__FIDELITY_STEPS__ || [0, 1, 2, 3],
    runs = window.__FIDELITY_RUNS__ || 60,
    names = ["low", "medium", "high", "ultra"];
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
  const options = g.settings(),
    renderer = g.renderer,
    gl = renderer.getContext();
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  const raf = window.requestAnimationFrame;
  const report = {
    window: [innerWidth, innerHeight],
    devicePixelRatio,
    gpu: (() => {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    })(),
    scenes: {},
  };
  /** One frame as Game.loop() draws it; `shadows` refreshes the sun's shadow map. */
  const draw = (shadows) => {
    renderer.info.reset();
    renderer.autoClear = true;
    if (shadows) renderer.shadowMap.needsUpdate = true;
    g.renderWorld(1 / 60);
    if (g.quality === 0) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(g.weaponScene, g.weaponCamera);
    }
  };
  for (const level of levels) {
    window.requestAnimationFrame = raf;
    raf(g.loop);
    g.applySettings({ ...options, quality: 1, adaptiveResolution: false });
    api.seed(5);
    api.start(level, 0);
    g.invulnerable = 1e9;
    g.waveDelay = 1e9;
    g.equip(3);
    await frames(40);
    const d = g.direction();
    for (const [type, ahead, side] of [
      ["brute", 9, -2],
      ["skeleton", 7, 2.5],
      ["witch", 13, 0.5],
    ]) {
      const p = g.position
        .clone()
        .addScaledVector(d, ahead)
        .add(new g.position.constructor(-d.z * side, 0, d.x * side));
      p.y = 0;
      g.spawnEnemy(type, p);
    }
    g.enemies.forEach((e) => (e.speed = 0));
    await frames(50);
    g.mouse = [true, false];
    await frames(12);
    g.mouse = [false, false];
    await frames(14);
    // Freeze: the frame loop stops rescheduling and nothing moves from here on.
    window.requestAnimationFrame = (cb) => (cb === g.loop ? 0 : raf(cb));
    await frames(3);
    g.messages.clear();
    g.onHUD();
    const scene = (report.scenes[api.campaign[level].name] = {});
    for (const step of steps) {
      g.applySettings({ ...options, quality: step, adaptiveResolution: false });
      // Compile and settle (shader programs, shadow maps, texture uploads).
      for (let i = 0; i < 12; i++) draw(true);
      gl.finish();
      await frames(2);
      const file = `${out}/level-${level}-${step}-${names[step]}`;
      await capture(`${file}.png`);
      const samples = [];
      // main before round 12 had no g.fidelity: its steps refreshed shadows at 30 Hz.
      const every = (g.fidelity?.shadowRate ?? 30) >= 60 ? 1 : 2;
      for (let i = 0; i < runs; i++) {
        const t = performance.now();
        draw(i % every === 0);
        gl.finish();
        samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b);
      const at = (q) => samples[Math.min(runs - 1, Math.floor(q * runs))];
      scene[g.fidelity?.name ?? names[step]] = {
        file: `${file}.png`,
        medianMs: +at(0.5).toFixed(2),
        p95Ms: +at(0.95).toFixed(2),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      };
    }
  }
  window.requestAnimationFrame = raf;
  raf(g.loop);
  g.applySettings(options);
  g.setMode("menu");
  return report;
})();

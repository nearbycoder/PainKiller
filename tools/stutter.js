// Measures first-use stutter: frame times while a fresh session starts a level, spawns
// every breed and fires every mode, then the same again with everything warm. Shader
// programs compiled along the way are logged. Timing depends on machine load; note it.
//   npm run test:browser -- --checks tools/stutter.js --out artifacts/stutter.json
(async () => {
  const g = window.__PURGATORY__.game;
  g.sound.setVolume(0);
  const frames = [];
  let last = performance.now(),
    on = true,
    label = "";
  const tick = (t) => {
    frames.push([t - last, label]);
    last = t;
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const programs = () => g.renderer.info.programs.length;
  const log = [];
  const render = g.renderWorld.bind(g);
  g.renderWorld = (...a) => {
    const p0 = programs(),
      t0 = performance.now();
    const r = render(...a);
    const ms = performance.now() - t0;
    if (ms > 40 || programs() > p0)
      log.push(
        `${label}: frame ${Math.round(ms)} ms, programs ${p0} → ${programs()}`,
      );
    return r;
  };
  if (g.warmUp) {
    const warmUp = g.warmUp.bind(g);
    g.warmUp = () => {
      const p0 = programs(),
        t0 = performance.now();
      warmUp();
      log.push(
        `${label}: warm-up draw ${Math.round(performance.now() - t0)} ms, programs ${p0} → ${programs()}`,
      );
    };
  }
  const run = async (name, level) => {
    label = name + ": start";
    g.start(level, 0, false);
    await wait(1500);
    for (const type of [
      "skeleton",
      "revenant",
      "hound",
      "monk",
      "witch",
      "knight",
      "brute",
    ]) {
      label = name + ": spawn " + type;
      g.spawnEnemy(type);
      await wait(400);
    }
    for (let w = 0; w < 5; w++)
      for (const alt of [false, true]) {
        label = `${name}: fire ${w}${alt ? " alt" : ""}`;
        g.cooldown = 0;
        g.equip(w);
        g.shoot(alt);
        await wait(500);
      }
    label = name + ": explosion";
    g.explode(g.position.clone().setZ(g.position.z - 6), 0, 6);
    await wait(800);
    label = name + ": wraith";
    g.demon = 15;
    await wait(800);
    g.demon = 0;
  };
  const summary = (f) => {
    const d = f.map((x) => x[0]).sort((a, b) => a - b);
    return {
      frames: d.length,
      median: +d[d.length >> 1].toFixed(1),
      worst: f
        .slice()
        .sort((a, b) => b[0] - a[0])
        .slice(0, 6)
        .map(([ms, l]) => `${Math.round(ms)} ms ${l}`),
    };
  };
  label = "title";
  await wait(3000);
  const title = summary(frames.splice(0));
  await run("cold", 8);
  const cold = summary(frames.splice(0));
  await run("warm", 8);
  on = false;
  const warm = summary(frames.splice(0));
  g.setMode("menu");
  return { title, cold, warm, log };
})();

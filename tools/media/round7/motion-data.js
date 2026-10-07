// R7-1 chart data: how far the drawn camera moves on each displayed frame while walking,
// with interpolation off (as before round 7) and on, at 144 Hz and at 60 Hz with ±3 ms
// of frame-time jitter. Feeds tools/media/round7/motion-chart.py.
//   npm run test:browser -- --checks tools/media/round7/motion-data.js --out artifacts/r7/motion.json
(() => {
  const api = window.__PURGATORY__,
    g = api.game;
  g.sound.setVolume(0);
  g.hints.setEnabled(false);
  const raf = window.requestAnimationFrame;
  const out = {};
  window.requestAnimationFrame = () => 0;
  try {
    for (const [hz, jitter] of [
      [144, 0],
      [60, 3],
    ])
      for (const interpolate of [false, true]) {
        api.seed(5);
        api.start(0, 0, false);
        g.interpolate = interpolate;
        g.waveDelay = 1e9;
        g.invulnerable = 1e9;
        g.headBob = false;
        let t = 1000;
        g.lastTime = t;
        const next = (i) =>
          (t += 1000 / hz + jitter * Math.sin(i * 2.39996) * Math.cos(i));
        for (let i = 0; i < 30; i++) g.loop(next(i));
        g.keys.add("KeyW");
        for (let i = 30; i < 30 + hz; i++) g.loop(next(i));
        const moved = [];
        let z = g.camera.position.z;
        for (let i = 30 + hz; i < 30 + hz + 48; i++) {
          const before = t;
          g.loop(next(i));
          moved.push({
            ms: +(t - before).toFixed(2),
            m: +(z - g.camera.position.z).toFixed(4),
          });
          z = g.camera.position.z;
        }
        g.keys.clear();
        out[`${hz}${jitter ? "j" : ""}-${interpolate ? "after" : "before"}`] =
          moved;
      }
  } finally {
    window.requestAnimationFrame = raf;
    g.interpolate = true;
    g.headBob = true;
    g.setMode("menu");
  }
  return out;
})();

// Scenario checks for the seventh improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round7`.
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
  const round = (x, n = 3) => +x.toFixed(n);
  const stats = (values) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    );
    return { mean: round(mean, 4), cv: round(sd / mean) };
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);

  // Drive the real frame loop with display timestamps. Each g.loop() call schedules the
  // next frame, so requestAnimationFrame is held off meanwhile (see round 5's storm check).
  const raf = window.requestAnimationFrame;
  const drive = (times, onFrame) => {
    window.requestAnimationFrame = () => 0;
    try {
      for (const t of times) {
        g.loop(t);
        onFrame?.();
      }
    } finally {
      window.requestAnimationFrame = raf;
    }
  };
  const timestamps = (hz, frames, jitter = 0) => {
    let t = 1000;
    // A fixed pattern of uneven frame times (up to ±jitter ms), the same on every run.
    return Array.from(
      { length: frames },
      (_, i) => (t += 1000 / hz + jitter * Math.sin(i * 2.39996) * Math.cos(i)),
    );
  };
  // Where things were drawn: renderWorld is called with the drawn positions in place.
  const renderWorld = g.renderWorld;
  let drawn = null;
  g.renderWorld = function (...a) {
    drawn?.(this);
    return renderWorld.apply(this, a);
  };
  const walk = (hz, jitter, interpolate) => {
    api.seed(5);
    api.start(0, 0, false);
    g.interpolate = interpolate;
    g.waveDelay = 1e9;
    g.invulnerable = 1e9;
    g.headBob = false;
    const lead = timestamps(hz, 30 + hz, jitter);
    g.lastTime = lead[0] - 1000 / hz;
    drive(lead.slice(0, 30));
    g.keys.add("KeyW");
    const z = [],
      t = [];
    drawn = (game) => z.push(game.camera.position.z);
    drive(lead.slice(30), () => t.push(g.lastTime));
    drawn = null;
    g.keys.clear();
    // Speed on each displayed frame, after half a second of walking (no acceleration).
    const speeds = [];
    for (let i = Math.floor(hz / 2); i < z.length; i++)
      speeds.push((z[i - 1] - z[i]) / ((t[i] - t[i - 1]) / 1000));
    return {
      frozen: speeds.filter((s) => Math.abs(s) < 1e-6).length,
      frames: speeds.length,
      ...stats(speeds),
    };
  };

  await check(
    "R7-1 the camera moves evenly at 60, 75, 120 and 144 Hz and with uneven frames",
    () => {
      const out = {};
      for (const [hz, jitter] of [
        [60, 0],
        [60, 3],
        [75, 0],
        [120, 0],
        [144, 0],
        [144, 1.5],
      ]) {
        const on = walk(hz, jitter, true),
          off = walk(hz, jitter, false);
        out[`${hz}Hz${jitter ? "±" + jitter : ""}`] = {
          before: `${off.frozen}/${off.frames} frozen, cv ${off.cv}`,
          after: `${on.frozen}/${on.frames} frozen, cv ${on.cv}, ${on.mean} m/s`,
        };
        assert(on.frozen === 0, `${hz} Hz: ${on.frozen} frozen frames`);
        assert(on.cv < 0.05, `${hz} Hz: uneven, cv ${on.cv}`);
        assert(Math.abs(on.mean - 10) < 0.2, `${hz} Hz: speed ${on.mean}`);
      }
      return out;
    },
  );

  await check("R7-1 an enemy walking at you moves evenly at 144 Hz", () => {
    const out = {};
    for (const interpolate of [false, true]) {
      api.seed(6);
      api.start(0, 0, false);
      g.interpolate = interpolate;
      g.waveDelay = 1e9;
      g.invulnerable = 1e9;
      api.spawn("shambler");
      const e = g.enemies.at(-1);
      e.model.root.position.set(g.position.x, 0, g.position.z - 18);
      e.model.root.rotation.y = Math.PI;
      const times = timestamps(144, 144 + 72);
      g.lastTime = times[0] - 1000 / 144;
      const z = [];
      drawn = () => z.push(e.model.root.position.z);
      drive(times);
      drawn = null;
      const steps = z
        .slice(73)
        .map((v, i) => v - z[72 + i])
        .filter(() => true);
      const frozen = steps.filter((s) => Math.abs(s) < 1e-6).length;
      out[interpolate ? "after" : "before"] = {
        frozen: `${frozen}/${steps.length}`,
        ...stats(steps),
      };
      if (interpolate) {
        assert(frozen === 0, `${frozen} frozen frames`);
        assert(stats(steps).cv < 0.1, "uneven: " + stats(steps).cv);
      } else assert(frozen > steps.length / 3, "expected frozen frames");
    }
    g.interpolate = true;
    return out;
  });

  await check(
    "R7-1 the simulation is identical with interpolation on and off",
    () => {
      const fight = (interpolate) => {
        api.seed(11);
        api.start(0, 0, false);
        g.interpolate = interpolate;
        g.waveDelay = 0.5;
        g.invulnerable = 0;
        const times = timestamps(144, 144 * 14, 1.5);
        g.lastTime = times[0] - 1000 / 144;
        // Hold fire and sweep the view; check that frames without a step change nothing.
        let unchanged = 0,
          stepless = 0;
        window.requestAnimationFrame = () => 0;
        try {
          times.forEach((t, i) => {
            // Aim at the nearest enemy with rockets, as the balance autopilot does.
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
            g.pitch = -0.08;
            g.weapon = 3;
            g.mouse = [!!target && i % 200 < 150, false];
            const tick = g.tick,
              before = JSON.stringify(
                g.enemies.map((e) => e.model.root.position),
              );
            g.loop(t);
            if (g.tick === tick && g.mode === "playing") {
              stepless++;
              if (
                JSON.stringify(g.enemies.map((e) => e.model.root.position)) ===
                before
              )
                unchanged++;
            }
          });
        } finally {
          window.requestAnimationFrame = raf;
          g.mouse = [false, false];
        }
        const s = api.state();
        return {
          state: JSON.stringify({
            ...s,
            kills: g.levelKills,
            ragdolls: [...g.physics.ragdolls].map((r) =>
              r.bodies.map((b) => Object.values(b.translation())),
            ),
            fps: 0,
            drawCalls: 0,
            triangles: 0,
            random: api.randomState(),
            tick: g.tick,
          }),
          kills: g.levelKills,
          health: s.health,
          stepless,
          unchanged,
        };
      };
      const off = fight(false),
        on = fight(true);
      g.interpolate = true;
      assert(on.kills > 0, "nothing was killed; the fight did not happen");
      assert(on.state === off.state, "the fight ended differently");
      assert(
        on.stepless > 0 && on.unchanged === on.stepless,
        `positions changed on ${on.stepless - on.unchanged} frames without a step`,
      );
      return {
        kills: on.kills,
        ragdolls: JSON.parse(on.state).ragdolls.length,
        health: round(on.health, 1),
        framesWithoutAStep: on.stepless,
      };
    },
  );

  await check("R7-1 a new sector is drawn at its start, not slid to it", () => {
    api.seed(7);
    api.start(0, 0, false);
    g.waveDelay = 1e9;
    let t = 1000;
    g.lastTime = t;
    drive([(t += 7), (t += 7), (t += 7)]);
    g.position.set(10, 1.75, -10);
    drive([(t += 7), (t += 7), (t += 7)]);
    api.start(0, 1, false);
    let camera;
    drawn = (game) => (camera = game.camera.position.clone());
    drive([(t += 7)]);
    drawn = null;
    const gap = camera.distanceTo(g.position);
    assert(gap < 0.05, "drawn " + gap.toFixed(2) + " m from the start");
    return { gap: round(gap) };
  });

  g.renderWorld = renderWorld;
  g.interpolate = true;

  // R7-2: the low-health warning.
  const storedOptions = () =>
    JSON.parse(localStorage.getItem("purgatory.options") || "{}");
  const click = (selector) => {
    const el = document.querySelector(selector);
    assert(el, "missing " + selector);
    el.click();
  };
  const setOption = (tab, key, value) => {
    g.setMode("paused");
    click('[data-action="page"][data-value="settings"]');
    click(`[data-action="settings-tab"][data-value="${tab}"]`);
    click(`[data-action="option"][data-value="${key}:${value}"]`);
    g.setMode("playing");
    g.onHUD();
  };
  const calm = (level = 0, room = 0) => {
    api.seed(9);
    api.start(level, room, false);
    g.waveDelay = 1e9;
    g.invulnerable = 1e9;
  };
  const warning = (health) => {
    g.health = health;
    g.onHUD();
    return {
      // What the HUD asks for; the overlay fades to it over 0.3 s.
      overlay: +document.getElementById("low-health-overlay").style.opacity,
      red: document.querySelector(".health").classList.contains("low"),
    };
  };
  let beats = 0;
  const heartbeat = g.sound.heartbeat;
  g.sound.heartbeat = function (...a) {
    beats++;
    return heartbeat.apply(this, a);
  };
  const beatsIn = (seconds) => {
    beats = 0;
    api.step(Math.round(seconds * 60));
    return beats;
  };

  await check(
    "R7-2 the HUD warns at low health, more strongly near death",
    () => {
      calm();
      const seen = {};
      for (const h of [100, 26, 25, 20, 5]) seen[h] = warning(h);
      assert(!seen[100].red && seen[100].overlay === 0, "warning at 100");
      assert(!seen[26].red && seen[26].overlay === 0, "warning at 26");
      assert(seen[25].red && seen[25].overlay > 0, "no warning at 25");
      assert(seen[20].red && seen[20].overlay > 0, "no warning at 20");
      assert(seen[5].overlay > seen[20].overlay, "not stronger at 5");
      g.demon = 5;
      const wraith = warning(5);
      g.demon = 0;
      assert(!wraith.red && wraith.overlay === 0, "warning in Wraith form");
      return { ...seen, wraith };
    },
  );

  await check("R7-2 a health pickup clears the warning", () => {
    calm();
    g.invulnerable = 0;
    warning(12);
    g.addPickup("health", g.position.clone().setY(0.65));
    api.step(30);
    const after = warning(g.health);
    assert(g.health > 25, "not healed: " + g.health);
    assert(!after.red && after.overlay === 0, "still warning");
    return { health: Math.round(g.health) };
  });

  await check(
    "R7-2 the heartbeat plays only while low and playing, faster near death",
    () => {
      calm();
      g.health = 100;
      const full = beatsIn(4);
      g.health = 22;
      const low = beatsIn(4);
      g.health = 3;
      const near = beatsIn(4);
      g.demon = 3;
      const wraith = beatsIn(2.5);
      g.demon = 0;
      g.lowHealthWarning = false;
      const off = beatsIn(4);
      g.lowHealthWarning = true;
      // Paused: drive the real frame loop; nothing steps and nothing beats.
      g.setMode("paused");
      beats = 0;
      let t = 1000;
      g.lastTime = t;
      drive(Array.from({ length: 240 }, () => (t += 1000 / 60)));
      const paused = beats;
      g.setMode("playing");
      assert(full === 0, `${full} beats at full health`);
      assert(low >= 4 && low <= 5, `${low} beats in 4 s at 22`);
      assert(near > low, `not faster near death (${near} vs ${low})`);
      assert(
        wraith === 0 && off === 0 && paused === 0,
        "beats when it should not",
      );
      // Death ends it.
      g.health = 3;
      g.invulnerable = 0;
      g.hurt(50, undefined, "melee", "brute");
      assert(g.mode === "dead", "did not die");
      assert(g.lowHealth() === 0, "warning on the death screen");
      return { full, low, near, wraith, off, paused };
    },
  );

  await check(
    "R7-2 the heartbeat leaves the game's random sequence alone",
    () => {
      const run = (on) => {
        api.seed(12);
        api.start(0, 0, false);
        g.lowHealthWarning = on;
        g.health = 15;
        g.invulnerable = 1e9;
        g.waveDelay = 0.5;
        api.step(600);
        return JSON.stringify({
          random: api.randomState(),
          enemies: api.state().enemies,
        });
      };
      const on = run(true),
        off = run(false);
      g.lowHealthWarning = true;
      assert(on === off, "the fight differs with the heartbeat");
      return "same";
    },
  );

  await check("R7-2 the option turns the warning off, and saves", () => {
    calm();
    setOption("gameplay", "lowHealthWarning", false);
    const off = warning(10);
    assert(storedOptions().lowHealthWarning === false, "not saved");
    assert(!off.red && off.overlay === 0, "still warning with the option off");
    setOption("gameplay", "lowHealthWarning", true);
    assert(storedOptions().lowHealthWarning === true, "not saved back on");
    assert(warning(10).red, "not back on");
    return "ok";
  });
  g.sound.heartbeat = heartbeat;

  g.applySettings(options);
  g.saveOptions();
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

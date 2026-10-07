// Scenario checks for the sixth improvement round (see docs/IMPROVEMENTS.md).
// Evaluate against `npm run dev`, or run with `npm run test:browser -- --checks round6`.
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const busy = (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end);
  };
  g.hints.setEnabled(false);
  g.sound.setVolume(0);
  g.sound.start();
  const { THEMES, hz } = await import("/src/music.ts");

  // Record every music voice: when it was asked for and when it is set to start.
  const sound = g.sound,
    tone = sound.tone,
    noise = sound.noise;
  let voices = [];
  sound.tone = function (...a) {
    if (a[5])
      voices.push({
        kind: "tone",
        freq: a[0],
        type: a[2],
        asked: this.ctx.currentTime,
        at: Math.max(a[7] || 0, this.ctx.currentTime),
      });
    return tone.apply(this, a);
  };
  sound.noise = function (...a) {
    if (a[3])
      voices.push({
        kind: "noise",
        asked: this.ctx.currentTime,
        at: Math.max(a[5] || 0, this.ctx.currentTime),
      });
    return noise.apply(this, a);
  };
  // Step the simulation by hand at uneven wall-clock intervals, with the live frame loop
  // held off ("paused"), so the music is polled at ragged times, with one 100 ms hitch.
  async function play(frames, { hitch = true, setup } = {}) {
    for (let f = 0; f < frames; f++) {
      g.mode = "playing";
      setup?.(f);
      api.step(1);
      g.mode = "paused";
      if (hitch && f % 40 === 39) busy(100);
      else await wait([4, 16, 33, 9, 50][f % 5]);
    }
    g.mode = "playing";
  }
  const kicks = () =>
    voices.filter(
      (v) => v.kind === "tone" && v.freq === 135 && v.type === "sine",
    );
  const quiet = () => {
    g.waveDelay = 9999;
    g.invulnerable = 1e9;
  };

  await check(
    "music keeps time under uneven frames and a 100 ms hitch",
    async () => {
      api.seed(6);
      api.start(0, 0);
      quiet();
      for (let i = 0; i < 4; i++)
        g.spawnEnemy("shambler", g.position.clone().set(-8 + i * 5, 0, -12));
      g.remaining = 0;
      voices = [];
      await play(160);
      const k = kicks().map((v) => v.at);
      assert(k.length >= 6, "too few kicks: " + k.length);
      const step = THEMES[0].step;
      const gaps = k.slice(1).map((t, i) => t - k[i]);
      // Kicks fall on steps 0 and 4 of the bar: every 4 steps (a skipped beat, if the page
      // stalls for longer than the look-ahead, still leaves the next one on the grid).
      const bars = gaps.map((d) => d / (4 * step));
      const worst = Math.max(
        ...bars.map((b) => Math.abs(b - Math.round(b)) * 4 * step),
      );
      assert(worst < 0.001, "kick off the beat by " + worst.toFixed(4) + " s");
      assert(
        bars.filter((b) => Math.round(b) === 1).length >= bars.length - 1,
        "beats were skipped: " + bars.map((b) => b.toFixed(2)),
      );
      return { kicks: k.length, worstError: worst, voices: voices.length };
    },
  );

  await check(
    "music follows the fight: calm, combat, general, cleared",
    async () => {
      // Chapter I, before the first wave: drone and sparse bass only.
      api.seed(7);
      api.start(4, 2); // The Barrow's general sector
      quiet();
      voices = [];
      await play(90, { hitch: false });
      const calm = voices;
      assert(calm.length > 0, "no music before the first wave");
      assert(
        !calm.some((v) => v.kind === "noise") && !kicks().length,
        "drums played before the wave",
      );
      // Enemies in the arena: the full figure.
      for (let i = 0; i < 3; i++)
        g.spawnEnemy("skeleton", g.position.clone().set(-6 + i * 6, 0, -14));
      voices = [];
      await play(90, { hitch: false });
      const fight = voices;
      assert(kicks().length > 0, "no kick in combat");
      assert(
        fight.some((v) => v.kind === "noise"),
        "no hat in combat",
      );
      assert(
        !fight.some((v) => v.freq === 120 || v.freq === 96),
        "tom in combat",
      );
      // A general: extra octave voice and the tom fill at the end of the phrase.
      g.spawnEnemy("boss", g.position.clone().set(0, 0, -20));
      voices = [];
      await play(260, { hitch: false });
      const general = voices;
      assert(
        general.some((v) => v.type === "square"),
        "no octave layer with a general",
      );
      assert(
        general.some((v) => v.freq === 120 || v.freq === 96),
        "no tom fill with a general",
      );
      // Cleared: nothing new is scheduled.
      for (const e of [...g.enemies]) e.hp = 0;
      g.enemies.length = 0;
      g.arenaCleared = true;
      voices = [];
      await play(60, { hitch: false });
      assert(voices.length === 0, voices.length + " voices after the clear");
      return {
        calm: calm.length,
        fight: fight.length,
        general: general.length,
      };
    },
  );

  await check("each chapter plays its own theme", async () => {
    const seen = [];
    for (const [level, chapter] of [
      [0, 1],
      [5, 2],
      [11, 3],
      [16, 4],
      [21, 5],
    ]) {
      api.seed(8);
      api.start(level, 0);
      quiet();
      g.spawnEnemy("skeleton", g.position.clone().set(0, 0, -14));
      voices = [];
      await play(120, { hitch: false });
      const theme = THEMES[chapter - 1];
      const scale = new Set(
        theme.bars
          .flat()
          .filter((s) => s !== null)
          .map((s) => hz(theme, s).toFixed(2)),
      );
      const bass = voices.filter(
        (v) => v.kind === "tone" && v.type === theme.bass && v.freq < 170,
      );
      assert(bass.length > 4, `chapter ${chapter}: no bass`);
      for (const v of bass)
        assert(
          scale.has(v.freq.toFixed(2)),
          `chapter ${chapter}: ${v.freq} is not in its theme`,
        );
      const k = kicks().map((v) => v.at);
      const spacing = Math.min(...k.slice(1).map((t, i) => t - k[i]));
      seen.push({
        chapter,
        bass: bass.length,
        minKickGap: +spacing.toFixed(3),
      });
    }
    return seen;
  });

  await check("no music with music turned off", async () => {
    g.applySettings({ ...g.settings(), music: false });
    api.start(0, 0);
    quiet();
    g.spawnEnemy("skeleton", g.position.clone().set(0, 0, -14));
    voices = [];
    await play(60, { hitch: false });
    g.applySettings({ ...g.settings(), music: true });
    assert(voices.length === 0, voices.length + " voices with music off");
    return "silent";
  });

  sound.tone = tone;
  sound.noise = noise;
  g.applySettings(options);
  g.sound.setVolume(volume);
  g.save = saved;
  g.persist();
  g.setMode("menu");
  return results;
})();

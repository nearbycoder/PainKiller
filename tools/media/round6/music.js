// R6-1: render the combat music offline with the game's synthesizer: levels for each
// chapter and layer next to the single loop every sector played before round 6, and a
// listening clip for a person.
//   npm run test:browser -- --checks tools/media/round6/music.js --out artifacts/r6/music.json
// The JSON holds the levels and the clip as a base64 WAV (48 kHz mono).
(async () => {
  const { Sound } = await import("/src/audio.ts");
  const { THEMES } = await import("/src/music.ts");
  const RATE = 48000;
  async function render(seconds, play) {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
    let now = 0;
    // Sound schedules at ctx.currentTime; steer that clock per event.
    const clock = new Proxy(ctx, {
      get(target, key) {
        if (key === "currentTime") return now;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const sound = new Sound();
    sound.ctx = clock;
    sound.start = () => {}; // an offline context cannot be resumed
    sound.gain = ctx.createGain();
    sound.gain.connect(ctx.destination);
    sound.effectsGain = ctx.createGain();
    sound.musicGain = ctx.createGain();
    sound.effectsGain.connect(sound.gain);
    sound.musicGain.connect(sound.gain);
    // The default options: master 45%, effects 100%, music 65%.
    sound.setVolume(0.45);
    sound.setChannels(1, 0.65);
    play((t, fn) => {
      now = t;
      fn(sound);
    });
    return (await ctx.startRendering()).getChannelData(0);
  }
  const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  // Peak, the loudest 50 ms window (RMS), and the RMS over the whole span.
  function levels(data) {
    let peak = 0,
      total = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      total += v * v;
    }
    const w = Math.round(0.05 * RATE);
    let sum = 0,
      best = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      if (i >= w) sum -= data[i - w] * data[i - w];
      best = Math.max(best, sum);
    }
    return {
      peak: db(peak),
      rms50: db(Math.sqrt(best / w)),
      rms: db(Math.sqrt(total / data.length)),
    };
  }
  // The music as the game plays it: polled every simulation step (here every 20 ms).
  const music = (at, from, to, layer, chapter) => {
    for (let t = from; t < to - 0.15; t += 0.02)
      at(t, (s) => s.update(layer, chapter));
    at(to, (s) => s.update(null));
  };
  // The loop every sector played before round 6, at its nominal 0.185 s.
  const NOTES = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];
  const old = (at, from, to) => {
    for (let i = 0, t = from; t < to - 0.1; i++, t = from + i * 0.185)
      at(t, (s) => {
        s.tone(NOTES[i % 8], 0.16, "sawtooth", 0.045, NOTES[i % 8] * 0.98, true);
        if (i % 4 === 0) s.tone(135, 0.12, "sine", 0.17, 35, true);
        if (i % 4 === 2) s.noise(0.08, 0.065, 6500, true);
      });
  };
  const table = {};
  // One full phrase (32 steps) of each, starting after the first bar so the drone is in.
  const phrase = (theme) => theme.step * 32;
  table["before round 6: the one loop"] = levels(
    await render(6.2, (at) => old(at, 0.05, 6.0)),
  );
  for (const [i, theme] of THEMES.entries())
    for (const layer of ["calm", "fight", "general"])
      table[`${i + 1}. ${theme.name}, ${layer}`] = levels(
        await render(phrase(theme) + 0.6, (at) =>
          music(at, 0, phrase(theme) + 0.3, layer, i + 1),
        ),
      );
  // A listening clip: the old loop, then each chapter waiting for a wave and fighting it,
  // with a general in chapters I and V.
  const plan = [];
  let t = 0.2;
  plan.push(["old", t, (t += 6)]);
  t += 0.8;
  for (const [i, theme] of THEMES.entries()) {
    plan.push(["calm", t, (t += 3.2), i + 1]);
    plan.push(["fight", t, (t += phrase(theme) + 0.4), i + 1]);
    if (i === 0 || i === 4) plan.push(["general", t, (t += phrase(theme) + 0.4), i + 1]);
    t += 1.2;
  }
  const clip = await render(t + 1.5, (at) => {
    for (const [layer, from, to, chapter] of plan)
      if (layer === "old") old(at, from, to);
      else music(at, from, to, layer, chapter);
  });
  const pcm = new DataView(new ArrayBuffer(44 + clip.length * 2));
  const text = (o, s) =>
    [...s].forEach((c, i) => pcm.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  pcm.setUint32(4, 36 + clip.length * 2, true);
  text(8, "WAVEfmt ");
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, 1, true);
  pcm.setUint32(24, RATE, true);
  pcm.setUint32(28, RATE * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  text(36, "data");
  pcm.setUint32(40, clip.length * 2, true);
  for (let i = 0; i < clip.length; i++)
    pcm.setInt16(44 + i * 2, Math.max(-1, Math.min(1, clip[i])) * 0x7fff, true);
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return {
    table,
    plan: plan.map(([layer, from, to, chapter]) => ({
      layer,
      chapter,
      from: +from.toFixed(1),
      to: +to.toFixed(1),
    })),
    wav: btoa(binary),
  };
})();

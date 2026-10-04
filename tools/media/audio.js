// Offline audio for the trailer, rendered with the game's own synthesizer (src/audio.ts).
// renderEvents replays the tone()/noise() calls recorded during capture; renderScore
// arranges the in-game combat ostinato into a continuous music bed.
(() => {
  const RATE = 48000;
  const encode = (buffer) => {
    const data = buffer.getChannelData(0),
      out = new DataView(new ArrayBuffer(44 + data.length * 2));
    const text = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    text(0, "RIFF");
    out.setUint32(4, 36 + data.length * 2, true);
    text(8, "WAVEfmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 1, true);
    out.setUint32(24, RATE, true);
    out.setUint32(28, RATE * 2, true);
    out.setUint16(32, 2, true);
    out.setUint16(34, 16, true);
    text(36, "data");
    out.setUint32(40, data.length * 2, true);
    for (let i = 0; i < data.length; i++)
      out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
    return new Uint8Array(out.buffer);
  };

  async function synth(seconds) {
    const { Sound } = await import("/src/audio.ts");
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
    let now = 0;
    // Sound schedules everything at ctx.currentTime; steer that clock per event.
    const clock = new Proxy(ctx, {
      get(target, key) {
        if (key === "currentTime") return now;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const sound = new Sound();
    sound.ctx = clock;
    sound.gain = ctx.createGain();
    sound.gain.connect(ctx.destination);
    sound.effectsGain = ctx.createGain();
    sound.musicGain = ctx.createGain();
    sound.effectsGain.connect(sound.gain);
    sound.musicGain.connect(sound.gain);
    sound.setVolume(1);
    sound.setChannels(1, 1);
    return {
      ctx,
      sound,
      at(t, fn) {
        now = t;
        fn(sound);
      },
    };
  }

  async function renderEvents({ seconds, events }, file) {
    const s = await synth(seconds + 1.5);
    for (const e of events) {
      const music = e.m === "tone" ? e.a[5] === true : e.a[3] === true;
      if (!music && e.t >= 0) s.at(e.t, (sound) => sound[e.m](...e.a));
    }
    window.__capture.write(file, encode(await s.ctx.startRendering()));
  }

  // The in-game combat ostinato (src/audio.ts Sound.update), plus trailer layers.
  const NOTES = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];
  async function renderScore(plan, file) {
    const s = await synth(plan.seconds + 3);
    const step = 0.185;
    const tone = (t, ...a) => s.at(t, (x) => x.tone(...a));
    const noise = (t, ...a) => s.at(t, (x) => x.noise(...a));
    function groove(from, to, { gain = 1, double = false, lift = false, hats = false } = {}) {
      const len = double ? step / 2 : step;
      for (let i = 0, t = from; t < to - 0.02; i++, t = from + i * len) {
        const n = NOTES[i % 8] * (lift && i % 16 >= 8 ? 2 : 1);
        tone(t, n, 0.16, "sawtooth", 0.045 * gain, n * 0.98, true);
        if (i % 4 === 0) tone(t, 135, 0.12, "sine", 0.17 * gain, 35, true);
        if (i % 4 === 2) noise(t, 0.08, 0.065 * gain, 6500, true);
        if (hats && i % 2 === 1) noise(t, 0.04, 0.03 * gain, 9000, true);
        if (lift && i % 8 === 0) tone(t, n * 4, 0.5, "triangle", 0.035 * gain, n * 3.96, true);
      }
    }
    function hit(t, big = 1) {
      tone(t, 44, 2.6 * big, "sine", 0.6, 26, true);
      tone(t, 88, 1.4 * big, "sawtooth", 0.09, 40, true);
      noise(t, 1.1 * big, 0.32, 1400, true);
      noise(t, 0.25, 0.25, 7000, true);
    }
    function drone(from, to, gain = 1) {
      for (let t = from; t < to - 0.5; t += 1.48) {
        tone(t, 55, 1.6, "triangle", 0.11 * gain, 54.5, true);
        tone(t + 0.74, 82.4, 1.6, "triangle", 0.05 * gain, 82, true);
      }
    }
    function riser(from, to) {
      const n = Math.floor((to - from) / 0.0925);
      for (let i = 0; i < n; i++) {
        const u = i / n;
        noise(from + i * 0.0925, 0.07, 0.02 + u * 0.12, 1500 + u * 9000, true);
      }
      tone(from, 110, to - from, "sawtooth", 0.05, 880, true);
    }
    for (const section of plan.sections) {
      const { kind, from, to } = section;
      if (kind === "groove") groove(from, to, section);
      if (kind === "drone") drone(from, to, section.gain);
      if (kind === "riser") riser(from, to);
      if (kind === "hit") hit(from, section.big);
    }
    window.__capture.write(file, encode(await s.ctx.startRendering()));
  }

  window.__audio = { renderEvents, renderScore };
})();

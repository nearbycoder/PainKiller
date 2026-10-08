// Offline audio for the trailer, rendered with the game's own synthesizer (src/audio.ts).
// renderEvents replays the tone()/noise() calls recorded during capture, in stereo with the
// game's own panning; renderScore plays the chapter themes of src/music.ts, layer by layer,
// as the music bed, with a few stingers (hits, a riser) made from the same voices.
(() => {
  const RATE = 48000;
  const CHANNELS = 2;
  const encode = (buffer) => {
    const left = buffer.getChannelData(0),
      right = buffer.getChannelData(CHANNELS - 1),
      frames = left.length,
      bytes = frames * CHANNELS * 2,
      out = new DataView(new ArrayBuffer(44 + bytes));
    const text = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    text(0, "RIFF");
    out.setUint32(4, 36 + bytes, true);
    text(8, "WAVEfmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, CHANNELS, true);
    out.setUint32(24, RATE, true);
    out.setUint32(28, RATE * CHANNELS * 2, true);
    out.setUint16(32, CHANNELS * 2, true);
    out.setUint16(34, 16, true);
    text(36, "data");
    out.setUint32(40, bytes, true);
    const pcm = (x) => Math.max(-1, Math.min(1, x)) * 0x7fff;
    for (let i = 0; i < frames; i++) {
      out.setInt16(44 + i * 4, pcm(left[i]), true);
      out.setInt16(46 + i * 4, pcm(right[i]), true);
    }
    return new Uint8Array(out.buffer);
  };

  async function synth(seconds) {
    const { Sound } = await import("/src/audio.ts");
    const ctx = new OfflineAudioContext(CHANNELS, Math.ceil(seconds * RATE), RATE);
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

  async function renderScore(plan, file) {
    const { themeFor, notesFor } = await import("/src/music.ts");
    const s = await synth(plan.seconds + 3);
    const tone = (t, ...a) => s.at(t, (x) => x.tone(...a));
    const noise = (t, ...a) => s.at(t, (x) => x.noise(...a));
    /** A chapter theme's layer ("calm", "fight" or "general"), voiced as Sound.update does. */
    function theme(from, to, { chapter = 1, layer = "fight", gain = 1 } = {}) {
      const th = themeFor(chapter);
      for (let step = 0, t = from; t < to - 0.02; step++, t = from + step * th.step)
        for (const n of notesFor(th, step, layer, t)) {
          if (n.kind === "hat") noise(t, n.duration, n.volume * gain, n.cutoff, true);
          else tone(t, n.freq, n.duration, n.type, n.volume * gain, n.end, true, 0, 0, n.kind === "drone" ? 0.3 : 0);
        }
    }
    function hit(t, big = 1) {
      tone(t, 44, 2.6 * big, "sine", 0.6, 26, true);
      tone(t, 88, 1.4 * big, "sawtooth", 0.09, 40, true);
      noise(t, 1.1 * big, 0.32, 1400, true);
      noise(t, 0.25, 0.25, 7000, true);
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
      if (kind === "theme") theme(from, to, section);
      if (kind === "riser") riser(from, to);
      if (kind === "hit") hit(from, section.big);
    }
    window.__capture.write(file, encode(await s.ctx.startRendering()));
  }

  window.__audio = { renderEvents, renderScore };
})();

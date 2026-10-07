// R7-2: render the low-health heartbeat offline with the game's synthesizer, measure it
// against the sounds it plays among, and build a short listening clip for a person.
//   npm run test:browser -- --checks tools/media/round7/heartbeat.js --out artifacts/r7/heartbeat.json
// The JSON holds the levels and the clip as a base64 WAV (48 kHz mono).
(async () => {
  const { Sound } = await import("/src/audio.ts");
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
    }, sound);
    return (await ctx.startRendering()).getChannelData(0);
  }
  const db = (x) => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  // Peak, and the loudest 50 ms window (RMS), which is closer to how loud a beat seems.
  function levels(data) {
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    const w = Math.round(0.05 * RATE);
    let sum = 0,
      best = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
      if (i >= w) sum -= data[i - w] * data[i - w];
      best = Math.max(best, sum);
    }
    return { peak: db(peak), rms50: db(Math.sqrt(best / w)) };
  }
  const one = async (fn) => levels(await render(1.5, (at) => at(0.05, fn)));
  const sounds = {
    "heartbeat, 25 health": (s) => s.heartbeat(0.4),
    "heartbeat, near death": (s) => s.heartbeat(1),
    "footstep, stone": (s) => s.footstep(false),
    "hit marker": (s) => s.hit(),
    "taking a hit": (s) => s.tone(65, 0.2, "sawtooth", 0.17, 25),
    "melee wind-up (brute), 6 m": (s) => s.cue("windup-heavy", 0, 0.8),
    "shotgun blast": (s) => s.shot(1),
    rocket: (s) => s.shot(3),
  };
  const table = {};
  for (const [name, fn] of Object.entries(sounds)) table[name] = await one(fn);
  const music = (at, from, to) => {
    for (let t = from; t < to - 0.12; t += 0.05)
      at(t, (s) => s.update("fight", 1));
  };
  table["combat music (one bar)"] = levels(
    await render(2, (at) => music(at, 0.05, 1.53)),
  );
  // A listening clip, 14 s: walking to the music at full health, then taking hits down to
  // 22 health (heartbeat about 67 a minute) with shotgun fire, then down to 6 (about 100
  // a minute), then a health pickup ends it; last, four beats with no music.
  const clip = await render(14.5, (at) => {
    music(at, 0, 10.5);
    for (let t = 0.2; t < 2.4; t += 0.42) at(t, (s) => s.footstep(false));
    at(2.4, (s) => s.tone(65, 0.2, "sawtooth", 0.17, 25));
    for (let t = 2.6; t < 6; t += 0.84) at(t, (s) => s.heartbeat(0.52));
    for (const t of [3.3, 4.4]) at(t, (s) => s.shot(1));
    at(6, (s) => s.tone(65, 0.2, "sawtooth", 0.17, 25));
    for (let t = 6.2; t < 9.2; t += 0.63) at(t, (s) => s.heartbeat(0.86));
    at(9.3, (s) => s.pickup());
    for (let t = 11; t < 14.3; t += 0.84) at(t, (s) => s.heartbeat(0.52));
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
  let binary = "";
  const bytes = new Uint8Array(pcm.buffer);
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { table, wav: btoa(binary) };
})();

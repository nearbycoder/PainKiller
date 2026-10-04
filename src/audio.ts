export class Sound {
  ctx?: AudioContext;
  gain?: GainNode;
  volume = 0.45;
  effectsVolume = 1;
  musicVolume = 0.65;
  effectsGain?: GainNode;
  musicGain?: GainNode;
  music = true;
  nextBeat = 0;
  beat = 0;
  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.ctx.destination);
      this.effectsGain = this.ctx.createGain();
      this.effectsGain.connect(this.gain);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.gain);
      this.setChannels(this.effectsVolume, this.musicVolume);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }
  tone(
    freq: number,
    duration: number,
    type: OscillatorType = "sawtooth",
    volume = 0.1,
    end = 40,
    music = false,
  ) {
    if (!this.ctx || !this.gain) return;
    const t = this.ctx.currentTime,
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect((music ? this.musicGain : this.effectsGain)!);
    o.start(t);
    o.stop(t + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  noise(duration = 0.15, volume = 0.2, cutoff = 6500, music = false) {
    if (!this.ctx || !this.gain) return;
    const c = this.ctx,
      t = c.currentTime,
      b = c.createBuffer(1, c.sampleRate * duration, c.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    g.gain.value = volume;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    s.connect(filter);
    filter.connect(g);
    g.connect((music ? this.musicGain : this.effectsGain)!);
    s.start(t);
    s.onended = () => {
      s.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }
  shot(id: number, alt = false) {
    if (id === 0) {
      this.tone(alt ? 260 : 110, 0.14, "sawtooth", 0.1, 40);
      return;
    }
    if (id === 4 || (id === 1 && alt)) {
      this.tone(alt ? 760 : 1100, 0.16, "sawtooth", 0.055, alt ? 180 : 400);
      this.noise(0.09, 0.1, 7500);
      this.tone(alt ? 120 : 340, 0.18, "sine", 0.09, 60);
      return;
    }
    if (id === 1) {
      this.noise(0.23, 0.48, 5200);
      this.noise(0.4, 0.09, 900);
      this.tone(95, 0.23, "triangle", 0.3, 26);
      this.tone(1600, 0.035, "square", 0.028, 580);
    } else if (id === 2) {
      this.noise(0.09, 0.24, 2400);
      this.tone(180, 0.12, "triangle", 0.25, 45);
      this.tone(680, 0.07, "sine", 0.045, 210);
    } else if (alt) {
      this.noise(0.075, 0.28, 5800);
      this.tone(140, 0.07, "triangle", 0.18, 45);
    } else {
      this.noise(0.38, 0.32, 2300);
      this.noise(0.12, 0.16, 6800);
      this.tone(85, 0.34, "triangle", 0.38, 22);
    }
  }
  hit() {
    this.tone(170, 0.06, "triangle", 0.08, 70);
  }
  footstep(soft: boolean) {
    this.noise(soft ? 0.1 : 0.055, soft ? 0.045 : 0.035, soft ? 1600 : 3100);
    this.tone(90 + Math.random() * 18, 0.065, "triangle", 0.065, 35);
  }
  mechanism(id: number, draw = false) {
    this.noise(
      draw ? 0.1 : 0.075,
      draw ? 0.035 : 0.055,
      id === 1 ? 2200 : 3400,
    );
    this.tone(draw ? 290 : 440, 0.045, "triangle", 0.035, 115);
  }
  pickup() {
    this.tone(540, 0.18, "sine", 0.13, 1100);
  }
  update(active: boolean) {
    if (!this.ctx || !this.music || !active) return;
    const t = this.ctx.currentTime;
    if (t < this.nextBeat) return;
    this.nextBeat = t + 0.185;
    const notes = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];
    this.tone(
      notes[this.beat % 8],
      0.16,
      "sawtooth",
      0.045,
      notes[this.beat % 8] * 0.98,
      true,
    );
    if (this.beat % 4 === 0) this.tone(135, 0.12, "sine", 0.17, 35, true);
    if (this.beat % 4 === 2) this.noise(0.08, 0.065, 6500, true);
    this.beat++;
  }
  menu(confirm = false) {
    this.start();
    this.tone(
      confirm ? 240 : 360,
      confirm ? 0.12 : 0.04,
      "sine",
      confirm ? 0.08 : 0.035,
      confirm ? 80 : 280,
    );
  }
  setChannels(effects: number, music: number) {
    this.effectsVolume = effects;
    this.musicVolume = music;
    if (this.effectsGain) this.effectsGain.gain.value = effects;
    if (this.musicGain) this.musicGain.gain.value = music;
  }
  setVolume(n: number) {
    this.volume = n;
    if (this.gain) this.gain.gain.value = n;
  }
}

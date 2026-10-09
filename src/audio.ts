import { generator } from "./random";
import {
  Sequencer,
  notesFor,
  themeFor,
  type MusicLayer,
  type Theme,
} from "./music";
export type EnemyCue =
  | "spawn"
  | "windup"
  | "windup-hound"
  | "windup-heavy"
  | "cast"
  | "death"
  | "shatter"
  | "roar"
  | "shockwave"
  | "kill";
/** Rate limits enemy cues: a global cap per window, plus a minimum spacing per cue. */
export class CueBudget {
  private starts: number[] = [];
  private last = new Map<string, number>();
  constructor(
    readonly window = 0.25,
    readonly limit = 6,
    readonly spacing: Partial<Record<EnemyCue, number>> = {
      spawn: 0.15,
      death: 0.05,
      kill: 0.04,
      cast: 0.08,
    },
  ) {}
  allow(name: EnemyCue, now: number) {
    // Bosses and their shockwaves are always heard.
    const essential = name === "roar" || name === "shockwave";
    if (now - (this.last.get(name) ?? -Infinity) < (this.spacing[name] ?? 0))
      return false;
    this.starts = this.starts.filter((t) => now - t < this.window);
    if (!essential && this.starts.length >= this.limit) return false;
    this.starts.push(now);
    this.last.set(name, now);
    return true;
  }
}
export class Sound {
  ctx?: AudioContext;
  gain?: GainNode;
  volume = 0.45;
  effectsVolume = 1;
  musicVolume = 0.65;
  effectsGain?: GainNode;
  musicGain?: GainNode;
  music = true;
  /** Schedules the combat music on the audio clock (see src/music.ts). */
  sequencer = new Sequencer();
  theme?: Theme;
  cues = new CueBudget();
  /**
   * Sound's own noise source. Sounds play on the audio clock and a wall-clock budget, so
   * drawing from the game's sequence made seeded runs differ from one session to the next.
   */
  private random = generator(0x2f6b9d1);
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
    // Refused outside a touch or click, or with no audio device; the next input retries.
    if (this.ctx.state !== "running")
      Promise.resolve(this.ctx.resume()).catch(() => {});
  }
  tone(
    freq: number,
    duration: number,
    type: OscillatorType = "sawtooth",
    volume = 0.1,
    end = 40,
    music = false,
    pan = 0,
    at = 0,
    attack = 0,
  ) {
    if (!this.ctx || !this.gain) return;
    const t = Math.max(at, this.ctx.currentTime),
      o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    if (attack > 0) {
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + attack);
    } else g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    const panner = this.route(g, music, pan);
    o.start(t);
    o.stop(t + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      panner?.disconnect();
    };
  }
  noise(
    duration = 0.15,
    volume = 0.2,
    cutoff = 6500,
    music = false,
    pan = 0,
    at = 0,
  ) {
    if (!this.ctx || !this.gain) return;
    const c = this.ctx,
      t = Math.max(at, c.currentTime),
      b = c.createBuffer(1, c.sampleRate * duration, c.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (this.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    g.gain.value = volume;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    s.connect(filter);
    filter.connect(g);
    const panner = this.route(g, music, pan);
    s.start(t);
    s.onended = () => {
      s.disconnect();
      filter.disconnect();
      g.disconnect();
      panner?.disconnect();
    };
  }
  /** Connect a voice to its channel, through a stereo panner when it has a bearing. */
  private route(voice: GainNode, music: boolean, pan: number) {
    const channel = (music ? this.musicGain : this.effectsGain)!;
    if (!pan || !this.ctx!.createStereoPanner) {
      voice.connect(channel);
      return undefined;
    }
    const panner = this.ctx!.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    voice.connect(panner);
    panner.connect(channel);
    return panner;
  }
  /**
   * Enemy telegraphs and reactions. `pan` and `gain` come from spatialCue();
   * a shared budget keeps a crowd from stacking dozens of voices.
   */
  cue(name: EnemyCue, pan = 0, gain = 1) {
    if (
      !this.ctx ||
      gain <= 0 ||
      !this.cues.allow(name, performance.now() / 1000)
    )
      return;
    const v = (n: number) => n * gain,
      p = pan;
    switch (name) {
      case "spawn":
        this.noise(0.32, v(0.06), 900, false, p);
        this.tone(62, 0.34, "sine", v(0.08), 118, false, p);
        break;
      case "windup":
        this.tone(150, 0.26, "sawtooth", v(0.12), 78, false, p);
        this.noise(0.2, v(0.08), 1300, false, p);
        break;
      case "windup-hound":
        this.tone(300, 0.16, "square", v(0.07), 150, false, p);
        this.noise(0.12, v(0.09), 2600, false, p);
        break;
      case "windup-heavy":
        this.tone(78, 0.42, "sawtooth", v(0.17), 36, false, p);
        this.noise(0.36, v(0.12), 700, false, p);
        break;
      case "cast":
        this.tone(210, 0.3, "sine", v(0.09), 560, false, p);
        this.noise(0.26, v(0.06), 3200, false, p);
        break;
      case "death":
        this.noise(0.17, v(0.11), 1500, false, p);
        this.tone(165, 0.2, "triangle", v(0.1), 48, false, p);
        break;
      case "shatter":
        this.noise(0.22, v(0.13), 9500, false, p);
        this.tone(2300, 0.16, "triangle", v(0.05), 900, false, p);
        break;
      case "roar":
        this.tone(96, 1.1, "sawtooth", v(0.16), 42, false, p);
        this.tone(64, 1.2, "square", v(0.05), 30, false, p);
        this.noise(0.9, v(0.1), 620, false, p);
        break;
      case "shockwave":
        this.tone(54, 0.7, "sine", v(0.3), 24, false, p);
        this.noise(0.5, v(0.14), 420, false, p);
        break;
      case "kill":
        this.tone(980, 0.07, "sine", v(0.05), 1460);
        break;
    }
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
    this.tone(90 + this.random() * 18, 0.065, "triangle", 0.065, 35);
  }
  mechanism(id: number, draw = false) {
    this.noise(
      draw ? 0.1 : 0.075,
      draw ? 0.035 : 0.055,
      id === 1 ? 2200 : 3400,
    );
    this.tone(draw ? 290 : 440, 0.045, "triangle", 0.035, 115);
  }
  /** One low-health heartbeat, lub-dub; `strength` (0–1) deepens it. */
  heartbeat(strength = 1) {
    if (!this.ctx) return;
    const volume = 0.095 + 0.06 * strength,
      t = this.ctx.currentTime;
    this.tone(78, 0.12, "triangle", volume, 42, false, 0, 0, 0.01);
    this.noise(0.05, volume * 0.35, 220);
    this.tone(70, 0.15, "triangle", volume * 0.7, 38, false, 0, t + 0.2, 0.01);
  }
  /** The hammer falling on an empty chamber. */
  dry() {
    this.noise(0.03, 0.06, 5200);
    this.tone(1250, 0.025, "square", 0.025, 900);
  }
  pickup() {
    this.tone(540, 0.18, "sine", 0.13, 1100);
  }
  /**
   * Keep the combat music going: call every simulation step with the layer the fight calls
   * for (null for silence) and the chapter. Notes are placed a little ahead on the audio
   * clock, so the tempo does not depend on the frame rate.
   */
  update(layer: MusicLayer | null, chapter = 1) {
    if (!this.ctx || !this.music || !layer) {
      this.sequencer.reset();
      return;
    }
    const theme = themeFor(chapter);
    if (theme !== this.theme) {
      this.theme = theme;
      this.sequencer.reset();
    }
    for (const { time, step } of this.sequencer.due(
      this.ctx.currentTime,
      theme.step,
    ))
      for (const n of notesFor(theme, step, layer, time))
        if (n.kind === "hat")
          this.noise(n.duration, n.volume, n.cutoff, true, 0, n.time);
        else
          this.tone(
            n.freq,
            n.duration,
            n.type,
            n.volume,
            n.end,
            true,
            0,
            n.time,
            n.kind === "drone" ? 0.3 : 0,
          );
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

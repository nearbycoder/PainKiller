/**
 * The combat music: one theme per chapter, a four-bar phrase of eighth-note steps, played
 * in layers that follow the fight. Pure data and timing; `Sound` turns the notes into voices.
 */
export type MusicLayer = "calm" | "fight" | "general";

export interface Theme {
  name: string;
  /** Lowest note of the scale, in Hz; figures are semitones from it. */
  tonic: number;
  /** Seconds per step (eight steps a bar). */
  step: number;
  bass: OscillatorType;
  bassVolume: number;
  /** Four bars of eight steps: semitones from the tonic, or null for a rest. */
  bars: (number | null)[][];
  /** Each bar's root, for the drone (an octave above the bass). */
  roots: number[];
  kick: number[];
  hat: number[];
  hatCutoff: number;
  /** Level of the kick and hat, so a busier pattern is not louder. */
  drums: number;
}

export interface Note {
  kind: "bass" | "octave" | "drone" | "kick" | "tom" | "hat";
  /** Start, on the audio clock. */
  time: number;
  duration: number;
  volume: number;
  freq: number;
  end: number;
  type: OscillatorType;
  /** Low-pass cutoff for noise voices (the hat). */
  cutoff?: number;
}

/** Until round 6 every sector played this one bar: chapter I keeps it as its first bar. */
export const OLD_OSTINATO = [55, 55, 65.4, 55, 49, 55, 73.4, 65.4];

const _ = null;
export const THEMES: Theme[] = [
  {
    name: "Ashes of the Faithful",
    tonic: 55, // A minor
    step: 0.185,
    bass: "sawtooth",
    bassVolume: 0.045,
    bars: [
      [0, 0, 3, 0, -2, 0, 5, 3],
      [0, 0, 3, 0, -2, 0, 5, 3],
      [-4, -4, 0, -4, -5, -4, 3, 0],
      [-5, -5, -2, -5, 0, -5, 2, -1],
    ],
    roots: [0, 0, -4, -5],
    kick: [0, 4],
    hat: [2, 6],
    hatCutoff: 6500,
    drums: 1,
  },
  {
    name: "The Hollow City",
    tonic: 73.42, // D Phrygian, slower and sparser
    step: 0.205,
    bass: "triangle",
    bassVolume: 0.075,
    bars: [
      [0, _, 1, 0, _, -2, 0, _],
      [0, _, 1, 3, _, 1, 0, -2],
      [-4, _, -2, -4, _, -5, -4, _],
      [-5, _, -4, -5, _, -2, 1, _],
    ],
    roots: [0, 0, -4, -5],
    kick: [0, 5],
    hat: [3, 7],
    hatCutoff: 5200,
    drums: 1,
  },
  {
    name: "Engines of Damnation",
    tonic: 82.41, // E minor, driving octaves
    step: 0.16,
    bass: "sawtooth",
    bassVolume: 0.038,
    bars: [
      [-12, 0, -12, 0, -12, 3, -12, 0],
      [-12, 0, -12, 0, -12, 5, -12, 3],
      [-4, 8, -4, 8, -4, 7, -4, 3],
      [-2, 10, -2, 10, -2, 7, 5, 3],
    ],
    roots: [-12, -12, -4, -2],
    kick: [0, 2, 4, 6],
    hat: [1, 3, 5, 7],
    hatCutoff: 9000,
    drums: 0.72,
  },
  {
    name: "Kingdom of Dust",
    tonic: 65.41, // C harmonic minor, in threes
    step: 0.19,
    bass: "square",
    bassVolume: 0.028,
    bars: [
      [0, _, 0, 3, 2, 0, -1, 0],
      [0, _, 0, 3, 5, 3, 2, -1],
      [-4, _, -4, 0, -1, -4, -5, -4],
      [-5, _, -5, -1, 2, -1, -5, -1],
    ],
    roots: [0, 0, -4, -5],
    kick: [0, 3, 6],
    hat: [2, 4, 7],
    hatCutoff: 6000,
    drums: 1,
  },
  {
    name: "The Last Descent",
    tonic: 61.74, // B Locrian, the tritone below everything
    step: 0.175,
    bass: "sawtooth",
    bassVolume: 0.045,
    bars: [
      [0, 0, 1, 0, 6, 0, 5, 1],
      [0, 0, 1, 0, 6, 5, 3, 1],
      [-4, -4, -3, -4, 2, -4, 1, -3],
      [-6, -6, -5, -6, 0, 1, -2, -1],
    ],
    roots: [0, 0, -4, -6],
    kick: [0, 4, 7],
    hat: [2, 6],
    hatCutoff: 4800,
    drums: 1,
  },
];

/** Chapters are numbered from 1. */
export function themeFor(chapter: number) {
  return THEMES[Math.min(THEMES.length, Math.max(1, chapter | 0)) - 1];
}

export const hz = (theme: Theme, semitones: number) =>
  theme.tonic * 2 ** (semitones / 12);

/** Which layer plays: none once the sector is clear. */
export function layerFor(state: {
  cleared: boolean;
  general: boolean;
  enemies: number;
  remaining: number;
}): MusicLayer | null {
  if (state.cleared) return null;
  if (state.general) return "general";
  return state.enemies > 0 || state.remaining > 0 ? "fight" : "calm";
}

/** The voices for one step of the phrase, starting at `time`. */
export function notesFor(
  theme: Theme,
  step: number,
  layer: MusicLayer,
  time: number,
): Note[] {
  const bar = Math.floor(step / 8) % theme.bars.length,
    i = step % 8,
    semis = theme.bars[bar][i],
    out: Note[] = [];
  const voice = (
    kind: Note["kind"],
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    end = freq * 0.98,
  ) => out.push({ kind, time, duration, volume, freq, end, type });
  if (i === 0) {
    const f = hz(theme, theme.roots[bar] + 12);
    voice(
      "drone",
      f,
      theme.step * 8,
      layer === "calm" ? 0.03 : 0.022,
      "sine",
      f,
    );
  }
  const bassStep = layer !== "calm" || i === 0 || i === 4;
  if (semis !== null && bassStep) {
    const f = hz(theme, semis);
    voice(
      "bass",
      f,
      theme.step * 0.86,
      theme.bassVolume * (layer === "calm" ? 0.7 : 1),
      theme.bass,
    );
    if (layer === "general" && i % 2 === 1)
      voice("octave", f * 2, theme.step * 0.7, 0.01, "square");
  }
  if (layer === "calm") return out;
  // A general adds quieter kicks between the theme's own, so the music does not grow
  // louder over the general's roar and shockwave cues.
  if (theme.kick.includes(i))
    voice("kick", 135, 0.12, 0.17 * theme.drums, "sine", 35);
  else if (layer === "general" && i % 2 === 0)
    voice("kick", 135, 0.12, 0.07 * theme.drums, "sine", 35);
  if (theme.hat.includes(i))
    out.push({
      kind: "hat",
      time,
      duration: 0.08,
      volume: 0.065 * theme.drums,
      freq: 0,
      end: 0,
      type: "sine",
      cutoff: theme.hatCutoff,
    });
  // A two-tom fill at the end of the phrase, between the theme's kicks.
  if (layer === "general" && bar === theme.bars.length - 1) {
    const fill = [7, 6, 5, 4]
      .filter((s) => !theme.kick.includes(s))
      .slice(0, 2);
    if (fill.includes(i))
      voice("tom", i === fill[1] ? 120 : 96, 0.22, 0.07, "sine", 48);
  }
  return out;
}

/**
 * Look-ahead scheduling: each poll returns the steps that start before `now + ahead`, at
 * exact multiples of the step from where the music started, whenever the poll happens.
 * Steps missed by more than `late` (a stall, a pause) are skipped rather than played late
 * or all at once, so the music stays on its beat.
 */
export class Sequencer {
  step = 0;
  private origin = -1;
  private count = 0;
  private length = 0;
  constructor(
    readonly ahead = 0.15,
    readonly late = 0.03,
  ) {}
  reset() {
    this.origin = -1;
    this.step = 0;
  }
  due(now: number, length: number) {
    if (this.origin < 0 || length !== this.length) {
      this.origin = now + 0.02;
      this.count = 0;
      this.length = length;
    }
    const missed = Math.ceil((now - this.late - this.next()) / length);
    if (missed > 0) {
      this.count += missed;
      this.step += missed;
    }
    const out: { time: number; step: number }[] = [];
    while (this.next() < now + this.ahead) {
      out.push({ time: this.next(), step: this.step++ });
      this.count++;
    }
    return out;
  }
  private next() {
    return this.origin + this.count * this.length;
  }
}

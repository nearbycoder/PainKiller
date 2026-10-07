import { describe, it, expect } from "vitest";
import {
  OLD_OSTINATO,
  Sequencer,
  THEMES,
  hz,
  layerFor,
  notesFor,
  themeFor,
} from "../src/music";
import { CHAPTERS } from "../src/data";

const bassAt = (chapter: number, step: number) =>
  notesFor(themeFor(chapter), step, "fight", 0).find((n) => n.kind === "bass");

describe("chapter themes", () => {
  it("gives every chapter its own theme", () => {
    expect(THEMES.map((t) => t.name)).toEqual(CHAPTERS);
    CHAPTERS.forEach((_, i) => expect(themeFor(i + 1)).toBe(THEMES[i]));
    expect(new Set(THEMES.map((t) => t.step)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.tonic)).size).toBe(THEMES.length);
    expect(themeFor(0)).toBe(THEMES[0]);
    expect(themeFor(9)).toBe(THEMES[4]);
  });
  it("keeps the old ostinato as chapter I's first bar", () => {
    const theme = themeFor(1);
    expect(theme.step).toBe(0.185);
    OLD_OSTINATO.forEach((f, i) =>
      expect(bassAt(1, i)!.freq).toBeCloseTo(f, 1),
    );
    const kicks = Array.from({ length: 8 }, (_, i) =>
      notesFor(theme, i, "fight", 0).some((n) => n.kind === "kick"),
    );
    const hats = Array.from({ length: 8 }, (_, i) =>
      notesFor(theme, i, "fight", 0).some((n) => n.kind === "hat"),
    );
    // The old loop: a kick on beats 0 and 4, the hat on 2 and 6.
    expect(kicks).toEqual([
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(hats).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
    ]);
  });
  it("is a phrase of four bars, not one repeated bar", () => {
    for (const theme of THEMES) {
      expect(theme.bars).toHaveLength(4);
      expect(theme.roots).toHaveLength(4);
      for (const bar of theme.bars) expect(bar).toHaveLength(8);
      const distinct = new Set(theme.bars.map((b) => JSON.stringify(b)));
      expect(distinct.size).toBeGreaterThanOrEqual(3);
      // The phrase repeats after 32 steps.
      for (let s = 0; s < 32; s++)
        expect(notesFor(theme, s + 32, "fight", 0)).toEqual(
          notesFor(theme, s, "fight", 0),
        );
    }
  });
  it("keeps the bass in the bass and the drone above it", () => {
    for (const theme of THEMES) {
      for (const bar of theme.bars)
        for (const s of bar)
          if (s !== null) {
            expect(hz(theme, s)).toBeGreaterThanOrEqual(40);
            expect(hz(theme, s)).toBeLessThanOrEqual(160);
          }
      for (const r of theme.roots) {
        expect(hz(theme, r + 12)).toBeGreaterThanOrEqual(80);
        expect(hz(theme, r + 12)).toBeLessThanOrEqual(200);
      }
    }
  });
});

describe("layers", () => {
  const state = {
    cleared: false,
    general: false,
    enemies: 0,
    remaining: 0,
  };
  it("follows the fight", () => {
    expect(layerFor(state)).toBe("calm");
    expect(layerFor({ ...state, remaining: 6 })).toBe("fight");
    expect(layerFor({ ...state, enemies: 1 })).toBe("fight");
    expect(layerFor({ ...state, enemies: 3, general: true })).toBe("general");
    expect(layerFor({ ...state, cleared: true, enemies: 2 })).toBeNull();
  });
  it("is sparse while a wave is coming and heavier for a general", () => {
    for (const theme of THEMES) {
      const bar = (layer: "calm" | "fight" | "general") =>
        Array.from({ length: 32 }, (_, s) =>
          notesFor(theme, s, layer, 0),
        ).flat();
      const calm = bar("calm"),
        fight = bar("fight"),
        general = bar("general");
      expect(calm.some((n) => n.kind === "kick" || n.kind === "hat")).toBe(
        false,
      );
      expect(calm.filter((n) => n.kind === "bass").length).toBeLessThan(
        fight.filter((n) => n.kind === "bass").length,
      );
      expect(calm.filter((n) => n.kind === "drone")).toHaveLength(4);
      expect(general.length).toBeGreaterThan(fight.length);
      expect(general.some((n) => n.kind === "tom")).toBe(true);
      expect(fight.some((n) => n.kind === "tom" || n.kind === "octave")).toBe(
        false,
      );
    }
  });
});

describe("the scheduler", () => {
  const poll = (seq: Sequencer, times: number[], length = 0.185) =>
    times.flatMap((t) => seq.due(t, length));
  it("places steps on exact multiples whatever the polling times", () => {
    const even = poll(
      new Sequencer(),
      Array.from({ length: 300 }, (_, i) => 10 + i / 60),
    );
    let t = 10,
      ragged: number[] = [];
    while (t < 15) {
      ragged.push(t);
      t += [1 / 144, 1 / 60, 1 / 30, 0.1, 0.05][ragged.length % 5];
    }
    const uneven = poll(new Sequencer(), ragged);
    for (const run of [even, uneven]) {
      run.forEach((s, i) => {
        expect(s.step).toBe(i);
        expect(s.time).toBeCloseTo(run[0].time + i * 0.185, 9);
      });
    }
    expect(uneven.length).toBeGreaterThan(25);
  });
  it("schedules a little ahead and never in the past", () => {
    const seq = new Sequencer(0.12);
    for (let t = 0; t < 4; t += 0.04) {
      for (const s of seq.due(t, 0.2)) {
        expect(s.time).toBeGreaterThanOrEqual(t - 1e-9);
        expect(s.time).toBeLessThan(t + 0.12);
      }
    }
  });
  it("skips what a stall or a pause missed and stays on the beat", () => {
    const seq = new Sequencer();
    const first = poll(seq, [0, 0.05, 0.1, 0.15]);
    const origin = first[0].time;
    for (const now of [0.9, 1.6, 30]) {
      const after = seq.due(now, 0.185);
      expect(after.length).toBeLessThanOrEqual(1);
      for (const s of after) {
        expect(s.time).toBeGreaterThanOrEqual(now - seq.late);
        const beats = (s.time - origin) / 0.185;
        expect(beats).toBeCloseTo(Math.round(beats), 6);
        // The phrase position follows the clock.
        expect(s.step).toBe(Math.round(beats));
      }
    }
  });
  it("starts from the top after a reset or a new tempo", () => {
    const seq = new Sequencer();
    poll(seq, [0, 0.1, 0.2, 0.3]);
    seq.reset();
    expect(seq.due(1, 0.185)[0].step).toBe(0);
    const before = seq.due(1.1, 0.185).length;
    expect(before).toBeGreaterThanOrEqual(0);
    const changed = seq.due(1.15, 0.2);
    expect(changed[0].time).toBeCloseTo(1.17, 9);
  });
});

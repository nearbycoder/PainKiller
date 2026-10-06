import { describe, expect, it } from "vitest";
import { spatialCue } from "../src/core";
import { CueBudget, Sound } from "../src/audio";

describe("spatial enemy cues", () => {
  it("pans by bearing relative to where the player looks", () => {
    // Facing -Z (yaw 0): +X is to the right.
    expect(spatialCue(0, 0, 0, 10, 0).pan).toBeGreaterThan(0.5);
    expect(spatialCue(0, 0, 0, -10, 0).pan).toBeLessThan(-0.5);
    const ahead = spatialCue(0, 0, 0, 0, -10);
    expect(Math.abs(ahead.pan)).toBeLessThan(0.01);
    expect(ahead.behind).toBe(false);
    // Turning a quarter left (yaw +π/2 faces -X) puts -Z on the right.
    expect(spatialCue(0, 0, Math.PI / 2, 0, -10).pan).toBeGreaterThan(0.5);
  });
  it("marks sources behind and softens them slightly", () => {
    const behind = spatialCue(0, 0, 0, 0, 6),
      front = spatialCue(0, 0, 0, 0, -6);
    expect(behind.behind).toBe(true);
    expect(behind.gain).toBeLessThan(front.gain);
  });
  it("attenuates with distance and goes silent beyond range", () => {
    const near = spatialCue(0, 0, 0, 0, -2).gain,
      mid = spatialCue(0, 0, 0, 0, -20).gain,
      far = spatialCue(0, 0, 0, 0, -45).gain;
    expect(near).toBe(1);
    expect(mid).toBeLessThan(near);
    expect(far).toBeLessThan(mid);
    expect(far).toBeGreaterThan(0);
    expect(spatialCue(0, 0, 0, 0, -60).gain).toBe(0);
  });
});

describe("enemy cue budget", () => {
  it("caps voices per window but always lets bosses through", () => {
    const budget = new CueBudget(0.25, 6, {});
    let allowed = 0;
    for (let i = 0; i < 20; i++)
      if (budget.allow("windup", 1 + i * 0.001)) allowed++;
    expect(allowed).toBe(6);
    expect(budget.allow("roar", 1.03)).toBe(true);
    expect(budget.allow("windup", 1.4)).toBe(true);
  });
  it("spaces repeated cues of the same kind", () => {
    const budget = new CueBudget(0.25, 50, { spawn: 0.15 });
    expect(budget.allow("spawn", 0)).toBe(true);
    expect(budget.allow("spawn", 0.1)).toBe(false);
    expect(budget.allow("spawn", 0.2)).toBe(true);
  });
  it("routes cues through tone and noise with the bearing as pan", () => {
    const sound = new Sound(),
      calls: { m: string; pan: unknown }[] = [];
    sound.ctx = {} as AudioContext;
    sound.tone = (...a: unknown[]) => void calls.push({ m: "tone", pan: a[6] });
    sound.noise = (...a: unknown[]) =>
      void calls.push({ m: "noise", pan: a[4] });
    sound.cue("cast", -0.7, 0.5);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.pan === -0.7)).toBe(true);
    calls.length = 0;
    sound.cue("death", 0.4, 0);
    expect(calls).toHaveLength(0);
  });
});

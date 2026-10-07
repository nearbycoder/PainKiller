import { describe, expect, it } from "vitest";
import { FrameStats } from "../src/frame-stats";
import { defaults, parseSettings } from "../src/settings";

describe("the frame-rate readout", () => {
  it("reports frames per second and the slowest frame once a second has passed", () => {
    const stats = new FrameStats();
    for (let i = 0; i < 143; i++) stats.add(1000 / 144);
    expect(stats.label()).toBe("");
    stats.add(1000 / 144);
    expect(Math.round(stats.fps)).toBe(144);
    expect(stats.worst).toBeCloseTo(6.94, 2);
    expect(stats.label()).toBe("144 FPS · WORST 6.9 MS");
  });
  it("catches one slow frame in a second", () => {
    const stats = new FrameStats();
    for (let i = 0; i < 58; i++) stats.add(1000 / 60);
    stats.add(50);
    for (let i = 0; i < 5; i++) stats.add(1000 / 60);
    expect(stats.worst).toBe(50);
    // The slow frame closes the window: 59 frames in 1,017 ms.
    expect(Math.round(stats.fps)).toBe(58);
  });
  it("starts over after a long gap such as a hidden tab", () => {
    const stats = new FrameStats();
    for (let i = 0; i < 30; i++) stats.add(1000 / 60);
    stats.add(4000);
    for (let i = 0; i < 59; i++) stats.add(1000 / 60);
    expect(stats.fps).toBe(0);
    stats.add(1000 / 60);
    stats.add(1000 / 60);
    expect(Math.round(stats.fps)).toBe(60);
    expect(stats.worst).toBeCloseTo(16.7, 1);
  });
  it("is hidden by default, and the option saves", () => {
    expect(defaults.showFps).toBe(false);
    expect(parseSettings('{"showFps":true}').showFps).toBe(true);
    expect(parseSettings('{"showFps":"on"}').showFps).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { toggleSprint } from "../src/controls";
import { defaults, parseSettings } from "../src/settings";

describe("toggle sprint", () => {
  it("starts on a press and keeps running after the button is let go", () => {
    let running = toggleSprint(false, true, true);
    expect(running).toBe(true);
    running = toggleSprint(running, false, true);
    expect(running).toBe(true);
  });
  it("stops on the next press", () => {
    expect(toggleSprint(true, true, true)).toBe(false);
  });
  it("ends when you stop moving, and does not restart by itself", () => {
    let running = toggleSprint(true, false, false);
    expect(running).toBe(false);
    running = toggleSprint(running, false, true);
    expect(running).toBe(false);
  });
  it("does nothing when pressed standing still", () => {
    expect(toggleSprint(false, true, false)).toBe(false);
  });
});

describe("controller comfort options", () => {
  it("default to hold sprint and the standard stick layout", () => {
    expect(defaults.toggleSprint).toBe(false);
    expect(defaults.swapSticks).toBe(false);
    const parsed = parseSettings(null);
    expect(parsed.toggleSprint).toBe(false);
    expect(parsed.swapSticks).toBe(false);
  });
  it("save, and ignore values of the wrong type", () => {
    const on = parseSettings('{"toggleSprint":true,"swapSticks":true}');
    expect(on.toggleSprint).toBe(true);
    expect(on.swapSticks).toBe(true);
    const odd = parseSettings('{"toggleSprint":1,"swapSticks":"yes"}');
    expect(odd.toggleSprint).toBe(false);
    expect(odd.swapSticks).toBe(false);
  });
});

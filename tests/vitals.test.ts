import { describe, it, expect } from "vitest";
import { heartbeatInterval, lowHealth, LOW_HEALTH } from "../src/vitals";
import { defaults, parseSettings } from "../src/settings";

describe("the low-health warning", () => {
  it("starts at a quarter of full health", () => {
    expect(LOW_HEALTH).toBe(25);
    expect(lowHealth(100)).toBe(0);
    expect(lowHealth(25.01)).toBe(0);
    expect(lowHealth(25)).toBeCloseTo(0.4);
  });
  it("grows as health falls, and stops at death", () => {
    let last = 0;
    for (let h = 25; h > 0; h -= 0.5) {
      expect(lowHealth(h)).toBeGreaterThan(last);
      last = lowHealth(h);
    }
    expect(lowHealth(0.01)).toBeCloseTo(1, 2);
    expect(lowHealth(0)).toBe(0);
    expect(lowHealth(-3)).toBe(0);
  });
  it("quickens the heartbeat as health falls", () => {
    expect(heartbeatInterval(25)).toBeCloseTo(0.9);
    expect(heartbeatInterval(10)).toBeLessThan(heartbeatInterval(20));
    expect(heartbeatInterval(0)).toBeCloseTo(0.55);
    expect(heartbeatInterval(80)).toBeCloseTo(0.9);
  });
  it("is on by default, and the option saves", () => {
    expect(defaults.lowHealthWarning).toBe(true);
    expect(parseSettings("{}").lowHealthWarning).toBe(true);
    expect(parseSettings('{"lowHealthWarning":false}').lowHealthWarning).toBe(
      false,
    );
    expect(parseSettings('{"lowHealthWarning":"no"}').lowHealthWarning).toBe(
      true,
    );
  });
});

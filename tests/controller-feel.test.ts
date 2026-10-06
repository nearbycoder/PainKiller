import { describe, expect, it } from "vitest";
import { rumbleFor } from "../src/controls";
import { defaults, parseSettings } from "../src/settings";

describe("controller feel options", () => {
  it("defaults to today's stick speed with vibration on", () => {
    expect(defaults.stickSpeed).toBe(1);
    expect(defaults.vibration).toBe(true);
    expect(parseSettings("{}").stickSpeed).toBe(1);
  });
  it("keeps the old stick speed for players who changed mouse sensitivity", () => {
    // Before round 3 the stick turned at sensitivity / 0.002.
    expect(parseSettings('{"sensitivity":0.004}').stickSpeed).toBeCloseTo(2);
    expect(parseSettings('{"sensitivity":0.0005}').stickSpeed).toBe(0.25);
    // Once saved, stick speed no longer follows the mouse.
    const s = parseSettings('{"sensitivity":0.004,"stickSpeed":0.8}');
    expect(s.stickSpeed).toBe(0.8);
    expect(s.sensitivity).toBe(0.004);
  });
  it("clamps stick speed and validates vibration", () => {
    expect(parseSettings('{"stickSpeed":9}').stickSpeed).toBe(3);
    expect(parseSettings('{"stickSpeed":0}').stickSpeed).toBe(0.25);
    expect(parseSettings('{"vibration":false}').vibration).toBe(false);
    expect(parseSettings('{"vibration":"no"}').vibration).toBe(true);
  });
});

describe("controller rumble", () => {
  it("grows with the damage taken", () => {
    const light = rumbleFor("hurt", 9 / 40),
      heavy = rumbleFor("hurt", 25 / 40);
    expect(heavy.strong).toBeGreaterThan(light.strong);
    expect(heavy.duration).toBeGreaterThan(light.duration);
    expect(rumbleFor("hurt", 5).strong).toBeLessThanOrEqual(1);
  });
  it("fades explosions with distance and gives shockwaves the strongest jolt", () => {
    expect(rumbleFor("explosion", 0).strong).toBe(0);
    expect(rumbleFor("explosion", 1).strong).toBeGreaterThan(
      rumbleFor("explosion", 0.3).strong,
    );
    const shock = rumbleFor("shockwave");
    expect(shock.strong).toBe(1);
    expect(shock.duration).toBeGreaterThan(rumbleFor("hurt", 1).duration);
  });
  it("stays within the Gamepad API's 0–1 magnitudes", () => {
    for (const kind of ["hurt", "shockwave", "explosion", "wraith"] as const)
      for (const amount of [-1, 0, 0.5, 1, 3]) {
        const r = rumbleFor(kind, amount);
        for (const m of [r.strong, r.weak]) {
          expect(m).toBeGreaterThanOrEqual(0);
          expect(m).toBeLessThanOrEqual(1);
        }
        expect(r.duration).toBeGreaterThan(0);
      }
  });
});

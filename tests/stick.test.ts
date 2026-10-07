import { describe, expect, it } from "vitest";
import { LOOK_CURVES, stickAxis } from "../src/controls";
import { defaults, parseSettings } from "../src/settings";

describe("stick dead zone and look response", () => {
  it("defaults to the old 18% dead zone and a linear response", () => {
    expect(defaults.stickDeadzone).toBe(0.18);
    expect(defaults.lookCurve).toBe(0);
    expect(LOOK_CURVES[defaults.lookCurve]).toBe(1);
    // The old mapping, unchanged by default.
    for (const v of [-1, -0.6, -0.18, 0, 0.1, 0.18, 0.3, 0.59, 1])
      expect(stickAxis(v)).toBeCloseTo(
        Math.abs(v) <= 0.18 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.18)) / 0.82,
        12,
      );
  });
  it("ignores movement inside the dead zone and reaches full tilt at 1", () => {
    expect(stickAxis(0.2, 0.3)).toBe(0);
    expect(stickAxis(0.2, 0.05)).toBeGreaterThan(0);
    for (const zone of [0.05, 0.18, 0.3])
      for (const exponent of LOOK_CURVES) {
        expect(stickAxis(1, zone, exponent)).toBe(1);
        expect(stickAxis(-1, zone, exponent)).toBe(-1);
        expect(stickAxis(zone, zone, exponent)).toBe(0);
      }
  });
  it("makes precise slower near the centre, never faster, and keeps the sign", () => {
    for (let v = 0.2; v < 1; v += 0.05) {
      const linear = stickAxis(v, 0.18, LOOK_CURVES[0]),
        precise = stickAxis(v, 0.18, LOOK_CURVES[1]);
      expect(precise).toBeLessThan(linear);
      expect(precise).toBeGreaterThan(0);
      expect(stickAxis(-v, 0.18, LOOK_CURVES[1])).toBeCloseTo(-precise, 12);
    }
    // Halfway between the dead zone and full tilt: a quarter of the speed.
    expect(stickAxis(0.59, 0.18, LOOK_CURVES[1])).toBeCloseTo(0.25, 12);
    // Monotonic: more tilt never turns slower.
    let last = 0;
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const x = stickAxis(Math.min(1, v), 0.18, LOOK_CURVES[1]);
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });
  it("saves within limits", () => {
    const p = (o: object) => parseSettings(JSON.stringify(o));
    expect(p({ stickDeadzone: 0.25, lookCurve: 1 })).toMatchObject({
      stickDeadzone: 0.25,
      lookCurve: 1,
    });
    expect(p({ stickDeadzone: 0.9, lookCurve: 7 })).toMatchObject({
      stickDeadzone: 0.3,
      lookCurve: 1,
    });
    expect(p({ stickDeadzone: 0, lookCurve: -1 })).toMatchObject({
      stickDeadzone: 0.05,
      lookCurve: 0,
    });
    expect(p({ stickDeadzone: "x", lookCurve: true })).toMatchObject({
      stickDeadzone: 0.18,
      lookCurve: 0,
    });
  });
});

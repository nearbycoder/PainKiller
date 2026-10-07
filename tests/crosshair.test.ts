import { describe, it, expect } from "vitest";
import {
  CROSSHAIR_COLORS,
  CROSSHAIR_STYLES,
  defaults,
  parseSettings,
} from "../src/settings";

describe("crosshair options", () => {
  it("default to today's cross and dot, in bone white, at full size", () => {
    const s = parseSettings(null);
    expect(CROSSHAIR_STYLES[s.crosshairStyle]).toBe("Cross and dot");
    expect(CROSSHAIR_COLORS[s.crosshairColor]).toEqual(["Bone", "#edf2df"]);
    expect(s.crosshairSize).toBe(1);
    expect(s.crosshair).toBe(true);
  });
  it("keep saved choices and clamp them to what exists", () => {
    const s = (o: object) => parseSettings(JSON.stringify(o));
    expect(
      s({ crosshairStyle: 3, crosshairColor: 4, crosshairSize: 1.5 }),
    ).toMatchObject({
      crosshairStyle: 3,
      crosshairColor: 4,
      crosshairSize: 1.5,
    });
    expect(
      s({ crosshairStyle: 9, crosshairColor: -2, crosshairSize: 7 }),
    ).toMatchObject({
      crosshairStyle: CROSSHAIR_STYLES.length - 1,
      crosshairColor: 0,
      crosshairSize: 2,
    });
    expect(
      s({ crosshairStyle: 1.6, crosshairColor: 2.2, crosshairSize: 0.1 }),
    ).toMatchObject({
      crosshairStyle: 2,
      crosshairColor: 2,
      crosshairSize: 0.75,
    });
  });
  it("ignore values of the wrong type", () => {
    const s = parseSettings(
      JSON.stringify({
        crosshairStyle: "dot",
        crosshairColor: null,
        crosshairSize: "big",
      }),
    );
    expect(s.crosshairStyle).toBe(defaults.crosshairStyle);
    expect(s.crosshairColor).toBe(defaults.crosshairColor);
    expect(s.crosshairSize).toBe(defaults.crosshairSize);
  });
  it("offer distinct, valid colours", () => {
    const hex = CROSSHAIR_COLORS.map(([, c]) => c);
    expect(new Set(hex).size).toBe(hex.length);
    for (const c of hex) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  DEFAULT_FIDELITY,
  FIDELITY,
  fidelity,
  filterTexture,
  filteredTextures,
  setAnisotropy,
} from "../src/fidelity";
import { defaults, parseSettings } from "../src/settings";

describe("Graphics fidelity", () => {
  it("has four named steps, Low to Ultra, with Medium the default", () => {
    expect(FIDELITY.map((f) => f.name)).toEqual([
      "Low",
      "Medium",
      "High",
      "Ultra",
    ]);
    expect(DEFAULT_FIDELITY).toBe(defaults.quality);
    expect(fidelity(defaults.quality).name).toBe("Medium");
  });
  it("keeps what Medium drew before the slider", () => {
    const m = FIDELITY[1];
    expect(m.shadowMap).toBe(1024);
    expect(m.shadowRate).toBe(30);
    expect(m.ao).toBe(0);
    expect(m.antialiasing).toBe("fxaa");
    expect(m.maxPixelRatio).toBe(1.5);
    expect(m.atmosphere).toBe(128);
    expect(m.sparks).toBe(1);
    expect(m.maxAnisotropy).toBe(false);
    expect(m.bloom).toBe(0);
    expect(m.grade).toBe(false);
    expect(FIDELITY[0].bloom).toBe(0);
    expect(FIDELITY[0].grade).toBe(false);
  });
  it("adds bloom and the grade on High, and more bloom on Ultra", () => {
    expect(FIDELITY[2].bloom).toBeGreaterThan(0);
    expect(FIDELITY[2].grade).toBe(true);
    expect(FIDELITY[3].bloom).toBeGreaterThan(FIDELITY[2].bloom);
    expect(FIDELITY[3].grade).toBe(true);
  });
  it("climbs from Low to Ultra in every cost", () => {
    for (let i = 1; i < FIDELITY.length; i++) {
      const a = FIDELITY[i - 1],
        b = FIDELITY[i];
      expect(b.shadowMap).toBeGreaterThanOrEqual(a.shadowMap);
      expect(b.shadowRate).toBeGreaterThanOrEqual(a.shadowRate);
      expect(b.ao).toBeGreaterThanOrEqual(a.ao);
      expect(b.maxPixelRatio).toBeGreaterThanOrEqual(a.maxPixelRatio);
      expect(b.atmosphere).toBeGreaterThanOrEqual(a.atmosphere);
      expect(b.sparks).toBeGreaterThanOrEqual(a.sparks);
    }
    expect(FIDELITY[0].shadowMap).toBe(0);
    expect(FIDELITY[0].antialiasing).toBe("none");
    expect(FIDELITY[0].maxPixelRatio).toBe(1);
    expect(FIDELITY[3].antialiasing).toBe("smaa");
    expect(FIDELITY[3].ao).toBe(1);
  });
  it("reads old saves (Low, Medium, High) as the same steps and clamps the rest", () => {
    for (const q of [0, 1, 2])
      expect(parseSettings(JSON.stringify({ quality: q })).quality).toBe(q);
    expect(parseSettings('{"quality":3}').quality).toBe(3);
    expect(parseSettings('{"quality":7}').quality).toBe(3);
    expect(parseSettings('{"quality":-1}').quality).toBe(0);
    expect(parseSettings('{"quality":2.6}').quality).toBe(3);
    expect(fidelity(Number.NaN).name).toBe("Low");
    expect(fidelity(9).name).toBe("Ultra");
  });
  it("raises texture filtering on Ultra and restores each texture's own after", () => {
    const a = filterTexture(new T.Texture(), 4),
      b = filterTexture(new T.Texture(), 8);
    expect([a.anisotropy, b.anisotropy]).toEqual([4, 8]);
    const version = a.version;
    setAnisotropy(16);
    expect([a.anisotropy, b.anisotropy]).toEqual([16, 16]);
    expect(a.version).toBeGreaterThan(version);
    // A texture made while Ultra is on starts at the ceiling.
    const c = filterTexture(new T.Texture(), 4);
    expect(c.anisotropy).toBe(16);
    setAnisotropy(0);
    expect([a.anisotropy, b.anisotropy, c.anisotropy]).toEqual([4, 8, 4]);
    c.dispose();
    expect(filteredTextures()).not.toContain(c);
    a.dispose();
    b.dispose();
  });
});

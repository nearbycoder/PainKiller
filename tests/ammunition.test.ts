import { describe, it, expect } from "vitest";
import { AMMUNITION, refillAmmo } from "../src/ammunition";
import { stickAxis } from "../src/controls";
describe("ammunition reserves", () => {
  it("keeps every finite reserve integer and capped after repeated pickups", () => {
    for (let i = 1; i < 5; i++)
      for (const alt of [false, true]) {
        let n = 0.5;
        for (let j = 0; j < 100; j++) {
          n = refillAmmo(n, i, alt);
          expect(Number.isInteger(n)).toBe(true);
        }
        expect(n).toBe(alt ? AMMUNITION[i].altMax : AMMUNITION[i].max);
      }
    expect(refillAmmo(Infinity, 0)).toBe(Infinity);
  });
  it("removes stick drift while retaining proportional movement", () => {
    expect(stickAxis(0.1)).toBe(0);
    expect(stickAxis(-0.1)).toBe(0);
    expect(stickAxis(1)).toBe(1);
    expect(stickAxis(-1)).toBe(-1);
    expect(stickAxis(0.5)).toBeGreaterThan(0);
    expect(stickAxis(0.5)).toBeLessThan(0.5);
  });
});

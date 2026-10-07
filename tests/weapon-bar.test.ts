import { describe, expect, it } from "vitest";
import { slotAmmo } from "../src/ammunition";
import { WEAPONS } from "../src/data";

describe("weapon bar reserves", () => {
  it("shows each mode's reserve as a share of its maximum", () => {
    const shotgun = slotAmmo(1, 50, 25, WEAPONS[1]);
    expect(shotgun.primary).toBe(0.5);
    expect(shotgun.alternate).toBe(0.25);
    // The chaingun holds 500 rounds.
    expect(slotAmmo(3, 24, 250, WEAPONS[3]).alternate).toBe(0.5);
    expect(slotAmmo(4, 125, 0, WEAPONS[4]).primary).toBe(0.5);
  });
  it("keeps shares between 0 and 1 and counts whole rounds only", () => {
    expect(slotAmmo(1, 0.6, 0, WEAPONS[1]).primary).toBe(0);
    expect(slotAmmo(1, 140, 0, WEAPONS[1]).primary).toBe(1);
    expect(slotAmmo(1, -3, 0, WEAPONS[1]).primary).toBe(0);
  });
  it("shows the Thresher full and never dry", () => {
    const blade = slotAmmo(0, Infinity, Infinity, WEAPONS[0]);
    expect(blade).toMatchObject({
      primary: 1,
      alternate: 1,
      dry: false,
      primaryLow: false,
      alternateLow: false,
    });
  });
  it("marks a weapon dry only when neither mode can fire", () => {
    expect(slotAmmo(2, 0, 0, WEAPONS[2]).dry).toBe(true);
    expect(slotAmmo(2, 0.9, 0.5, WEAPONS[2]).dry).toBe(true);
    expect(slotAmmo(2, 1, 0, WEAPONS[2]).dry).toBe(false);
    expect(slotAmmo(2, 0, 1, WEAPONS[2]).dry).toBe(false);
  });
  it("marks a reserve low as the ammunition counter does", () => {
    // A fifth of what a level starts with: 24 rockets → 5, 220 rounds → 44.
    expect(slotAmmo(3, 5, 45, WEAPONS[3])).toMatchObject({
      primaryLow: true,
      alternateLow: false,
    });
    expect(slotAmmo(3, 6, 44, WEAPONS[3])).toMatchObject({
      primaryLow: false,
      alternateLow: true,
    });
  });
});

import { describe, it, expect } from "vitest";
import { fallbackWeapon, lowAmmo } from "../src/ammunition";
import { WEAPONS } from "../src/data";
import { parseSettings } from "../src/settings";

const full = WEAPONS.map((w) => w.ammo),
  fullAlt = WEAPONS.map((w) => w.alt);
describe("switching weapons when the mode in hand runs dry", () => {
  it("picks the highest other slot with ammunition for the button pressed", () => {
    expect(fallbackWeapon(3, full, fullAlt, false)).toBe(4);
    expect(fallbackWeapon(4, full, fullAlt, false)).toBe(3);
    expect(fallbackWeapon(4, full, fullAlt, true)).toBe(3);
  });
  it("looks at primary or alternate reserves only", () => {
    const ammo = [Infinity, 0, 0, 0, 0],
      alt = [Infinity, 0, 5, 0, 0];
    expect(fallbackWeapon(3, ammo, alt, false)).toBe(0);
    expect(fallbackWeapon(3, ammo, alt, true)).toBe(2);
  });
  it("skips empty weapons and never returns the weapon in hand", () => {
    const ammo = [Infinity, 12, 0, 0, 0];
    expect(fallbackWeapon(3, ammo, ammo, false)).toBe(1);
    expect(fallbackWeapon(1, ammo, ammo, false)).toBe(0);
    expect(fallbackWeapon(4, [Infinity, 0, 0, 0, 0.5], fullAlt, false)).toBe(0);
  });
  it("falls back to the Thresher, whose blades never run out", () => {
    const none = [Infinity, 0, 0, 0, 0];
    for (let id = 1; id < 5; id++)
      for (const alt of [false, true])
        expect(fallbackWeapon(id, none, none, alt)).toBe(0);
  });
});
describe("low ammunition", () => {
  it("is at or under a fifth of a level's starting reserve", () => {
    expect(lowAmmo(24, 24)).toBe(false);
    expect(lowAmmo(5, 24)).toBe(true);
    expect(lowAmmo(6, 24)).toBe(false);
    expect(lowAmmo(0, 24)).toBe(true);
    expect(lowAmmo(44, 220)).toBe(true);
    expect(lowAmmo(45, 220)).toBe(false);
  });
  it("never applies to the Thresher", () => {
    expect(lowAmmo(Infinity, Infinity)).toBe(false);
  });
});
describe("the switch-when-empty option", () => {
  it("is on by default, keeps a saved choice and ignores bad values", () => {
    expect(parseSettings(null).autoSwitch).toBe(true);
    expect(parseSettings('{"autoSwitch":false}').autoSwitch).toBe(false);
    expect(parseSettings('{"autoSwitch":"no"}').autoSwitch).toBe(true);
  });
});

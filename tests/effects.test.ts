import { describe, expect, it } from "vitest";
import * as T from "three";
import { CombatEffects } from "../src/combat-effects";

describe("combat cosmetics lifetime", () => {
  it("bounds rapid-fire effects and releases every transient object on arena change", () => {
    const scene = new T.Scene(),
      effects = new CombatEffects(scene);
    const point = new T.Vector3(0, 1, 0),
      normal = new T.Vector3(0, 1, 0);
    for (let i = 0; i < 200; i++) {
      effects.impact(point, normal);
      effects.muzzle(point, normal, true);
      effects.eject(point, new T.Quaternion(), i % 2 === 0);
    }
    expect(scene.children.length).toBe(48 + 60 + 72);
    effects.clear();
    expect(scene.children).toHaveLength(0);
  });
  it("pauses without aging, then fades and retires smoke, casings and marks", () => {
    const scene = new T.Scene(),
      effects = new CombatEffects(scene);
    const point = new T.Vector3(0, 1, 0),
      normal = new T.Vector3(0, 1, 0);
    effects.impact(point, normal);
    effects.eject(point, new T.Quaternion(), true);
    const count = scene.children.length;
    effects.update(0);
    expect(scene.children).toHaveLength(count);
    for (let i = 0; i < 120; i++) effects.update(1 / 60);
    expect(scene.children.filter((o) => o instanceof T.Sprite)).toHaveLength(0);
    for (let i = 0; i < 1200; i++) effects.update(1 / 60);
    expect(scene.children).toHaveLength(0);
  });
});

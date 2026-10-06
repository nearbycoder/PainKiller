import { describe, it, expect } from "vitest";
import {
  rng,
  blocked,
  slide,
  parseSave,
  damageAfterArmor,
  segmentSphere,
  freshSave,
  archSegments,
} from "../src/core";
import { LEVELS, WEAPONS, waveCount } from "../src/data";
describe("campaign contracts", () => {
  it("contains 24 reachable stages, five chapters and five boss encounters", () => {
    expect(LEVELS).toHaveLength(24);
    expect(new Set(LEVELS.map((x) => x.chapter)).size).toBe(5);
    expect(LEVELS.filter((x) => x.boss)).toHaveLength(5);
    expect(LEVELS.every((l) => l.rooms >= 3 && l.rooms <= 5)).toBe(true);
    expect(new Set(LEVELS.map((l) => l.seed)).size).toBe(24);
  });
  it("has complete dual-mode ammunition definitions", () => {
    expect(WEAPONS).toHaveLength(5);
    expect(
      WEAPONS.every((w) => w.primary && w.secondary && w.ammo > 0 && w.alt > 0),
    ).toBe(true);
  });
  it("keeps encounters finite across the whole campaign", () => {
    for (let l = 0; l < 24; l++)
      for (let r = 0; r < LEVELS[l].rooms; r++)
        for (let w = 0; w < 3; w++) {
          expect(waveCount(l, r, w)).toBeGreaterThan(0);
          expect(waveCount(l, r, w)).toBeLessThan(50);
        }
  });
});
describe("collision and combat math", () => {
  const wall = [{ x: 2, z: 0, w: 1, d: 8, h: 3 }];
  it("prevents fast movement from tunneling through walls", () => {
    const p = slide(0, 0, 20, 0, 0.4, wall);
    expect(p.x).toBeLessThanOrEqual(1.1);
    expect(blocked(p.x, p.z, 0.4, wall)).toBe(false);
  });
  it("slides along a wall without entering it", () => {
    const p = slide(1, 0, 2, 2, 0.4, wall);
    expect(p.x).toBeLessThan(1.11);
    expect(p.z).toBeCloseTo(2);
  });
  it("allows clearing low obstacles while jumping", () => {
    expect(blocked(2, 0, 0.4, wall, 3.1)).toBe(false);
  });
  it("sweeps projectiles through targets between frames", () => {
    expect(segmentSphere(0, 1, 0, 0, 1, -20, 0, 1, -10, 0.7)).toBe(true);
    expect(segmentSphere(0, 1, 0, 0, 1, -20, 3, 1, -10, 0.7)).toBe(false);
  });
  it("absorbs armor without allowing negative armor", () => {
    expect(damageAfterArmor(20, 50)).toEqual({ health: 8, armor: 38 });
    expect(damageAfterArmor(20, 5)).toEqual({ health: 15, armor: 0 });
  });
});
describe("reproducibility and persistence", () => {
  it("recreates the same procedural layout from its seed", () => {
    const a = rng(42),
      b = rng(42);
    expect(Array.from({ length: 100 }, a)).toEqual(
      Array.from({ length: 100 }, b),
    );
  });
  it("recovers from missing, malformed or incompatible saves", () => {
    for (const s of [null, "{oops", "null", '{"version":2}'])
      expect(parseSave(s)).toEqual(freshSave());
  });
  it("bounds corrupt fields and preserves valid progress", () => {
    const s = parseSave(
      JSON.stringify({
        version: 1,
        level: 100,
        room: 100,
        unlocked: 100,
        kills: -2,
        cards: [0, 0, 1, 9, null],
        best: { "0": 12, "1": "bad" },
        completed: true,
      }),
    );
    expect(s.level).toBe(23);
    expect(s.room).toBe(4);
    expect(s.kills).toBe(0);
    expect(s.cards).toEqual([0, 1]);
    expect(s.best).toEqual({ "0": 12 });
  });
  it("round-trips a checkpoint", () => {
    const s = {
      ...freshSave(),
      level: 12,
      room: 3,
      kills: 1200,
      unlocked: 12,
      cards: [0, 2],
      selectedCard: 2,
    };
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});
describe("procedural arches", () => {
  it("closes the voussoir ring at every span the arenas use", () => {
    for (const [width, height] of [
      [1.7, 8],
      [5, 10],
      [6, 13],
      [13, 13],
      [29, 18],
      [40, 24],
      [45, 17],
    ]) {
      const stones = archSegments(width, height);
      expect(stones.length).toBeGreaterThanOrEqual(12);
      for (let i = 1; i < stones.length; i++) {
        const gap = Math.hypot(
          stones[i].x - stones[i - 1].x,
          stones[i].y - stones[i - 1].y,
        );
        expect(gap).toBeLessThanOrEqual(stones[i].tangential);
      }
      // The crown stone lies flat across the top of the arch.
      const crown = stones.reduce((a, b) => (b.y > a.y ? b : a));
      expect(Math.abs(Math.cos(crown.rotation))).toBeGreaterThan(0.99);
      expect(crown.radial).toBeLessThanOrEqual(1.4);
    }
  });
});

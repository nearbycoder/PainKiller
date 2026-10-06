import { describe, it, expect } from "vitest";
import { EnemyMotion } from "../src/enemy-motion";
import { enemyModel } from "../src/models";
import { ENEMY_TYPES } from "../src/data";
describe("layered enemy movement", () => {
  for (const type of [...ENEMY_TYPES, "boss"] as const)
    it(`${type} articulates, reacts, attacks and preserves a frozen pose`, () => {
      // Models pick a random gait phase; at a few phases the hound's attack frame
      // nearly matches its walk frame, which made this test fail about 1 run in 30.
      const random = Math.random;
      Math.random = () => 0.25;
      const m = enemyModel(type);
      Math.random = random;
      m.animate!(0.1, 3, false);
      const walk = m.limbs.map((l) => l.rotation.x);
      m.action!("attack");
      m.animate!(0.36, 0, false);
      const attack = m.limbs.map((l) => l.rotation.x);
      expect(attack.some((n, i) => Math.abs(n - walk[i]) > 0.01)).toBe(true);
      m.animate!(0.2, 5, true);
      expect(m.limbs.map((l) => l.rotation.x)).toEqual(attack);
      m.physics!();
      m.animate!(0.2, 5, false);
      expect(m.limbs.map((l) => l.rotation.x)).toEqual(attack);
      m.dispose();
    });
  it("alternates attacks and settles to idle without foot cycling", () => {
    const m = new EnemyMotion("knight", 0.1);
    m.action("attack");
    const a = m.step(0.36, 0);
    m.step(2, 0);
    m.action("attack");
    const b = m.step(0.36, 0);
    expect(a.arms).not.toEqual(b.arms);
    m.step(2, 0);
    const idle = m.step(0.1, 0);
    expect(idle.legs.every((n) => Math.abs(n) < 0.001)).toBe(true);
  });
});

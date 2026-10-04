import { describe, it, expect } from "vitest";
import { WeaponMotion, Spring } from "../src/weapon-motion";
describe("weapon feel", () => {
  it("recoil settles and remains stable across different frame rates", () => {
    const simulate = (rate: number) => {
      const s = new Spring();
      s.kick(3);
      for (let i = 0; i < rate * 2; i++) s.step(1 / rate);
      return s.value;
    };
    expect(Math.abs(simulate(30))).toBeLessThan(0.001);
    expect(Math.abs(simulate(144) - simulate(30))).toBeLessThan(0.001);
  });
  it("shotgun has more kick than rapid chaingun fire", () => {
    const shotgun = new WeaponMotion(),
      chain = new WeaponMotion();
    shotgun.equip(1);
    chain.equip(3);
    shotgun.fire(false);
    chain.fire(true);
    expect(shotgun.step(1 / 60, 0, 0, true, false).z).toBeGreaterThan(
      chain.step(1 / 60, 0, 0, true, false).z,
    );
  });
  it("firing cancels inspection and equip motion; flashes expire without a cooldown dependency", () => {
    const m = new WeaponMotion();
    m.equip(1);
    m.inspect = 1.7;
    m.fire(false);
    expect(m.inspect).toBe(0);
    expect(m.draw).toBe(0);
    expect(m.flash).toBeGreaterThan(0);
    m.step(0.1, 0, 0, true, false);
    expect(m.flash).toBe(0);
  });
  it("paused animation does not advance and mechanical cycling returns home", () => {
    const m = new WeaponMotion();
    m.equip(2);
    m.fire(false);
    m.step(0.2, 4, 0, true, false);
    const t = m.cycle;
    m.step(0, 4, 0, true, false);
    expect(m.cycle).toBe(t);
    for (let i = 0; i < 120; i++) m.step(1 / 60, 0, 0, true, false);
    expect(m.step(0, 0, 0, true, false).mechanical).toBeCloseTo(0);
  });
});

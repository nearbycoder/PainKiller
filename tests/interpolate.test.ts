import { describe, it, expect } from "vitest";
import * as T from "three";
import { between, Interpolator } from "../src/interpolate";

const at = (x: number, z = 0, yaw = 0) => {
  const o = new T.Object3D();
  o.position.set(x, 0, z);
  o.rotation.y = yaw;
  return o;
};

describe("drawing between simulation steps", () => {
  it("draws the fraction of a step that has elapsed, then puts the step back", () => {
    const motion = new Interpolator();
    const o = at(0, 0, 0);
    motion.record([o]);
    o.position.set(0.2, 0, -0.1);
    o.rotation.y = 0.4;
    motion.apply([o], 0.25, true);
    expect(o.position.x).toBeCloseTo(0.05);
    expect(o.position.z).toBeCloseTo(-0.025);
    expect(o.rotation.y).toBeCloseTo(0.1);
    motion.restore();
    expect(o.position.toArray()).toEqual([0.2, 0, -0.1]);
    expect(o.rotation.y).toBe(0.4);
  });
  it("moves only the position unless asked to turn", () => {
    const motion = new Interpolator();
    const o = at(0);
    motion.record([o]);
    o.position.x = 1;
    o.rotation.y = 1;
    motion.apply([o], 0.5);
    expect(o.position.x).toBeCloseTo(0.5);
    expect(o.rotation.y).toBe(1);
    motion.restore();
    expect(o.position.x).toBe(1);
  });
  it("clamps the fraction to one step", () => {
    const motion = new Interpolator();
    const o = at(0);
    motion.record([o]);
    o.position.x = 1;
    motion.apply([o], 1.7);
    expect(o.position.x).toBe(1);
    motion.restore();
    motion.apply([o], -0.5);
    expect(o.position.x).toBe(0);
    motion.restore();
    expect(o.position.x).toBe(1);
  });
  it("leaves alone what it has not seen at the start of a step", () => {
    const motion = new Interpolator();
    const fresh = at(3);
    motion.apply([fresh], 0.5);
    expect(fresh.position.x).toBe(3);
    motion.restore();
    expect(fresh.position.x).toBe(3);
  });
  it("draws a jump where it landed", () => {
    const motion = new Interpolator(4);
    const o = at(0);
    motion.record([o]);
    o.position.set(12, 0, 5);
    motion.apply([o], 0.5);
    expect(o.position.toArray()).toEqual([12, 0, 5]);
    motion.restore();
    expect(o.position.toArray()).toEqual([12, 0, 5]);
  });
  it("forgets objects no longer tracked, and everything on reset", () => {
    const motion = new Interpolator();
    const a = at(0),
      b = at(0);
    motion.record([a, b]);
    motion.record([a]);
    b.position.x = 1;
    motion.apply([b], 0.5);
    expect(b.position.x).toBe(1);
    motion.restore();
    motion.reset();
    a.position.x = 1;
    motion.apply([a], 0.5);
    expect(a.position.x).toBe(1);
    motion.restore();
  });
  it("applies once per object even if listed twice", () => {
    const motion = new Interpolator();
    const o = at(0);
    motion.record([o]);
    o.position.x = 1;
    motion.apply([o], 0.5);
    motion.apply([o], 0.25);
    expect(o.position.x).toBeCloseTo(0.5);
    motion.restore();
    expect(o.position.x).toBe(1);
  });
  it("interpolates a point, or takes the destination after a jump", () => {
    const out = new T.Vector3();
    between(new T.Vector3(0, 0, 0), new T.Vector3(1, 0, 0), 0.5, out);
    expect(out.x).toBeCloseTo(0.5);
    between(new T.Vector3(0, 0, 0), new T.Vector3(10, 0, 0), 0.5, out);
    expect(out.x).toBe(10);
    between(new T.Vector3(0, 0, 0), new T.Vector3(1, 0, 0), 3, out);
    expect(out.x).toBe(1);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import * as T from "three";
import { Physics, initPhysics } from "../src/physics";
import type { EnemyModel } from "../src/models";
beforeAll(async () => {
  await initPhysics();
});
function actor(): EnemyModel {
  const root = new T.Group();
  const bone = (name: string, parent: T.Object3D, y: number) => {
    const b = new T.Bone();
    b.name = "CityDeadOutfit" + name;
    b.position.y = y;
    parent.add(b);
    return b;
  };
  const hips = bone("Hips", root, 1),
    spine = bone("Spine", hips, 0.2),
    upper = bone("Spine2", spine, 0.25),
    head = bone("Head", upper, 0.2);
  bone("HeadTop_End", head, 0.2);
  return {
    root,
    limbs: [],
    ice: new T.Mesh(),
    dispose: () => {},
    physics: () => {},
  };
}
describe("physical impacts", () => {
  it("bounces a fast grenade off a thin wall without reversing its tangential velocity", () => {
    const p = new Physics();
    p.reset([{ x: 0, z: -3, w: 10, d: 0.15, h: 5 }]);
    const b = p.grenade(new T.Vector3(0, 2, 0), new T.Vector3(2, 0, -45));
    let bounced = false;
    for (let i = 0; i < 30; i++) {
      p.step(1 / 60);
      if (b.linvel().z > 1) {
        bounced = true;
        expect(b.linvel().x).toBeGreaterThan(0);
        break;
      }
    }
    expect(bounced).toBe(true);
    expect(b.translation().z).toBeGreaterThan(-3);
    p.world.free();
  });
  it("carries an articulated body into a wall and leaves it pinned", () => {
    const p = new Physics();
    p.reset([{ x: 0, z: -5, w: 10, d: 0.5, h: 5 }]);
    const a = actor(),
      rig = p.ragdoll(
        a,
        new T.Vector3(0, 1, -18),
        new T.Vector3(0, 1.2, 0),
        true,
      );
    expect(rig.bodies).toHaveLength(3);
    for (let i = 0; i < 120; i++) p.step(1 / 60);
    expect(rig.pinned).toBe(true);
    expect(rig.anchor?.translation().z).toBeCloseTo(-4.69, 1);
    for (const b of rig.bodies) {
      expect(b.translation().y).toBeGreaterThan(-0.1);
      expect(Math.abs(b.translation().z)).toBeLessThan(6);
    }
    p.removeRagdoll(rig);
    expect(p.ragdolls.size).toBe(0);
    p.world.free();
  });
  it("falls to the floor when no surface is available to pin and clears all dynamic bodies on reset", () => {
    const p = new Physics();
    p.reset([]);
    const rig = p.ragdoll(
      actor(),
      new T.Vector3(2, 1, 0),
      new T.Vector3(0, 1.2, 0),
      true,
    );
    for (let i = 0; i < 180; i++) p.step(1 / 60);
    expect(rig.pinned).toBe(false);
    expect(
      rig.bodies.every(
        (b) => b.translation().y > -0.1 && Number.isFinite(b.translation().x),
      ),
    ).toBe(true);
    p.reset([]);
    expect(p.world.bodies.len()).toBe(1);
    p.world.free();
  });
});

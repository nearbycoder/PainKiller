import R from "@dimforge/rapier3d-compat";
import * as T from "three";
import type { Collider } from "./core";
import type { EnemyModel } from "./models";

export const initPhysics = () => R.init();
const up = new T.Vector3(0, 1, 0);
const v = (p: R.Vector) => new T.Vector3(p.x, p.y, p.z);
const q = (p: R.Rotation) => new T.Quaternion(p.x, p.y, p.z, p.w);
interface Binding {
  object: T.Object3D;
  body: R.RigidBody;
  offset: T.Vector3;
  rotation: T.Quaternion;
}
export interface Ragdoll {
  bindings: Binding[];
  bodies: R.RigidBody[];
  pinned: boolean;
  anchor?: R.RigidBody;
  flight?: {
    body: R.RigidBody;
    local: T.Vector3;
    previous: T.Vector3;
    direction: T.Vector3;
    life: number;
  };
}
export class Physics {
  world = new R.World({ x: 0, y: -9.81, z: 0 });
  ragdolls = new Set<Ragdoll>();
  private staticBodies: R.RigidBody[] = [];
  reset(colliders: Collider[]) {
    this.ragdolls.clear();
    this.world.free();
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.staticBodies = [];
    this.fixedBox(new T.Vector3(0, -0.25, 0), new T.Vector3(80, 0.25, 90));
    for (const c of colliders)
      this.fixedBox(
        new T.Vector3(c.x, c.h / 2, c.z),
        new T.Vector3(c.w / 2, c.h / 2, c.d / 2),
      );
    this.world.updateSceneQueries();
  }
  private fixedBox(center: T.Vector3, half: T.Vector3) {
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setFriction(0.75)
        .setCollisionGroups(0x0001ffff),
      body,
    );
    this.staticBodies.push(body);
    return body;
  }
  ray(origin: T.Vector3, direction: T.Vector3, length: number) {
    const hit = this.world.castRayAndGetNormal(
      new R.Ray(origin, direction),
      length,
      true,
      // Explicit groups + predicate avoid the legacy WASM query-flag mismatch.
      undefined,
      0x00010001,
      undefined,
      undefined,
      (collider) => collider.parent()?.isFixed() === true,
    );
    return hit
      ? {
          distance: hit.toi,
          normal: v(hit.normal),
          point: origin.clone().addScaledVector(direction, hit.toi),
        }
      : null;
  }
  grenade(position: T.Vector3, velocity: T.Vector3) {
    const b = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: 5, y: 2, z: 3 })
        .setCcdEnabled(true)
        .setLinearDamping(0.08)
        .setAngularDamping(0.3),
    );
    this.world.createCollider(
      R.ColliderDesc.ball(0.14)
        .setMass(0.65)
        .setRestitution(0.48)
        .setFriction(0.6)
        .setCollisionGroups(0x00040003),
      b,
    );
    return b;
  }
  removeBody(body: R.RigidBody) {
    if (body.isValid()) this.world.removeRigidBody(body);
  }
  ragdoll(
    model: EnemyModel,
    impulse: T.Vector3,
    hit: T.Vector3,
    stake = false,
  ): Ragdoll {
    model.physics?.();
    model.root.updateMatrixWorld(true);
    const actorScale = Math.max(
      model.root.scale.x,
      model.root.scale.y,
      model.root.scale.z,
    );
    const rig: Ragdoll = { bindings: [], bodies: [], pinned: false };
    const bones = new Map<string, T.Bone>();
    model.root.traverse((o) => {
      if (o instanceof T.Bone)
        bones.set(o.name.replace(/^.*CityDeadOutfit[:_]?/, ""), o);
    });
    const specs: [string, string, number, number][] = [
      ["Hips", "Spine", 0.14, 10],
      ["Spine", "Spine2", 0.17, 15],
      ["Head", "HeadTop_End", 0.105, 5],
      ["LeftArm", "LeftForeArm", 0.065, 3],
      ["LeftForeArm", "LeftHand", 0.05, 2],
      ["RightArm", "RightForeArm", 0.065, 3],
      ["RightForeArm", "RightHand", 0.05, 2],
      ["LeftUpLeg", "LeftLeg", 0.09, 6],
      ["LeftLeg", "LeftFoot", 0.065, 4],
      ["RightUpLeg", "RightLeg", 0.09, 6],
      ["RightLeg", "RightFoot", 0.065, 4],
    ];
    const mapped = new Map<T.Object3D, Binding>();
    const add = (
      object: T.Object3D,
      a: T.Vector3,
      b: T.Vector3,
      radius: number,
      mass: number,
    ) => {
      const center = a.clone().add(b).multiplyScalar(0.5),
        dir = b.clone().sub(a),
        rot = new T.Quaternion().setFromUnitVectors(
          up,
          dir.clone().normalize(),
        );
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(center.x, center.y, center.z)
          .setRotation(rot)
          .setLinearDamping(0.32)
          .setAngularDamping(1.8)
          .setCcdEnabled(true),
      );
      this.world.createCollider(
        R.ColliderDesc.capsule(
          Math.max(0.025, dir.length() / 2 - radius),
          radius,
        )
          .setMass(mass)
          .setFriction(0.85)
          .setRestitution(0.08)
          .setCollisionGroups(0x00020005),
        body,
      );
      const binding = {
        object,
        body,
        offset: a.clone().sub(center).applyQuaternion(rot.clone().invert()),
        rotation: rot
          .clone()
          .invert()
          .multiply(object.getWorldQuaternion(new T.Quaternion())),
      };
      rig.bodies.push(body);
      rig.bindings.push(binding);
      mapped.set(object, binding);
      body.setLinvel({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
      return binding;
    };
    if (bones.has("Hips")) {
      for (const [name, end, radius, mass] of specs) {
        const bone = bones.get(name),
          child = bones.get(end);
        if (!bone || !child) continue;
        add(
          bone,
          bone.getWorldPosition(new T.Vector3()),
          child.getWorldPosition(new T.Vector3()),
          radius * actorScale,
          mass,
        );
      }
    } else {
      const base = model.root.getWorldPosition(new T.Vector3());
      const torso = add(
        model.root,
        base,
        base.clone().add(new T.Vector3(0, 1.4, 0)),
        0.32,
        35,
      );
      for (const limb of model.limbs) {
        const a = limb.getWorldPosition(new T.Vector3());
        add(limb, a, a.clone().add(new T.Vector3(0, -0.55, 0)), 0.09, 5);
      }
      // The root represents the feet; its local offset is retained by the binding.
      mapped.set(model.root, torso);
    }
    for (const b of rig.bindings) {
      let parent = b.object.parent;
      while (parent && !mapped.has(parent)) parent = parent.parent;
      const ancestor = parent ? mapped.get(parent) : undefined;
      if (ancestor) {
        const anchor = b.object.getWorldPosition(new T.Vector3());
        const local = (body: R.RigidBody) =>
          anchor
            .clone()
            .sub(v(body.translation()))
            .applyQuaternion(q(body.rotation()).invert());
        this.world.createImpulseJoint(
          R.JointData.spherical(local(ancestor.body), local(b.body)),
          ancestor.body,
          b.body,
          true,
        );
      }
    }
    rig.bindings.sort((a, b) => {
      const depth = (o: T.Object3D): number =>
        o.parent ? 1 + depth(o.parent) : 0;
      return depth(a.object) - depth(b.object);
    });
    const closest = rig.bodies.reduce((a, b) =>
      v(a.translation()).distanceToSquared(hit) <
      v(b.translation()).distanceToSquared(hit)
        ? a
        : b,
    );
    closest.applyImpulseAtPoint(
      { x: impulse.x * 2, y: impulse.y * 2, z: impulse.z * 2 },
      hit,
      true,
    );
    if (stake)
      rig.flight = {
        body: closest,
        local: hit
          .clone()
          .sub(v(closest.translation()))
          .applyQuaternion(q(closest.rotation()).invert()),
        previous: hit.clone(),
        direction: impulse.clone().normalize(),
        life: 1.1,
      };
    this.ragdolls.add(rig);
    return rig;
  }
  impulse(position: T.Vector3, radius: number, power: number) {
    for (const rig of this.ragdolls)
      for (const b of rig.bodies) {
        const delta = v(b.translation()).sub(position),
          d = delta.length();
        if (d < radius) {
          delta.normalize().multiplyScalar(power * (1 - d / radius) * b.mass());
          delta.y += b.mass() * 2;
          b.applyImpulse(delta, true);
        }
      }
  }
  removeRagdoll(rig: Ragdoll) {
    for (const b of rig.bodies) this.removeBody(b);
    if (rig.anchor) this.removeBody(rig.anchor);
    this.ragdolls.delete(rig);
  }
  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
    for (const rig of this.ragdolls) {
      const f = rig.flight;
      if (f && !rig.pinned) {
        f.life -= dt;
        const anchor = f.local
          .clone()
          .applyQuaternion(q(f.body.rotation()))
          .add(v(f.body.translation()));
        const travel = anchor.clone().sub(f.previous),
          length = travel.length();
        const hit = this.ray(f.previous, f.direction, length + 0.3);
        if (hit && hit.normal.dot(f.direction) < -0.35) {
          const p = hit.point.clone().addScaledVector(hit.normal, 0.06);
          rig.anchor = this.world.createRigidBody(
            R.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z),
          );
          this.world.createImpulseJoint(
            R.JointData.spherical({ x: 0, y: 0, z: 0 }, f.local),
            rig.anchor,
            f.body,
            true,
          );
          f.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          rig.pinned = true;
          rig.flight = undefined;
        } else if (f.life <= 0) rig.flight = undefined;
        else f.previous.copy(anchor);
      }
      for (const b of rig.bindings) {
        const rot = q(b.body.rotation()),
          position = b.offset
            .clone()
            .applyQuaternion(rot)
            .add(v(b.body.translation()));
        const worldRot = rot.multiply(b.rotation);
        if (b.object.parent) {
          b.object.parent.updateWorldMatrix(true, false);
          b.object.position.copy(b.object.parent.worldToLocal(position));
          b.object.quaternion.copy(
            b.object.parent
              .getWorldQuaternion(new T.Quaternion())
              .invert()
              .multiply(worldRot),
          );
        } else {
          b.object.position.copy(position);
          b.object.quaternion.copy(worldRot);
        }
        b.object.updateMatrixWorld(true);
      }
    }
  }
}

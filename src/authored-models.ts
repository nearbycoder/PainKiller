import * as T from "three";
import type { EnemyType } from "./data";
import { EnemyMotion } from "./enemy-motion";
import { asset, bakeStatic, cloneActor } from "./assets";
import type { EnemyModel, WeaponModel } from "./models";

const wardrobeCache = new Map<string, T.Group[]>();
export function revenantModel(
  name = "revenant",
  type: EnemyType = name === "skeleton" ? "skeleton" : "shambler",
): EnemyModel {
  const source = asset(name)!,
    root = new T.Group(),
    character = cloneActor(name);
  root.add(character);
  if (!wardrobeCache.has(type)) {
    const groups = new Map<string, T.Group>();
    asset("enemy-wardrobe")?.scene.traverse((o) => {
      if (!(o instanceof T.Mesh) || o.userData.archetype !== type || !o.parent)
        return;
      const bone = o.userData.bone as string;
      if (!groups.has(bone)) {
        const group = new T.Group();
        group.userData.sourceScale = o.parent
          .getWorldScale(new T.Vector3())
          .toArray();
        groups.set(bone, group);
      }
      groups.get(bone)!.add(o.clone());
    });
    wardrobeCache.set(
      type,
      Array.from(groups, ([bone, group]) => {
        const baked = bakeStatic(group);
        baked.userData = {
          bone,
          sourceScale: group.userData.sourceScale,
          archetype: type,
        };
        return baked;
      }),
    );
  }
  for (const source of wardrobeCache.get(type)!) {
    const bone = character.getObjectByName(source.userData.bone);
    if (bone) {
      const piece = source.clone(true);
      // Animation imports use centimetres; costume exports use metres.
      piece.scale
        .fromArray(source.userData.sourceScale)
        .divide(bone.getWorldScale(new T.Vector3()));
      bone.add(piece);
    }
  }
  if (type === "brute") root.scale.set(1.65, 1.55, 1.5);
  if (type === "boss") root.scale.setScalar(3.4);
  if (type === "knight") root.scale.setScalar(1.15);

  const mixer = new T.AnimationMixer(character),
    actions = new Map<string, T.AnimationAction>();
  for (const clip of source.animations)
    actions.set(clip.name, mixer.clipAction(clip));
  let current: T.AnimationAction | undefined,
    locked = 0,
    dead = false;
  let physical = false,
    aim = 0,
    aimTarget = 0;
  const phase = Math.random();
  const motion = new EnemyMotion(type, phase);
  const reaction = new T.Vector3(),
    reactionVelocity = new T.Vector3();
  const joints: {
    bone: T.Bone;
    base: T.Quaternion;
    weight: number;
    impact: number;
  }[] = [];
  character.traverse((o) => {
    if (
      o instanceof T.Bone &&
      /(Spine2|Head|LeftArm|RightArm|LeftForeArm|RightForeArm)$/.test(o.name)
    )
      joints.push({
        bone: o,
        base: o.quaternion.clone(),
        impact: 1,
        weight: o.name.endsWith("Head")
          ? 0.65
          : o.name.endsWith("Spine2")
            ? 1
            : 0.35,
      });
  });
  function play(name: string, once = false, duration?: number) {
    const next = actions.get(name);
    if (!next || (next === current && !once)) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    if (duration) next.setDuration(duration);
    next.play();
    if (current && current !== next) next.crossFadeFrom(current, 0.16, false);
    current = next;
    if (once) locked = duration ?? next.getClip().duration;
  }
  play("walk");
  if (current) current.time = current.getClip().duration * phase;
  const ice = new T.Mesh(
    new T.IcosahedronGeometry(1, 2),
    new T.MeshBasicMaterial({
      color: 0x9fe4ed,
      transparent: true,
      opacity: 0.15,
      wireframe: true,
    }),
  );
  ice.position.y = 1;
  ice.scale.set(0.65, 1.05, 0.5);
  ice.visible = false;
  root.add(ice);
  return {
    root,
    limbs: [],
    ice,
    animate: (dt, moving, frozen) => {
      if (frozen || physical) return;
      for (const j of joints) j.bone.quaternion.copy(j.base);
      locked = Math.max(0, locked - dt);
      const speed = typeof moving === "number" ? moving : moving ? 2 : 0;
      if (!dead && locked <= 0) {
        play(speed > 3.2 ? "run" : speed > 0.15 ? "walk" : "idle");
        current?.setEffectiveTimeScale(
          speed > 0.15
            ? Math.max(0.7, Math.min(1.65, speed / (speed > 3.2 ? 4.2 : 2.5)))
            : 1,
        );
      }
      mixer.update(dt);
      const pose = motion.step(dt, speed);
      character.position.y = pose.bob * 0.6;
      reactionVelocity
        .addScaledVector(reaction, -95 * dt)
        .multiplyScalar(Math.exp(-dt * 13));
      reaction.addScaledVector(reactionVelocity, dt);
      aim += (aimTarget - aim) * (1 - Math.exp(-dt * 7));
      for (const j of joints) {
        j.base.copy(j.bone.quaternion);
        j.bone.rotateX(reaction.x * j.weight * j.impact);
        j.bone.rotateZ(reaction.z * j.weight * j.impact);
        if (j.bone.name.endsWith("Head")) {
          j.bone.rotateY(aim * 0.6 + pose.headY);
          j.bone.rotateX(pose.headX);
        }
        if (j.bone.name.endsWith("Spine2")) {
          j.bone.rotateY(aim * 0.25 + pose.twist);
          j.bone.rotateX(pose.lean * 0.4);
          j.bone.rotateZ(pose.roll);
        }
        const side = j.bone.name.includes("Right") ? 1 : 0;
        if (j.bone.name.endsWith("ForeArm"))
          j.bone.rotateY(pose.elbows[side] * pose.attack * (side ? -1 : 1));
        else if (j.bone.name.endsWith("Arm")) {
          j.bone.rotateX(pose.arms[side][0] * pose.attack * 0.6);
          j.bone.rotateZ(pose.arms[side][2] * pose.attack);
        }
      }
    },
    steer: (angle) => {
      aimTarget = T.MathUtils.clamp(angle, -0.65, 0.65);
    },
    react: (direction, point, strength) => {
      root.updateMatrixWorld(true);
      for (const j of joints) {
        const distance = j.bone
          .getWorldPosition(new T.Vector3())
          .distanceTo(point);
        j.impact = 0.5 + 1 / (1 + distance * distance * 4);
      }
      const local = direction
        .clone()
        .applyQuaternion(root.quaternion.clone().invert());
      reactionVelocity.x += T.MathUtils.clamp(local.z * strength, -2.2, 2.2);
      reactionVelocity.z -= T.MathUtils.clamp(local.x * strength, -2.2, 2.2);
    },
    physics: () => {
      physical = true;
      dead = true;
      character.traverse((o) => {
        if (o instanceof T.SkinnedMesh) o.frustumCulled = false;
      });
      // Leave the evaluated pose intact; stopping actions would restore the bind pose.
      ice.visible = false;
    },
    action: (name) => {
      if (dead) return;
      motion.action(name);
      if (name === "death") dead = true;
      if (name === "hit" && locked > 0 && current === actions.get("attack"))
        return;
      play(
        name === "cast" ? "attack" : name,
        true,
        name === "attack" ? 0.8 : name === "hit" ? 0.28 : undefined,
      );
    },
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(character);
      character.traverse((o) => {
        if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
      });
      ice.geometry.dispose();
      ice.material.dispose();
      root.removeFromParent();
    },
  };
}
const weapons = new Map<
  number,
  { body: T.Group; rotor: T.Group; moving: T.Group }
>();
export function authoredWeapon(id: number): WeaponModel {
  if (!weapons.has(id)) {
    const source = asset(`weapon-${id}`)!.scene.clone(true);
    const rotorSource = source.getObjectByName("rotor");
    let rotor = new T.Group();
    if (rotorSource) {
      // Bake assembly in rotor-local space, then restore its mount transform.
      const mount = rotorSource.position.clone();
      rotorSource.removeFromParent();
      rotorSource.position.set(0, 0, 0);
      rotorSource.updateMatrixWorld(true);
      rotor = bakeStatic(rotorSource);
      rotor.position.copy(mount);
    }
    const movingSource = new T.Group();
    source.updateMatrixWorld(true);
    const parts: T.Object3D[] = [];
    source.traverse((o) => {
      if (
        o instanceof T.Mesh &&
        ((id === 1 &&
          /Shaped_walnut_fore|Shaped walnut fore|Fore.end.chequering|Supporting.finger|Supporting.palm|Left.thumb/.test(
            o.name,
          )) ||
          (id === 2 && /Loaded.timber.stake|Forged.stake.tip/.test(o.name)) ||
          /Bolt.shaft|Bolt.knob/.test(o.name))
      )
        parts.push(o);
    });
    for (const o of parts) movingSource.attach(o);
    const moving = bakeStatic(movingSource);
    weapons.set(id, { body: bakeStatic(source), rotor, moving });
  }
  const cached = weapons.get(id)!,
    root = new T.Group(),
    body = cached.body.clone(true),
    rotor = cached.rotor.clone(true),
    moving = cached.moving.clone(true);
  root.add(body, rotor, moving);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  gradient.addColorStop(0, "#fff");
  gradient.addColorStop(0.15, "#fff5bc");
  gradient.addColorStop(0.45, "#ff981788");
  gradient.addColorStop(1, "#ff771100");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  // Irregular flame tongues retain alpha around the entire silhouette.
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8,
      r = i % 2 ? 6 : 27 - (i % 3) * 3;
    const x = 32 + Math.cos(a) * r,
      y = 32 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const texture = new T.CanvasTexture(c);
  const flash = new T.Mesh(
    new T.PlaneGeometry(0.3, 0.3),
    new T.MeshBasicMaterial({
      map: texture,
      color: id === 4 ? 0x8bdde4 : 0xffd89b,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.015,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const muzzle = [
    [
      [0, 0.035, -0.8],
      [0, 0.035, -0.8],
    ],
    [
      [0, 0.1, -0.98],
      [0.13, 0.025, -0.63],
    ],
    [
      [0, 0.11, -1.3],
      [0, -0.1, -0.54],
    ],
    [
      [-0.045, 0.1, -0.89],
      [0.21, -0.1, -0.91],
    ],
    [
      [0, 0.04, -0.82],
      [0, 0.12, -0.84],
    ],
  ][id];
  flash.position.fromArray(muzzle[0]);
  flash.visible = false;
  root.add(flash);
  root.position.set(0.31, -0.32, -0.65);
  let spin = 0;
  return {
    root,
    rotor,
    flash,
    mechanics: (cycle, alt, dt, firing) => {
      moving.position.z =
        (id === 1 && !alt ? 0.19 : id === 2 && !alt ? 0.08 : 0.035) * cycle;
      if (id === 4) {
        moving.rotation.z = cycle * 0.28;
        rotor.rotation.z += dt * (firing ? 18 : 1);
      }
      if (id === 2) moving.visible = cycle < 0.5 || alt;
      const target =
        id === 0 ? (firing ? 45 : 3) : id === 3 && alt && firing ? 65 : 0;
      spin += (target - spin) * (1 - Math.exp(-dt * 7));
      rotor.rotation.z += spin * dt;
      flash.position.fromArray(muzzle[alt ? 1 : 0]);
      flash.scale.setScalar(
        id === 3 && !alt ? 2 : id === 1 && !alt ? 1.65 : id === 4 ? 1.2 : 0.85,
      );
      flash.material instanceof T.MeshBasicMaterial &&
        flash.material.color.set(
          alt && (id === 1 || id === 4) ? 0x91e9ff : 0xffd494,
        );
    },
    dispose: () => {
      root.removeFromParent();
      flash.geometry.dispose();
      flash.material.map?.dispose();
      flash.material.dispose();
    },
  };
}

const supplies = new Map<string, T.Group>();
export function authoredPickup(kind: string): T.Group | undefined {
  const source = asset("supplies")?.scene.getObjectByName(kind);
  if (!source) return;
  if (!supplies.has(kind)) supplies.set(kind, bakeStatic(source));
  return supplies.get(kind)!.clone(true);
}

import * as T from "three";
import type { EnemyType } from "./data";
import { EnemyMotion } from "./enemy-motion";
import { asset, bakeStatic, cloneActor } from "./assets";
import type { EnemyModel, WeaponModel } from "./models";

const wardrobeCache = new Map<string, T.Group[]>();
/**
 * The five generals share the skeleton rig and armour. Each chapter's general gets its own
 * palette, glow and silhouette pieces fixed to its bones. Purely visual: health, speed,
 * attacks and the hit sphere are unchanged.
 */
export const GENERAL_LOOKS = [
  // I · The Gravewarden: grave-pale bone, green corpse-light, a tall iron crown.
  {
    armor: 0x7d917f,
    tint: 0xd9d6c4,
    glow: 0x7dff9a,
    metal: 0x4b4f47,
    crown: "spikes",
    horns: false,
    wings: false,
    halo: false,
  },
  // II · The Mire King: bog-black and slick, a crown of antlers, sickly yellow light.
  {
    armor: 0x5c6438,
    tint: 0x58604a,
    glow: 0xd9e05a,
    metal: 0x3d3a26,
    crown: "antlers",
    horns: false,
    wings: false,
    halo: false,
  },
  // III · The Sand Colossus: sandstone bone, amber light, curled ram horns.
  {
    armor: 0xb0915e,
    tint: 0xc9a46c,
    glow: 0xffb347,
    metal: 0x8a6a3a,
    crown: "none",
    horns: true,
    wings: false,
    halo: false,
  },
  // IV · The Iron Seraph: blued iron, white-gold halo and iron wings.
  {
    armor: 0x9eabc4,
    tint: 0x8d97a8,
    glow: 0xdfe8ff,
    metal: 0x9aa4b5,
    crown: "none",
    horns: false,
    wings: true,
    halo: true,
  },
  // V · The First Fallen: charred black with ember cracks, horns and a burning crown.
  {
    armor: 0x4a2a22,
    tint: 0x3a2622,
    glow: 0xff5a1e,
    metal: 0x2a1a16,
    crown: "spikes",
    horns: true,
    wings: true,
    halo: false,
  },
] as const;
const generalMaterials = new Map<string, T.Material>();
function generalMaterial(key: string, make: () => T.Material) {
  if (!generalMaterials.has(key)) generalMaterials.set(key, make());
  return generalMaterials.get(key)!;
}
function dressGeneral(character: T.Object3D, chapter: number) {
  const index = Math.max(0, Math.min(4, chapter - 1)),
    look = GENERAL_LOOKS[index];
  // Recolour the body (shared per general, so spawning one allocates nothing).
  character.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const recolour = (m: T.Material) =>
      generalMaterial(`${index}:${m.uuid}`, () => {
        const c = m.clone() as T.MeshStandardMaterial;
        // Armour and cloth take the general's colours; bone is tinted.
        if (/armor|trim|wool|hide/i.test(c.name)) c.color.set(look.armor);
        else if (c.color) c.color.multiply(new T.Color(look.tint));
        // Arenas are dim; any body glow would swamp the armour, so only the First
        // Fallen smoulders.
        if (index === 4 && "emissive" in c) {
          c.emissive = new T.Color(look.glow);
          c.emissiveIntensity = 0.025;
        }
        return c;
      });
    o.material = Array.isArray(o.material)
      ? o.material.map(recolour)
      : recolour(o.material);
  });
  const metal = generalMaterial(
      `${index}:metal`,
      () =>
        new T.MeshStandardMaterial({
          color: look.metal,
          metalness: 0.85,
          roughness: 0.35,
        }),
    ),
    glow = generalMaterial(
      `${index}:glow`,
      () =>
        new T.MeshStandardMaterial({
          color: look.glow,
          emissive: look.glow,
          emissiveIntensity: 2.4,
        }),
    );
  character.updateMatrixWorld(true);
  const bone = (suffix: string) => {
    let found: T.Object3D | undefined;
    character.traverse((o) => {
      if (!found && o instanceof T.Bone && o.name.endsWith(suffix)) found = o;
    });
    return found;
  };
  const head = bone("Head"),
    chest = bone("Spine2");
  if (!head || !chest) return;
  const headAt = head.getWorldPosition(new T.Vector3()),
    chestAt = chest.getWorldPosition(new T.Vector3());
  // Height of the bind pose, so pieces scale with the rig's units.
  const unit = Math.max(0.01, headAt.y / 1.6);
  // Build in the character's space, then attach() keeps the pose while following the bone.
  const add = (
    parent: T.Object3D,
    geo: T.BufferGeometry,
    mat: T.Material,
    at: T.Vector3,
    rotation = new T.Euler(),
    scale = new T.Vector3(1, 1, 1),
  ) => {
    const m = new T.Mesh(geo, mat);
    m.position.copy(at);
    m.rotation.copy(rotation);
    m.scale.copy(scale).multiplyScalar(unit);
    m.castShadow = true;
    character.add(m);
    parent.attach(m);
    return m;
  };
  const top = headAt.clone().add(new T.Vector3(0, 0.16 * unit, 0));
  // Silhouette pieces are oversized so they read from across the arena.
  const big = 1.5;
  // Glowing eyes.
  for (const side of [-1, 1])
    add(
      head,
      new T.SphereGeometry(0.022, 8, 6),
      glow,
      headAt
        .clone()
        .add(new T.Vector3(side * 0.035 * unit, 0.05 * unit, 0.09 * unit)),
    );
  if (look.crown === "spikes")
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(
        head,
        new T.ConeGeometry(0.025 * big, 0.2 * big, 5),
        i % 2 ? metal : glow,
        top
          .clone()
          .add(
            new T.Vector3(
              Math.cos(a) * 0.08 * unit,
              0.05 * unit,
              Math.sin(a) * 0.08 * unit,
            ),
          ),
        new T.Euler(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25),
      );
    }
  if (look.crown === "antlers")
    for (const side of [-1, 1]) {
      add(
        head,
        new T.CylinderGeometry(0.012 * big, 0.022 * big, 0.32 * big, 5),
        metal,
        top.clone().add(new T.Vector3(side * 0.1 * unit, 0.08 * unit, 0)),
        new T.Euler(0, 0, side * -0.7),
      );
      for (const k of [0, 1])
        add(
          head,
          new T.ConeGeometry(0.012 * big, 0.14 * big, 4),
          metal,
          top
            .clone()
            .add(
              new T.Vector3(
                side * (0.16 + k * 0.05) * unit,
                (0.16 + k * 0.06) * unit,
                0,
              ),
            ),
          new T.Euler(0, 0, side * (0.2 - k * 0.5)),
        );
    }
  if (look.horns)
    for (const side of [-1, 1]) {
      const horn = add(
        head,
        new T.TorusGeometry(0.1 * big, 0.03 * big, 6, 14, Math.PI * 1.3),
        metal,
        headAt
          .clone()
          .add(new T.Vector3(side * 0.13 * unit, 0.12 * unit, -0.01 * unit)),
        new T.Euler(0, Math.PI / 2, side > 0 ? 0 : Math.PI),
      );
      horn.scale.z *= 1.4;
    }
  if (look.halo)
    add(
      head,
      new T.TorusGeometry(0.13 * big, 0.01 * big, 6, 32),
      glow,
      top.clone().add(new T.Vector3(0, 0.1 * unit, -0.04 * unit)),
      new T.Euler(Math.PI / 2 - 0.25, 0, 0),
    );
  if (look.wings)
    for (const side of [-1, 1])
      for (let k = 0; k < 3; k++)
        add(
          chest,
          new T.ConeGeometry(0.05 * big, (0.75 - k * 0.15) * big, 4),
          metal,
          chestAt
            .clone()
            .add(
              new T.Vector3(
                side * (0.22 + k * 0.08) * unit,
                (0.12 + k * 0.06) * unit,
                -0.14 * unit,
              ),
            ),
          new T.Euler(0, 0, side * (-1.05 + k * 0.32)),
          new T.Vector3(1, 1, 0.25),
        );
}
export function revenantModel(
  name = "revenant",
  type: EnemyType = name === "skeleton" ? "skeleton" : "shambler",
  chapter = 1,
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
  if (type === "boss") dressGeneral(character, chapter);
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

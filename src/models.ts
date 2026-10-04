import { EnemyMotion } from "./enemy-motion";
import { art } from "./assets";
import { authoredWeapon, revenantModel } from "./authored-models";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type EnemyType } from "./data";
const box = new T.BoxGeometry(1, 1, 1),
  sphere = new T.IcosahedronGeometry(1, 1),
  cylinder = new T.CylinderGeometry(0.7, 1, 1, 8),
  cone = new T.ConeGeometry(1, 1, 6);
const materials = {
  iron: new T.MeshStandardMaterial({
    color: 0x4e5659,
    metalness: 0.82,
    roughness: 0.35,
  }),
  black: new T.MeshStandardMaterial({
    color: 0x171d21,
    metalness: 0.7,
    roughness: 0.45,
  }),
  brass: new T.MeshStandardMaterial({
    color: 0xae8150,
    metalness: 0.7,
    roughness: 0.32,
  }),
  wood: new T.MeshStandardMaterial({ color: 0x6d4930, roughness: 0.93 }),
  bone: new T.MeshStandardMaterial({ color: 0xb6ae8e, roughness: 0.9 }),
  hide: new T.MeshStandardMaterial({ color: 0x4c4940, roughness: 0.93 }),
  skin: new T.MeshStandardMaterial({ color: 0x81836a, roughness: 1 }),
  red: new T.MeshStandardMaterial({ color: 0x542e2c, roughness: 0.9 }),
  eye: new T.MeshBasicMaterial({ color: 0xff7a32 }),
  blue: new T.MeshBasicMaterial({ color: 0x80e6ee }),
};
function part(
  parent: T.Object3D,
  geo: T.BufferGeometry,
  mat: T.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const actorLit = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.85,
});
const actorHide = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.93,
});
const actorGlow = new T.MeshBasicMaterial({ vertexColors: true });
function batch(group: T.Group) {
  group.updateMatrixWorld(true);
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  const children = [...group.children];
  for (const child of children) {
    if (child instanceof T.Mesh) {
      const source = child.material as
        T.MeshStandardMaterial | T.MeshBasicMaterial;
      const mat =
        source === materials.hide
          ? actorHide
          : source instanceof T.MeshBasicMaterial
            ? actorGlow
            : actorLit;
      const geometry = (
        child.geometry.index
          ? child.geometry.toNonIndexed()
          : child.geometry.clone()
      ).applyMatrix4(child.matrix);
      const colors = new Float32Array(
        geometry.getAttribute("position").count * 3,
      );
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = source.color.r;
        colors[i + 1] = source.color.g;
        colors[i + 2] = source.color.b;
      }
      geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat)!.push(geometry);
      group.remove(child);
    }
  }
  for (const [mat, geos] of batches) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (merged) group.add(new T.Mesh(merged, mat));
  }
}
export interface EnemyModel {
  root: T.Group;
  limbs: T.Group[];
  animate?: (dt: number, moving: number | boolean, frozen: boolean) => void;
  action?: (name: "attack" | "cast" | "hit" | "death") => void;
  react?: (direction: T.Vector3, point: T.Vector3, strength: number) => void;
  steer?: (angle: number) => void;
  physics?: () => void;
  ice: T.Mesh;
  dispose: () => void;
}
export function enemyModel(type: EnemyType, chapter = 1): EnemyModel {
  if (art.ready && type !== "hound")
    return revenantModel(
      ["skeleton", "monk", "witch", "knight", "boss"].includes(type)
        ? "skeleton"
        : "revenant",
      type,
    );
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const limbs: T.Group[] = [];
  const skeletal = type === "skeleton",
    robed = type === "monk" || type === "witch",
    large = type === "brute" || type === "boss",
    hound = type === "hound";
  const skin = hound
      ? materials.hide
      : skeletal
        ? materials.bone
        : materials.skin,
    cloth = type === "knight" ? materials.iron : materials.red;
  if (hound) {
    if (art.ready) {
      const leather = art.materials.get("Armory / leather");
      if (leather) {
        actorHide.map = leather.map;
        actorHide.normalMap = leather.normalMap;
        actorHide.normalScale.setScalar(0.5);
      }
    }
    part(body, sphere, skin, 0, 0.69, -0.06, 0.32, 0.37, 0.72);
    part(body, sphere, skin, 0, 0.81, 0.34, 0.37, 0.39, 0.39);
    part(body, sphere, skin, 0, 0.88, 0.64, 0.24, 0.23, 0.3);
    part(body, sphere, skin, 0, 0.75, 0.89, 0.16, 0.13, 0.31);
    part(body, sphere, materials.black, 0, 0.76, 1.13, 0.105, 0.075, 0.075);
    part(body, sphere, materials.red, 0, 0.63, 0.94, 0.145, 0.055, 0.22);
    for (const side of [-1, 1]) {
      part(
        body,
        cone,
        skin,
        side * 0.17,
        1.1,
        0.55,
        0.085,
        0.29,
        0.095,
      ).rotation.z = side * -0.23;
      part(
        body,
        sphere,
        materials.eye,
        side * 0.18,
        0.92,
        0.84,
        0.023,
        0.024,
        0.028,
      );
      for (let tooth = 0; tooth < 3; tooth++)
        part(
          body,
          cone,
          materials.bone,
          side * 0.13,
          0.66,
          0.84 + tooth * 0.07,
          0.017,
          0.09,
          0.018,
        ).rotation.z = Math.PI;
      for (let rib = 0; rib < 5; rib++)
        part(
          body,
          sphere,
          skin,
          side * 0.265,
          0.7,
          -0.34 + rib * 0.12,
          0.07,
          0.26,
          0.038,
        );
    }
  } else {
    part(
      body,
      skeletal ? cylinder : sphere,
      robed ? materials.black : cloth,
      0,
      1.25,
      0,
      0.44,
      0.65,
      0.28,
    );
    part(body, sphere, skin, 0, 1.96, 0.04, 0.27, 0.32, 0.25);
    part(body, box, materials.black, -0.1, 2.01, 0.25, 0.12, 0.1, 0.07);
    part(body, box, materials.black, 0.1, 2.01, 0.25, 0.12, 0.1, 0.07);
    part(body, sphere, materials.eye, -0.1, 2.02, 0.28, 0.047, 0.04, 0.025);
    part(body, sphere, materials.eye, 0.1, 2.02, 0.28, 0.047, 0.04, 0.025);
    part(body, box, materials.bone, 0, 1.81, 0.22, 0.24, 0.09, 0.12);
    for (let i = 0; i < 4; i++)
      part(
        body,
        box,
        materials.black,
        -0.09 + i * 0.06,
        1.82,
        0.286,
        0.013,
        0.07,
        0.01,
      );
    if (skeletal)
      for (let i = 0; i < 4; i++)
        part(
          body,
          box,
          materials.bone,
          0,
          1.14 + i * 0.13,
          0.17,
          0.62 - i * 0.05,
          0.065,
          0.15,
        );
    if (robed) {
      part(body, cone, materials.black, 0, 0.69, 0, 0.58, 1.35, 0.43);
      part(body, cone, cloth, 0, 2.22, -0.04, 0.4, 0.75, 0.35);
    }
    if (type === "knight" || large) {
      for (const side of [-1, 1]) {
        part(
          body,
          sphere,
          materials.iron,
          side * 0.52,
          1.56,
          0,
          0.25,
          0.24,
          0.3,
        );
        part(
          body,
          cone,
          materials.bone,
          side * 0.5,
          1.95,
          0,
          0.11,
          0.65,
          0.11,
        ).rotation.z = side * -0.5;
      }
      part(body, box, materials.iron, 0, 2.03, 0.13, 0.54, 0.26, 0.3);
      part(body, box, materials.eye, 0, 2.03, 0.3, 0.37, 0.035, 0.04);
    }
    if (type === "boss") {
      for (const side of [-1, 1]) {
        part(
          body,
          cone,
          materials.bone,
          side * 0.28,
          2.48,
          0,
          0.14,
          1,
          0.14,
        ).rotation.z = side * -0.4;
        if (chapter >= 4) {
          const wing = part(
            body,
            cone,
            materials.iron,
            side * 1.0,
            1.6,
            -0.2,
            0.8,
            2.2,
            0.13,
          );
          wing.rotation.z = side * -0.9;
        }
      }
    }
  }
  const head = new T.Group();
  head.position.set(0, hound ? 0.7 : 1.75, hound ? 0.5 : 0);
  for (const piece of [...body.children]) {
    if (hound ? piece.position.z > 0.45 : piece.position.y > 1.76) {
      piece.position.sub(head.position);
      head.add(piece);
    }
  }
  root.add(head);
  batch(head);
  const lowerLimbs: T.Group[] = [];
  const tail = new T.Group();
  if (hound) {
    tail.position.set(0, 0.7, -0.6);
    part(tail, cone, skin, 0, 0.05, -0.3, 0.09, 0.7, 0.09).rotation.x =
      -Math.PI / 2;
    root.add(tail);
    batch(tail);
  }
  for (let i = 0; i < 4; i++) {
    const limb = new T.Group();
    const side = i % 2 ? 1 : -1;
    const arm = i >= 2;
    limb.position.set(
      side * (arm ? 0.48 : 0.2),
      hound ? 0.68 : arm ? 1.5 : 0.8,
      hound ? (arm ? -0.52 : 0.5) : 0,
    );
    const mat = type === "knight" ? materials.iron : skin;
    part(limb, cylinder, mat, 0, -0.14, 0, arm ? 0.12 : 0.14, 0.32, 0.13);
    const lower = new T.Group();
    lower.position.y = -0.3;
    limb.add(lower);
    lowerLimbs.push(lower);
    part(lower, cylinder, mat, 0, -0.14, 0, arm ? 0.1 : 0.12, 0.32, 0.11);
    part(lower, sphere, skin, 0, -0.31, 0.04, 0.12, 0.13, 0.14);
    if (!arm && !hound)
      part(lower, box, materials.black, 0, -0.42, 0.09, 0.23, 0.2, 0.34);
    if (arm && type === "knight" && side === 1)
      part(lower, box, materials.iron, 0, -0.45, 0.27, 0.1, 1.15, 0.08);
    root.add(limb);
    limbs.push(limb);
    batch(lower);
    batch(limb);
  }
  batch(body);
  if (large) root.scale.setScalar(type === "boss" ? 3.4 : 1.5);
  if (type === "witch") root.position.y = 0.4;
  const ice = new T.Mesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshBasicMaterial({
      color: 0x79ccea,
      transparent: true,
      opacity: 0.24,
      wireframe: true,
    }),
  );
  ice.position.y = 1.05;
  ice.scale.set(0.85, 1.2, 0.65);
  ice.visible = false;
  root.add(ice);
  const motion = new EnemyMotion(type);
  let physical = false;
  return {
    root,
    limbs,
    ice,
    animate: (dt, moving, frozen) => {
      if (physical || frozen) return;
      const pose = motion.step(
        dt,
        typeof moving === "number" ? moving : moving ? 2 : 0,
      );
      body.position.y = pose.bob;
      body.rotation.set(pose.lean, pose.twist, pose.roll);
      head.position.y = (hound ? 0.7 : 1.75) + pose.bob;
      head.rotation.set(
        pose.headX + pose.lean * 0.4,
        pose.headY,
        pose.roll * 0.5,
      );
      limbs.forEach((limb, i) => {
        if (hound || i < 2)
          limb.rotation.set(pose.legs[i], 0, (i % 2 ? 1 : -1) * 0.025);
        else limb.rotation.set(...pose.arms[i - 2]);
        lowerLimbs[i].rotation.x =
          hound || i < 2 ? pose.knees[i] : -pose.elbows[i - 2];
      });
      tail.rotation.y = pose.tail;
    },
    action: (name) => motion.action(name),
    steer: (angle) => {
      motion.turn = angle;
    },
    react: () => motion.action("hit"),
    physics: () => {
      physical = true;
      ice.visible = false;
    },
    dispose: () => {
      ice.material.dispose();
      root.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose();
      });
      root.removeFromParent();
    },
  };
}
export interface WeaponModel {
  root: T.Group;
  rotor: T.Group;
  flash: T.Mesh;
  mechanics?: (
    cycle: number,
    alt: boolean,
    dt: number,
    firing: boolean,
  ) => void;
  dispose: () => void;
}
export function weaponModel(id: number): WeaponModel {
  if (art.ready) return authoredWeapon(id);
  const root = new T.Group(),
    rotor = new T.Group();
  const { iron, black, brass, wood, blue } = materials;
  // Everything points down camera -Z.
  part(root, box, black, 0, 0, 0.05, 0.21, 0.2, 0.65);
  part(root, box, wood, 0, -0.15, 0.24, 0.17, 0.27, 0.32).rotation.x = -0.25;
  part(root, box, iron, 0, 0.09, -0.12, 0.24, 0.09, 0.55);
  part(root, box, brass, 0, 0.18, 0.06, 0.07, 0.07, 0.15);
  const barrel = (
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    mat: T.Material = iron,
  ) => {
    const m = part(root, cylinder, mat, x, y, z, r, len, r);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  if (id === 0) {
    barrel(0, 0, -0.4, 0.14, 0.6);
    rotor.position.z = -0.75;
    root.add(rotor);
    for (let i = 0; i < 5; i++) {
      const blade = new T.Group();
      blade.rotation.z = (i * Math.PI * 2) / 5;
      part(blade, box, iron, 0, 0.19, 0, 0.07, 0.38, 0.035).rotation.z = 0.4;
      part(blade, cone, iron, -0.08, 0.35, 0, 0.08, 0.17, 0.025).rotation.z =
        0.4;
      rotor.add(blade);
    }
    part(rotor, sphere, brass, 0, 0, 0, 0.12, 0.12, 0.09);
  }
  if (id === 1) {
    barrel(-0.07, 0.06, -0.45, 0.065, 0.8);
    barrel(0.07, 0.06, -0.45, 0.065, 0.8);
    barrel(0, -0.065, -0.26, 0.08, 0.35, wood);
    barrel(0, 0.13, -0.25, 0.032, 0.45, blue);
    for (let i = 0; i < 5; i++)
      part(root, box, black, 0, -0.02, -0.13 - i * 0.045, 0.24, 0.15, 0.025);
  }
  if (id === 2) {
    for (const x of [-0.12, 0.12])
      part(root, box, iron, x, 0.07, -0.44, 0.035, 0.08, 0.88);
    barrel(0, 0.08, -0.66, 0.04, 0.95, wood);
    part(root, cone, brass, 0, 0.08, -1.18, 0.05, 0.2, 0.05).rotation.x =
      -Math.PI / 2;
    barrel(0, -0.1, -0.27, 0.1, 0.5);
    part(root, box, brass, 0, 0.06, 0.17, 0.3, 0.21, 0.16);
  }
  if (id === 3) {
    barrel(0, 0.04, -0.44, 0.17, 0.94);
    barrel(0, 0.04, -0.92, 0.21, 0.08, brass);
    rotor.position.set(0.18, -0.1, -0.44);
    root.add(rotor);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      part(
        rotor,
        cylinder,
        iron,
        Math.sin(a) * 0.08,
        Math.cos(a) * 0.08,
        0,
        0.025,
        0.6,
        0.025,
      ).rotation.x = Math.PI / 2;
    }
    part(root, box, black, -0.19, 0, 0.03, 0.2, 0.25, 0.4);
  }
  if (id === 4) {
    barrel(0, 0.04, -0.3, 0.15, 0.5, brass);
    for (const x of [-0.15, 0.15]) {
      part(root, box, iron, x, 0.07, -0.52, 0.06, 0.1, 0.55);
      part(root, sphere, blue, x, 0.07, -0.8, 0.06, 0.07, 0.1);
    }
    for (let i = 0; i < 6; i++) {
      const ring = new T.Mesh(new T.TorusGeometry(0.12, 0.018, 6, 12), brass);
      ring.position.set(0, 0.04, -0.1 - i * 0.055);
      root.add(ring);
    }
    part(root, sphere, blue, 0, 0.04, -0.26, 0.07, 0.07, 0.28);
  }
  // Hands and sleeves anchor the weapon to the player.
  part(
    root,
    sphere,
    new T.MeshStandardMaterial({ color: 0x8c7764, roughness: 0.9 }),
    0.07,
    -0.16,
    0.22,
    0.12,
    0.12,
    0.17,
  );
  part(root, cylinder, black, 0.17, -0.25, 0.45, 0.15, 0.45, 0.15).rotation.x =
    0.9;
  part(root, sphere, materials.skin, -0.14, -0.14, -0.25, 0.105, 0.12, 0.15);
  part(root, cylinder, black, -0.3, -0.25, -0.09, 0.14, 0.46, 0.14).rotation.z =
    -0.9;
  const flash = new T.Mesh(
    new T.IcosahedronGeometry(0.16, 0),
    new T.MeshBasicMaterial({
      color: id === 4 ? 0x88efff : 0xffce78,
      transparent: true,
      opacity: 0.9,
    }),
  );
  flash.position.set(0, 0.03, -1.02);
  flash.scale.set(0.8, 0.8, 2);
  flash.visible = false;
  root.add(flash);
  root.position.set(0.36, -0.32, -0.65);
  return {
    root,
    rotor,
    flash,
    dispose: () => {
      root.removeFromParent();
    },
  };
}

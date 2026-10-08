import { art, hasArt } from "./assets";
import { authoredCemetery, authoredThemes } from "./authored-world";
import * as T from "three";
import { filterTexture } from "./fidelity";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type Level, type Theme } from "./data";
import { archSegments, rng, type Collider } from "./core";
import { GROUND_SURFACE, THEME_GROUND, ground } from "./grounds";
export interface Arena {
  root: T.Group;
  colliders: Collider[];
  portal: T.Group;
  lights: T.PointLight[];
  spawn: T.Vector3[];
  secret: T.Vector3;
  dispose: () => void;
}
const palettes: Partial<Record<Theme, [number, number, number, number]>> = {
  cemetery: [0x263a36, 0x77756a, 0x212e2b, 0xcdaa77],
  cathedral: [0x253137, 0x8b8271, 0x30363b, 0xdd8e3f],
  crypt: [0x151f24, 0x67706c, 0x272e30, 0x58b9ac],
  prison: [0x222e31, 0x777974, 0x353b3a, 0xd99458],
  opera: [0x301b24, 0x806852, 0x3d1720, 0xd2a55c],
  asylum: [0x263437, 0x95a29a, 0x3e514d, 0x8ec6b2],
  snow: [0x485969, 0x9bafbc, 0x607987, 0xaccfee],
  town: [0x3d3431, 0x9c8875, 0x504035, 0xffa257],
  swamp: [0x263827, 0x67714b, 0x203b2b, 0xb9c777],
  station: [0x313c41, 0x7b8080, 0x343f46, 0xeaab69],
  factory: [0x382b27, 0x756b5d, 0x45392d, 0xff762d],
  military: [0x333d31, 0x73795d, 0x3a4233, 0xd6c786],
  ruins: [0x51402b, 0xae956b, 0x6a533a, 0xffcf83],
  castle: [0x2d303e, 0x7b7882, 0x323449, 0x98afee],
  palace: [0x403141, 0xaf9b85, 0x59384e, 0xe9bf77],
  babel: [0x4c382f, 0xaa825a, 0x644a35, 0xfcb474],
  forest: [0x172e2a, 0x676c53, 0x253b2b, 0x92bda7],
  tower: [0x222b41, 0x828997, 0x2d3452, 0x9dbcf7],
  water: [0x233d45, 0x86938a, 0x315557, 0x90caca],
  docks: [0x24333f, 0x83776b, 0x344955, 0xb0c8dc],
  monastery: [0x353c38, 0x9a9984, 0x3b453d, 0xdfd4a2],
  hell: [0x391411, 0x66443a, 0x2b1919, 0xff683a],
};
function texture(seed: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const random = rng(seed);
  ctx.fillStyle = "#94928a";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = -64; x < 256; x += 64) {
      const xx = x + ((y / 32) % 2) * 32;
      const value = 90 + random() * 60;
      ctx.fillStyle = `rgb(${value},${value},${value * 0.95})`;
      ctx.fillRect(xx + 1, y + 1, 62, 30);
      ctx.strokeStyle = "#b0aaa0";
      ctx.strokeRect(xx + 2, y + 2, 59, 27);
    }
  }
  for (let i = 0; i < 12000; i++) {
    const v = random() > 0.5 ? 210 : 20;
    ctx.fillStyle = `rgba(${v},${v},${v},${random() * 0.13})`;
    ctx.fillRect(random() * 256, random() * 256, random() * 3 + 1, 1);
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  return filterTexture(t, 4);
}
/** Ground colour per theme, multiplied over its texture. */
const GROUND_TINT: Partial<Record<Theme, number>> = {
  prison: 0x8c8a86,
  castle: 0xa4a9b8,
  tower: 0x8f97b4,
  monastery: 0xd8d4c0,
  water: 0xa7b4b0,
  babel: 0xc4ab88,
  palace: 0xcfc6bc,
  ruins: 0xb9a688,
  town: 0xc8b8a4,
  forest: 0xa9b29a,
};
type Builders = {
  box: (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat?: T.Material,
  ) => T.Mesh;
  cyl: (
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    mat?: T.Material,
    n?: number,
  ) => T.Mesh;
  mesh: (
    geo: T.BufferGeometry,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
  ) => T.Mesh;
  mats: T.Material[];
  metal: T.Material;
  rust: T.Material;
  dark: T.Material;
  trim: T.Material;
};
function material(
  mats: T.Material[],
  parameters: T.MeshStandardMaterialParameters,
  flat = false,
) {
  const m = new T.MeshStandardMaterial(parameters);
  m.userData.flat = flat;
  mats.push(m);
  return m;
}
const plinthIce = new WeakMap<T.Material[], T.Material>();
/** The four torch plinths take a form that belongs to the theme. Never solid. */
function plinth(theme: Theme, x: number, z: number, b: Builders) {
  if (theme === "snow") {
    // The frozen pools' material, so the ice blocks add no draw call of their own.
    if (!plinthIce.has(b.mats))
      plinthIce.set(
        b.mats,
        material(b.mats, { color: 0x9fc4dc, roughness: 0.06, metalness: 0.35 }),
      );
    const ice = plinthIce.get(b.mats)!;
    b.box(x, 0.4, z, 0.95, 0.8, 0.95, ice);
  } else if (["docks", "station", "military"].includes(theme)) {
    b.cyl(x, 0.4, z, 0.42, 0.42, 0.8, b.rust, 14);
    b.cyl(x, 0.81, z, 0.44, 0.44, 0.04, b.metal, 14);
  } else if (theme === "hell") {
    b.cyl(x, 0.4, z, 0.3, 0.55, 0.8, b.dark, 6);
  } else if (theme === "asylum" || theme === "palace") {
    b.cyl(x, 0.05, z, 0.4, 0.45, 0.1, b.metal, 12);
    b.cyl(x, 0.45, z, 0.07, 0.07, 0.8, b.metal, 8);
  } else if (theme === "forest" || theme === "swamp") {
    b.cyl(x, 0.4, z, 0.38, 0.45, 0.8, b.trim, 9);
  } else b.box(x, 0.4, z, 0.9, 0.8, 0.9, b.dark);
}
/**
 * Cosmetic dressing that gives each procedural theme its own look. Everything here is
 * flat, overhead or against the walls, and none of it is solid, so encounter layouts
 * and balance are unchanged (tests/fixtures/arena-colliders.json guards this).
 */
function dressTheme(
  theme: Theme,
  random: () => number,
  b: Builders & {
    wood: T.Material;
    gold: T.Material;
    red: T.Material;
    wallH: number;
  },
) {
  const pool = (x: number, z: number, r: number, mat: T.Material, y = 0.03) => {
    const m = b.mesh(new T.CircleGeometry(r, 24), mat, x, y, z);
    m.rotation.x = -Math.PI / 2;
    m.scale.y = 0.55 + random() * 0.45;
    return m;
  };
  const walls = (
    fn: (x: number, z: number, side: number) => void,
    step = 6,
  ) => {
    for (let z = -28; z <= 28; z += step)
      for (const side of [-1, 1]) fn(side * 25.7, z, side);
  };
  if (theme === "snow") {
    const snow = material(b.mats, { color: 0xf1f5f8, roughness: 0.82 });
    const ice = material(
      b.mats,
      {
        color: 0x9fc4dc,
        roughness: 0.06,
        metalness: 0.35,
      },
      true,
    );
    plinthIce.set(b.mats, ice);
    // Drifts banked against the walls, snow on the wall tops, frozen pools.
    walls((x, z, side) => {
      const m = b.mesh(
        new T.SphereGeometry(1, 10, 6),
        snow,
        x - side * 0.6,
        -0.1,
        z + random() * 3,
      );
      m.scale.set(1.2 + random(), 0.55 + random() * 0.45, 1.8 + random() * 1.5);
    }, 4);
    for (const z of [-31.6, 31.6])
      b.box(0, b.wallH + 0.05, z, 55, 0.12, 1.7, snow);
    for (const x of [-26.95, 26.95])
      b.box(x, b.wallH + 0.05, 0, 1.7, 0.12, 65, snow);
    for (let i = 0; i < 5; i++)
      pool(
        (random() - 0.5) * 36,
        -26 + i * 12 + random() * 4,
        1.6 + random() * 1.8,
        ice,
      );
  } else if (theme === "swamp" || theme === "forest") {
    const murk = material(
      b.mats,
      {
        color: theme === "swamp" ? 0x1d2a1c : 0x2a2a1a,
        roughness: 0.08,
        metalness: 0.5,
      },
      true,
    );
    const reed = material(b.mats, { color: 0x6f6a36, roughness: 0.9 });
    const count = theme === "swamp" ? 9 : 4;
    for (let i = 0; i < count; i++) {
      const x = (random() > 0.5 ? 1 : -1) * (5 + random() * 19),
        z = -27 + random() * 54;
      pool(x, z, 1.4 + random() * 2.4, murk);
      for (let k = 0; k < 7; k++) {
        const a = random() * Math.PI * 2;
        const m = b.mesh(
          new T.ConeGeometry(0.035, 1.1 + random() * 0.9, 4),
          reed,
          x + Math.cos(a) * 1.6,
          0.6,
          z + Math.sin(a) * 1.1,
        );
        m.rotation.z = (random() - 0.5) * 0.3;
      }
    }
    if (theme === "forest") {
      const cap = material(b.mats, { color: 0x9a3b22, roughness: 0.7 });
      walls((x, z) => {
        if (random() > 0.5) return;
        b.cyl(x, 0.12, z, 0.05, 0.06, 0.24, b.trim, 6);
        const m = b.mesh(
          new T.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
          cap,
          x,
          0.22,
          z,
        );
        m.scale.y = 0.6;
      }, 3);
    }
  } else if (theme === "asylum") {
    // Fluorescent strips under the ceiling and a pale tiled wainscot.
    const tube = material(b.mats, {
      color: 0xdff6ee,
      emissive: 0xc8fff0,
      emissiveIntensity: 0.7,
    });
    const wainscot = material(b.mats, { color: 0x9fb8a8, roughness: 0.35 });
    // Housed tubes, short enough not to streak across the view.
    for (let z = -24; z <= 24; z += 8)
      for (const x of [-8, 8]) {
        b.box(x, 7.44, z, 0.34, 0.1, 1.6, b.metal);
        b.box(x, 7.38, z, 0.14, 0.04, 1.4, tube);
      }
    for (const x of [-26.2, 26.2]) b.box(x, 0.7, 0, 0.04, 1.4, 64, wainscot);
  } else if (theme === "prison") {
    // Straw in the cells, rusted drains and hanging chains.
    const straw = material(b.mats, { color: 0x8d7442, roughness: 1 }, true);
    for (const side of [-1, 1])
      for (let z = -25; z < 26; z += 8)
        pool(side * 20.5, z + 2 + random() * 3, 1.3, straw, 0.025);
    for (let z = -20; z <= 20; z += 10)
      b.box(0, 0.035, z, 0.9, 0.02, 0.9, b.rust);
    for (let z = -24; z <= 24; z += 12)
      for (const x of [-10, 10]) b.cyl(x, 6.2, z, 0.03, 0.03, 3.6, b.metal, 4);
  } else if (theme === "opera") {
    // Footlights along the stage lip, a red carpet and boxes of gilt.
    const lamp = material(b.mats, {
      color: 0xffe2a6,
      emissive: 0xffc46a,
      emissiveIntensity: 2,
    });
    for (let x = -16; x <= 16; x += 2)
      b.mesh(new T.SphereGeometry(0.12, 8, 6), lamp, x, 0.45, -16.9);
    b.box(0, 0.035, 8, 4.2, 0.02, 44, b.red);
  } else if (theme === "town" || theme === "castle") {
    // Awnings or banners on the house fronts, above head height.
    const cloth =
      theme === "town"
        ? [0x6e2a22, 0x2f4a5a, 0x6b5a2a, 0x3d4f2c]
        : [0x5b1a1e, 0x1f2a4f];
    const mats = cloth.map((color) =>
      material(b.mats, { color, roughness: 0.95, side: T.DoubleSide }),
    );
    for (let z = -25; z <= 24; z += 12)
      for (const side of [-1, 1]) {
        const mat = mats[Math.floor(random() * mats.length)];
        if (theme === "town") {
          const m = b.box(side * 17.6, 3.3, z, 1.8, 0.06, 4.5, mat);
          m.rotation.z = side * 0.35;
        } else b.box(side * 18.45, 5.2, z, 0.05, 4.2, 1.6, mat);
      }
  } else if (theme === "palace") {
    // Chandeliers hang over the aisle.
    const candle = material(b.mats, {
      color: 0xffe0a0,
      emissive: 0xffb84a,
      emissiveIntensity: 2.2,
    });
    for (const z of [-14, 4, 20]) {
      const ring = b.mesh(
        new T.TorusGeometry(1.4, 0.06, 6, 24),
        b.gold,
        0,
        8.5,
        z,
      );
      ring.rotation.x = Math.PI / 2;
      b.cyl(0, 10.2, z, 0.03, 0.03, 3.4, b.gold, 4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.mesh(
          new T.SphereGeometry(0.08, 6, 4),
          candle,
          Math.cos(a) * 1.4,
          8.7,
          z + Math.sin(a) * 1.4,
        );
      }
    }
  } else if (theme === "station") {
    // Yellow safety lines along both platform edges.
    const paint = material(b.mats, { color: 0xd9b23a, roughness: 0.6 }, true);
    for (const x of [-12.4, 12.4]) b.box(x, 0.035, 0, 0.3, 0.02, 60, paint);
  } else if (theme === "military") {
    // Sandbags along the walls, wire coiled on top.
    const bag = material(b.mats, { color: 0x6b6047, roughness: 1 });
    walls((x, z) => {
      for (let k = 0; k < 3; k++) {
        const m = b.mesh(
          new T.SphereGeometry(0.5, 8, 5),
          bag,
          x,
          0.22 + k * 0.32,
          z + (k % 2) * 0.4,
        );
        m.scale.set(0.55, 0.32, 1);
      }
    }, 2.4);
    for (const x of [-26.7, 26.7]) {
      const coil = b.mesh(
        new T.TorusGeometry(0.35, 0.015, 4, 12),
        b.metal,
        x,
        b.wallH + 0.4,
        0,
      );
      coil.scale.set(1, 1, 90);
    }
  } else if (theme === "docks") {
    // Rope coils and bollards along the quay.
    const rope = material(b.mats, { color: 0x8b7450, roughness: 1 });
    for (let z = -26; z <= 26; z += 9)
      for (const side of [-1, 1]) {
        b.cyl(side * 25.3, 0.35, z, 0.22, 0.28, 0.7, b.metal, 10);
        const coil = b.mesh(
          new T.TorusGeometry(0.45, 0.07, 5, 16),
          rope,
          side * 24.4,
          0.07,
          z + 2,
        );
        coil.rotation.x = Math.PI / 2;
      }
  } else if (theme === "ruins" || theme === "babel") {
    // Wind-blown sand banks and scattered potsherds.
    const sand = material(b.mats, {
      color: theme === "babel" ? 0xc9a676 : 0xb89c70,
      roughness: 1,
    });
    walls((x, z, side) => {
      const m = b.mesh(
        new T.SphereGeometry(1, 10, 5),
        sand,
        x - side * 0.5,
        -0.3,
        z + random() * 3,
      );
      m.scale.set(1.6 + random(), 0.5 + random() * 0.4, 2.4 + random() * 2);
    }, 5);
  } else if (theme === "tower") {
    // A star-chart inlay in the floor.
    for (const r of [5.5, 8]) {
      const ring = b.mesh(
        new T.TorusGeometry(r, 0.06, 4, 64),
        b.gold,
        0,
        0.04,
        0,
      );
      ring.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = b.box(
        Math.cos(a) * 6.75,
        0.04,
        Math.sin(a) * 6.75,
        0.08,
        0.02,
        2.4,
        b.gold,
      );
      m.rotation.y = -a;
    }
  } else if (theme === "monastery") {
    // Votive candles along the wall bases.
    const wax = material(b.mats, { color: 0xe9dfc4, roughness: 0.7 });
    const wick = material(b.mats, {
      color: 0xffd28a,
      emissive: 0xffb04a,
      emissiveIntensity: 2,
    });
    walls((x, z) => {
      for (let k = 0; k < 4; k++) {
        const h = 0.15 + random() * 0.25,
          cx = x + (random() - 0.5) * 0.6,
          cz = z + (random() - 0.5) * 1.6;
        b.cyl(cx, h / 2, cz, 0.05, 0.05, h, wax, 6);
        b.mesh(new T.SphereGeometry(0.035, 5, 4), wick, cx, h + 0.05, cz);
      }
    }, 4);
  } else if (theme === "water") {
    // Puddles across the flooded squares.
    const puddle = material(
      b.mats,
      {
        color: 0x24414a,
        roughness: 0.05,
        metalness: 0.6,
      },
      true,
    );
    for (let i = 0; i < 8; i++)
      pool(
        (random() - 0.5) * 34,
        -27 + random() * 54,
        0.8 + random() * 1.6,
        puddle,
      );
  } else if (theme === "hell") {
    // Bone piles against the walls.
    const bone = material(b.mats, { color: 0xc9bfa6, roughness: 0.8 });
    walls((x, z) => {
      if (random() > 0.6) return;
      for (let k = 0; k < 6; k++) {
        const m = b.cyl(
          x + (random() - 0.5),
          0.08,
          z + (random() - 0.5) * 1.4,
          0.04,
          0.05,
          0.7,
          bone,
          5,
        );
        m.rotation.set(Math.PI / 2, random() * Math.PI, 0);
      }
    }, 5);
  }
}
export function buildArena(scene: T.Scene, level: Level, room: number): Arena {
  // A deferred scene still downloading falls back to its procedural arena; this only
  // happens for a menu backdrop, because Game.start() waits for the scene.
  if (art.ready && authoredThemes.has(level.theme) && hasArt(level.theme))
    return authoredCemetery(scene, room, level.theme);
  const random = rng(level.seed + room * 191);
  const root = new T.Group();
  scene.add(root);
  const colliders: Collider[] = [];
  const lights: T.PointLight[] = [];
  const flamePositions: T.Vector3[] = [];
  const colors = palettes[level.theme]!;
  scene.background = new T.Color(colors[0]);
  scene.fog = new T.FogExp2(colors[0], level.theme === "crypt" ? 0.027 : 0.014);
  const tex = texture(level.seed);
  const stone = new T.MeshStandardMaterial({
    color: colors[1],
    map: tex,
    roughness: 0.96,
  });
  const dark = new T.MeshStandardMaterial({
    color: colors[2],
    map: tex,
    roughness: 1,
  });
  const trim = new T.MeshStandardMaterial({ color: colors[1], roughness: 0.8 });
  const metal = new T.MeshStandardMaterial({
    color: 0x383a37,
    metalness: 0.75,
    roughness: 0.5,
  });
  const rust = new T.MeshStandardMaterial({
    color: 0x795542,
    metalness: 0.55,
    roughness: 0.82,
  });
  const wood = new T.MeshStandardMaterial({ color: 0x4e3b2a, roughness: 1 });
  const gold = new T.MeshStandardMaterial({
    color: 0xb89960,
    metalness: 0.7,
    roughness: 0.35,
  });
  const flame = new T.MeshBasicMaterial({ color: 0xffba61 });
  const glow = new T.MeshBasicMaterial({ color: colors[3] });
  // With bloom on (High and Ultra) these burn brighter than white, so they glow.
  flame.userData.glow = 2.6;
  glow.userData.glow = 1.6;
  const red = new T.MeshStandardMaterial({ color: 0x591e24, roughness: 1 });
  if (art.ready) {
    for (const [target, name] of [
      [stone, "Weathered limestone"],
      [dark, "Weathered limestone"],
      [trim, "Weathered limestone"],
      [wood, "Oiled walnut"],
      [rust, "Rust blooms"],
      [metal, "Armory / iron"],
      [gold, "Armory / brass"],
    ] as const) {
      const source = art.materials.get(name);
      if (source) {
        target.map = source.map;
        target.normalMap = source.normalMap;
        target.roughnessMap = source.roughnessMap;
        if (source.metalnessMap) {
          target.metalnessMap = source.metalnessMap;
          target.metalness = 1;
          target.color.set(0xffffff);
          target.roughness = 1;
        }
        target.normalScale.setScalar(0.65);
      }
    }
  }
  const mats = [stone, dark, trim, metal, rust, wood, gold, flame, glow, red];
  const mesh = (
    geo: T.BufferGeometry,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material = stone,
    solid = false,
  ) => {
    const geo = new T.BoxGeometry(w, h, d);
    const uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        (uv.getX(i) * (i < 8 ? d : w)) / 4,
        (uv.getY(i) * (i >= 8 && i < 16 ? d : h)) / 4,
      );
    }
    const m = mesh(geo, mat, x, y, z);
    if (solid) colliders.push({ x, z, w, d, h: y + h / 2 });
    return m;
  };
  const cyl = (
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    mat: T.Material = stone,
    n = 10,
  ) => mesh(new T.CylinderGeometry(rt, rb, h, n), mat, x, y, z);
  const beam = (
    a: T.Vector3,
    b: T.Vector3,
    r: number,
    mat: T.Material = wood,
  ) => {
    const m = cyl(0, 0, 0, r * 0.65, r, a.distanceTo(b), mat, 7);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return m;
  };
  const cross = (
    x: number,
    y: number,
    z: number,
    s = 1,
    mat: T.Material = trim,
  ) => {
    box(x, y + s * 1.1, z, 0.22 * s, 2.2 * s, 0.24 * s, mat);
    box(x, y + s * 1.5, z, s * 1.25, 0.22 * s, 0.24 * s, mat);
  };
  const arch = (
    x: number,
    z: number,
    width = 5,
    height = 8,
    depth = 1,
    mat: T.Material = stone,
    rotation = 0,
    solidPiers = false,
  ) => {
    const group = new T.Group();
    root.add(group);
    const created: T.Object3D[] = [];
    const sideH = height - width * 0.5;
    if (sideH > 0)
      created.push(
        box(-width / 2, sideH / 2, 0, 0.8, sideH, depth, mat),
        box(width / 2, sideH / 2, 0, 0.8, sideH, depth, mat),
      );
    if (solidPiers && rotation === 0)
      for (const side of [-1, 1])
        colliders.push({
          x: x + (side * width) / 2,
          z,
          w: 0.8,
          d: depth,
          h: Math.max(sideH, 3),
        });
    for (const s of archSegments(width, height)) {
      const m = box(s.x, s.y, 0, s.tangential, s.radial, depth, mat);
      m.rotation.z = s.rotation;
      created.push(m);
    }
    for (const m of created) group.attach(m);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return group;
  };
  const torch = (x: number, z: number, y = 2.4, light = false) => {
    cyl(x, y - 0.45, z, 0.1, 0.18, 1, metal);
    cyl(x, y, z, 0.25, 0.13, 0.2, metal);
    flamePositions.push(new T.Vector3(x, y + 0.3, z));
    const f = mesh(new T.IcosahedronGeometry(0.23, 1), flame, x, y + 0.3, z);
    f.scale.set(0.7, 1.8, 0.7);
    if (light) {
      const l = new T.PointLight(0xffa255, 30, 13, 1.7);
      l.position.set(x, y + 0.6, z);
      root.add(l);
      lights.push(l);
    }
  };
  const tree = (x: number, z: number, height = 7) => {
    cyl(x, height * 0.45, z, 0.2, 0.65, height, wood, 7);
    colliders.push({ x, z, w: 1.2, d: 1.2, h: height });
    for (let b = 0; b < 5; b++) {
      const a = b * 2.4 + random(),
        y = height * (0.4 + random() * 0.4),
        len = 2 + random() * 2;
      const start = new T.Vector3(x, y, z),
        end = new T.Vector3(
          x + Math.cos(a) * len,
          y + len * 0.7,
          z + Math.sin(a) * len,
        );
      beam(start, end, 0.18);
      beam(
        end,
        end.clone().add(new T.Vector3(Math.sin(a) * 1.4, 1.6, Math.cos(a))),
        0.07,
      );
    }
  };
  const column = (x: number, z: number, h = 9) => {
    box(x, 0.25, z, 1.8, 0.5, 1.8, trim);
    cyl(x, h * 0.5, z, 0.45, 0.6, h, stone, 12);
    box(x, h - 0.4, z, 1.5, 0.6, 1.5, trim);
    colliders.push({ x, z, w: 1.3, d: 1.3, h });
  };
  const building = (
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material = stone,
  ) => {
    box(x, h * 0.5, z, w, h, d, mat);
    box(x, h + 0.15, z, w + 0.6, 0.4, d + 0.6, dark);
    for (let y = 2; y < h - 1; y += 3) {
      for (let xx = x - w / 2 + 1.6; xx < x + w / 2; xx += 2.4) {
        box(xx, y, z + d / 2 + 0.03, 0.8, 1.6, 0.08, dark);
        box(xx, y, z + d / 2 + 0.09, 0.12, 1.6, 0.1, metal);
      }
    }
  };
  // Shared floor, perimeter and a navigable central aisle. Each theme has its own ground;
  // its dressing below is cosmetic only and never adds colliders or draws on `random`.
  const kind = THEME_GROUND[level.theme] || "flagstone";
  const surface = GROUND_SURFACE[kind],
    groundTex = ground(kind);
  const floor = new T.MeshStandardMaterial({
    color: GROUND_TINT[level.theme] ?? 0xffffff,
    map: groundTex.map,
    roughness: surface.roughness,
    metalness: surface.metalness ?? 0,
    ...(groundTex.glow
      ? {
          emissive: 0xff5a1e,
          emissiveMap: groundTex.glow,
          emissiveIntensity: 1.6,
        }
      : {}),
  });
  const aisle =
    kind === "flagstone"
      ? stone
      : new T.MeshStandardMaterial({
          color: new T.Color(
            GROUND_TINT[level.theme] ?? 0xffffff,
          ).multiplyScalar(0.72),
          map: groundTex.map,
          roughness: Math.min(1, surface.roughness + 0.08),
        });
  floor.userData.flat = true;
  if (aisle !== stone) aisle.userData.flat = true;
  mats.push(floor, aisle);
  box(0, -0.3, 0, 60, 0.6, 72, floor);
  box(0, 0.018, 0, 7, 0.025, 64, aisle);
  const wallH = ["crypt", "prison", "asylum"].includes(level.theme) ? 7 : 2.6;
  box(-27, wallH / 2, 0, 1.5, wallH, 65, stone, true);
  box(27, wallH / 2, 0, 1.5, wallH, 65, stone, true);
  box(0, wallH / 2, 32, 55, wallH, 1.5, stone, true);
  box(0, wallH / 2, -32, 55, wallH, 1.5, stone, true);
  for (let z = -28; z <= 28; z += 8) {
    for (const x of [-26.7, 26.7]) {
      box(x, wallH / 2 + 0.25, z, 2, wallH + 0.5, 1.8, dark);
      if (z % 16 === 4) torch(x * 0.92, z, 2.5);
    }
  }
  const theme = level.theme;
  if (["cemetery", "forest", "swamp", "monastery"].includes(theme)) {
    for (let z = -22; z < 25; z += 7) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < (theme === "cemetery" ? 3 : 1); i++) {
          const x = side * (8 + i * 6) + random();
          if (theme === "cemetery") {
            const h = 0.8 + random() * 0.8;
            box(x, h / 2, z, 1, h, 0.35, stone, true);
            mesh(
              new T.CylinderGeometry(0.5, 0.5, 0.36, 12),
              stone,
              x,
              h,
              z,
            ).rotation.x = Math.PI / 2;
            box(x, 0.08, z + 1.2, 1.4, 0.15, 2.5, trim);
            if (random() > 0.45) cross(x, h + 0.1, z, 0.5);
          } else tree(side * (13 + random() * 10), z, 5 + random() * 6);
        }
      }
    }
    if (theme === "cemetery" || theme === "monastery") {
      building(0, -40, 15, 14, 9);
      arch(0, -35.3, 5, 10);
      box(0, 4, -35.15, 4, 8, 0.12, dark);
      for (const x of [-10, 10]) {
        building(x, -40, 5, 21, 7);
        mesh(new T.ConeGeometry(4, 8, 4), dark, x, 25, -40).rotation.y =
          Math.PI / 4;
        cross(x, 29, -40, 1.4);
      }
      cross(0, 14, -40, 1.9);
      for (const x of [-6, -4, 4, 6]) {
        box(x, 6, -35.25, 0.45, 12, 0.6, trim);
        box(x, 11, -34.9, 0.65, 0.3, 0.8, trim);
      }
      for (const x of [-4.8, 4.8]) {
        arch(x, -35.2, 1.7, 8, 0.25, trim);
        box(x, 5.2, -35.02, 1.3, 4.5, 0.09, glow);
        box(x, 5.2, -34.94, 0.09, 4.5, 0.12, metal);
        box(x, 5.5, -34.94, 1.4, 0.09, 0.12, metal);
      }
      const rose = mesh(
        new T.TorusGeometry(1.6, 0.17, 8, 24),
        trim,
        0,
        11.2,
        -35.1,
      );
      mesh(new T.CircleGeometry(1.45, 16), glow, 0, 11.2, -35.12);
      for (let a = 0; a < Math.PI; a += Math.PI / 6) {
        const bar = box(0, 11.2, -34.99, 0.09, 3.05, 0.16, metal);
        bar.rotation.z = a;
      }
      for (const x of [-10, 10])
        for (const xx of [-1, 1]) {
          box(x + xx * 1.9, 15, -36.4, 0.3, 12, 0.35, trim);
          box(x + xx * 0.7, 17, -36.42, 0.45, 3, 0.08, dark);
        }
      for (let i = 0; i < 4; i++)
        box(0, 0.08 + i * 0.12, -33.7 - i * 0.5, 7 - i * 0.35, 0.16, 0.8, trim);
      for (const x of [-19, 19]) {
        building(x, -20, 5, 4, 5);
        cross(x, 4, -20, 0.8);
      }
      for (const x of [-21, 21]) tree(x, 19, 9);
    }
    if (theme === "swamp") {
      const water = new T.MeshStandardMaterial({
        color: 0x3b5843,
        metalness: 0.6,
        roughness: 0.22,
        transparent: true,
        opacity: 0.7,
      });
      mats.push(water);
      box(-15, 0.03, 0, 18, 0.04, 57, water);
      box(15, 0.03, 0, 18, 0.04, 57, water);
      for (let i = 0; i < 18; i++) {
        const x = (random() - 0.5) * 48,
          z = (random() - 0.5) * 54;
        if (Math.abs(x) > 5) {
          cyl(x, 0.6, z, 0.4, 0.8, 1.2, dark);
        }
      }
    }
  }
  if (
    ["cathedral", "crypt", "palace", "opera", "tower", "monastery"].includes(
      theme,
    )
  ) {
    const high = theme === "crypt" ? 6 : 13;
    for (const z of [-22, -8, 6, 20]) {
      column(-15, z, high);
      column(15, z, high);
      arch(0, z, 29, high + 5, 0.8, trim);
    }
    for (const x of [-25, 25])
      for (let z = -22; z <= 22; z += 11) {
        arch(x, z, 6, high, 1, trim, Math.PI / 2);
        box(x, high * 0.58, z, 0.18, high * 0.45, 3, glow);
      }
    if (theme === "crypt") {
      box(0, 8.5, 0, 56, 1, 66, dark);
      for (const x of [-20, 20])
        for (let z = -22; z < 24; z += 9) {
          box(x, 1, z, 3, 2, 5, stone, true);
          box(x, 2.1, z, 3.4, 0.3, 5.4, trim);
        }
    }
    if (theme === "opera") {
      box(0, 0.2, -23, 35, 0.4, 12, wood);
      for (const x of [-20, 20]) {
        box(x, 6, -24, 7, 12, 3, red, true);
        for (let z = -20; z < 28; z += 8) {
          box(x, 5, z, 9, 0.5, 5, gold);
        }
      }
      for (let z = -6; z < 22; z += 5)
        for (const x of [-9, 9]) box(x, 0.7, z, 8, 1.4, 1.6, red, true);
      box(0, 11, -27, 42, 3, 2, red);
    }
    if (theme === "palace") {
      for (const x of [-10, 10])
        for (const z of [-12, 12]) {
          cyl(x, 0.5, z, 1.8, 2, 1, trim);
          mesh(new T.IcosahedronGeometry(1.3, 0), gold, x, 2, z);
          colliders.push({ x, z, w: 3.6, d: 3.6, h: 3 });
        }
      box(0, 0.04, 0, 4, 0.04, 58, red);
    }
  }
  if (["town", "water", "castle", "babel"].includes(theme)) {
    for (const side of [-1, 1])
      for (let z = -25; z <= 24; z += 12) {
        const h = 8 + random() * 9;
        building(side * 23, z, 9, h, 10);
        box(side * 18, 2, z, 1, 4, 2, wood, true);
        if (theme === "castle" || theme === "babel") {
          for (let zz = z - 4; zz <= z + 4; zz += 2)
            box(side * 23, h + 1, zz, 9, 1.5, 1, stone);
        }
      }
    if (theme === "babel") {
      for (let i = 0; i < 7; i++)
        box(0, 3 + i * 4, -43, 30 - i * 3, 4, 24 - i * 2, stone);
    }
    if (theme === "water") {
      const water = new T.MeshStandardMaterial({
        color: 0x356779,
        metalness: 0.8,
        roughness: 0.18,
      });
      mats.push(water);
      box(-12, 0.035, 0, 6, 0.025, 59, water);
      box(12, 0.035, 0, 6, 0.025, 59, water);
      for (let z = -18; z < 24; z += 14) {
        box(0, 0.1, z, 37, 0.2, 4, stone);
      }
    }
  }
  if (["prison", "asylum"].includes(theme)) {
    for (const side of [-1, 1])
      for (let z = -25; z < 26; z += 8) {
        box(side * 21, 3, z, 11, 6, 0.6, stone, true);
        for (let zz = z + 0.5; zz < z + 7.5; zz += 0.75)
          cyl(side * 16, 2.5, zz, 0.07, 0.07, 5, metal, 5);
        box(side * 22, 0.5, z + 4, 3, 1, 5, metal, true);
        if (theme === "asylum") {
          box(side * 22, 1.1, z + 4, 3, 0.25, 5, trim);
          box(side * 25, 3, z + 4, 0.2, 1.4, 2, glow);
        }
      }
    box(0, 8, 0, 55, 1, 66, dark);
  }
  if (["station", "factory", "military", "docks"].includes(theme)) {
    for (const x of [-23, 23])
      for (const z of [-24, -8, 8, 24]) {
        box(x, 6, z, 0.5, 12, 0.5, metal);
        beam(
          new T.Vector3(x, 10, z),
          new T.Vector3(x * 0.5, 15, z),
          0.2,
          metal,
        );
      }
    if (theme === "station") {
      for (const x of [-15, 15]) {
        for (const dx of [-1, 1]) box(x + dx, 0.09, 0, 0.12, 0.18, 60, metal);
        for (let z = -28; z < 28; z += 2) box(x, 0.07, z, 3, 0.1, 0.35, wood);
        for (let z = -17; z < 20; z += 17) {
          box(x, 2.2, z, 6, 4, 13, theme === "station" ? rust : metal, true);
          box(x, 4.3, z, 6.2, 0.4, 13.3, metal);
          for (let zz = z - 4; zz <= z + 4; zz += 2)
            box(x + (x < 0 ? 3.02 : -3.02), 2.8, zz, 0.08, 1.2, 1.2, dark);
        }
      }
    } else if (theme === "factory") {
      for (const x of [-16, 16])
        for (const z of [-18, 2, 20]) {
          cyl(x, 3, z, 2.7, 2.7, 6, rust, 16);
          cyl(x, 6.2, z, 3, 2.7, 0.4, metal, 16);
          colliders.push({ x, z, w: 5.5, d: 5.5, h: 6 });
          beam(
            new T.Vector3(x, 7, z),
            new T.Vector3(x, 7, z + 13),
            0.55,
            metal,
          );
          torch(x * 0.65, z, 3, true);
        }
    } else {
      for (let i = 0; i < 12; i++) {
        const x = (i % 2 ? 1 : -1) * (10 + random() * 10),
          z = -23 + Math.floor(i / 2) * 9;
        box(x, 1.2, z, 3.5, 2.4, 4.5, theme === "docks" ? wood : dark, true);
        box(x, 2.5, z, 3.6, 0.2, 4.6, metal);
      }
    }
    if (theme === "docks") {
      for (const x of [-33, 33]) {
        box(
          x,
          -0.12,
          0,
          8,
          0.08,
          70,
          new T.MeshStandardMaterial({
            color: 0x27444c,
            metalness: 0.8,
            roughness: 0.2,
          }),
        );
        for (const z of [-20, 15]) {
          box(x, 12, z, 0.6, 24, 0.6, metal);
          box(x - 4, 23, z, 13, 0.5, 0.5, metal);
          beam(
            new T.Vector3(x, 23, z),
            new T.Vector3(x - 9, 19, z),
            0.12,
            metal,
          );
        }
      }
    }
  }
  if (theme === "snow") {
    for (let z = -24; z <= 24; z += 12) {
      arch(0, z, 40, 24, 1.2, trim, 0, true);
      for (const x of [-20, 20]) {
        box(x, 0.2, z, 7, 0.4, 8, trim);
      }
    }
    for (const x of [-42, 42])
      for (let z = -40; z < 50; z += 20) {
        const m = mesh(
          new T.ConeGeometry(16, 25 + random() * 15, 5),
          trim,
          x,
          6,
          z,
        );
        m.rotation.y = random();
      }
  }
  if (theme === "ruins") {
    for (const x of [-16, 16])
      for (const z of [-20, -5, 10, 24]) column(x, z, 4 + random() * 8);
    for (let i = 0; i < 15; i++) {
      const x = (random() > 0.5 ? 1 : -1) * (7 + random() * 17),
        z = (random() - 0.5) * 48;
      const m = box(x, 0.5, z, 1 + random() * 2, 1, 1.5, stone, true);
      m.rotation.y = random();
    }
    arch(0, -30, 13, 13, 2, stone);
  }
  if (theme === "hell") {
    for (const x of [-19, 19])
      for (let z = -24; z < 28; z += 10) {
        const m = mesh(
          new T.ConeGeometry(3, 8 + random() * 7, 5),
          dark,
          x,
          4,
          z,
        );
        m.rotation.z = (random() - 0.5) * 0.4;
        colliders.push({ x, z, w: 4, d: 4, h: 12 });
        torch(x * 0.7, z, 1.5, true);
      }
    const lava = new T.MeshBasicMaterial({ color: 0xd1441f });
    mats.push(lava);
    for (const x of [-24, 24]) box(x, 0.04, 0, 3, 0.04, 60, lava);
    mesh(new T.TorusGeometry(11, 0.8, 8, 32), glow, 0, 13, -36);
  }
  if (theme === "forest") {
    for (let i = 0; i < 14; i++)
      tree(
        (i % 2 ? 1 : -1) * (7 + random() * 16),
        -28 + random() * 55,
        8 + random() * 6,
      );
  }
  if (theme === "tower") {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const x = Math.sin(a) * 24,
        z = Math.cos(a) * 27;
      if (Math.abs(x) > 4) column(x, z, 19);
    }
    mesh(new T.TorusGeometry(9, 0.25, 8, 32), gold, 0, 13, -30);
  }
  // A small reliquary off the central route; supplies require actual exploration.
  const secret = new T.Vector3(room % 2 ? -23 : 23, 0.9, -26);
  box(secret.x, 0.3, secret.z, 1.8, 0.6, 1.8, trim);
  cross(secret.x, 0.65, secret.z, 0.55, gold);
  const deco = rng(level.seed * 3 + room * 17 + 5);
  dressTheme(level.theme, deco, {
    box,
    cyl,
    mesh,
    mats,
    metal,
    rust,
    wood,
    gold,
    dark,
    trim,
    red,
    wallH,
  });
  for (const x of [-5, 5])
    for (const z of [-24, 13]) {
      plinth(level.theme, x, z, {
        box,
        cyl,
        mesh,
        mats,
        dark,
        metal,
        rust,
        trim,
      });
      torch(x, z, 2.1, true);
    }
  // Cap dynamic lighting; the rest of the flames retain emissive geometry.
  lights.forEach((l, i) => {
    if (i >= 4) {
      root.remove(l);
      l.dispose();
    }
  });
  lights.splice(4);
  // Distant skyline, moon, and sparse ash motes.
  if (!["crypt", "prison", "asylum"].includes(theme)) {
    mesh(
      new T.SphereGeometry(3.2, 24, 16),
      new T.MeshBasicMaterial({ color: 0xd4d6b7 }),
      -22,
      35,
      -68,
    );
    for (let i = 0; i < 14; i++) {
      const x = (random() - 0.5) * 145,
        z = -65 - random() * 30;
      building(x, z, 5 + random() * 9, 8 + random() * 17, 6, dark);
    }
  }
  // Merge stationary architecture into one draw call per material.
  root.updateMatrixWorld(true);
  const groups = new Map<T.Material, T.BufferGeometry[]>();
  const removed: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      const geo = (
        o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      ).applyMatrix4(o.matrixWorld);
      const mat = o.material as T.Material;
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat)!.push(geo);
      removed.push(o);
    }
  });
  for (const m of removed) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const [mat, geos] of groups) {
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (geo) {
      const m = new T.Mesh(geo, mat);
      m.receiveShadow = true;
      // Floors, pools, carpets and painted lines cannot cast a visible shadow.
      m.castShadow = !mat.userData.flat;
      root.add(m);
    }
  }
  // Soft fire halos and a layered cloud sky use local procedural shaders.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const gc = glowCanvas.getContext("2d")!;
  const gradient = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,219,145,.8)");
  gradient.addColorStop(0.2, "rgba(255,137,48,.3)");
  gradient.addColorStop(1, "rgba(255,90,25,0)");
  gc.fillStyle = gradient;
  gc.fillRect(0, 0, 64, 64);
  const glowTexture = new T.CanvasTexture(glowCanvas);
  const glowMaterial = new T.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    color: 0xffb565,
  });
  flamePositions.forEach((p) => {
    const sprite = new T.Sprite(glowMaterial);
    sprite.position.copy(p);
    sprite.scale.set(2.4, 3.3, 1);
    root.add(sprite);
  });
  if (!["crypt", "prison", "asylum"].includes(theme)) {
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: { base: { value: new T.Color(colors[0]) } },
      vertexShader:
        "varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: `varying vec3 direction; uniform vec3 base;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 void main(){vec3 d=normalize(direction);vec2 uv=d.xz/(max(d.y,.04)+.3)*1.7;float n=noise(uv*2.)*.5+noise(uv*4.1)*.25+noise(uv*8.3)*.125;float cloud=smoothstep(.3,.68,n);vec3 col=mix(base*.45,base,1.-max(d.y,0.));col+=cloud*vec3(.075,.092,.085)*smoothstep(0.,.2,d.y);float stars=step(.998,hash(floor(d.xz/max(d.y,.02)*280.)))*smoothstep(.15,.7,d.y)*(1.-cloud);col+=stars*.25;gl_FragColor=vec4(col,1.);}`,
    });
    const sky = new T.Mesh(new T.SphereGeometry(150, 32, 16), skyMat);
    root.add(sky);
  }
  const portal = new T.Group();
  portal.position.set(0, 2.5, -28);
  root.add(portal);
  const portalMat = new T.MeshBasicMaterial({
    color: 0x94e3b1,
    transparent: true,
    opacity: 0.7,
  });
  const ring = new T.Mesh(new T.TorusGeometry(2, 0.1, 8, 48), portalMat);
  portal.add(ring);
  const disc = new T.Mesh(
    new T.CircleGeometry(1.9, 40),
    new T.MeshBasicMaterial({
      color: 0x6fe4ab,
      transparent: true,
      opacity: 0.13,
      side: T.DoubleSide,
    }),
  );
  portal.add(disc);
  portal.visible = false;
  const spawn = [
    new T.Vector3(-21, 0, -25),
    new T.Vector3(21, 0, -25),
    new T.Vector3(-22, 0, 23),
    new T.Vector3(22, 0, 23),
    new T.Vector3(-8, 0, -25),
    new T.Vector3(8, 0, -25),
  ];
  return {
    root,
    colliders,
    portal,
    lights,
    spawn,
    secret,
    dispose: () => {
      scene.remove(root);
      const gs = new Set<T.BufferGeometry>(),
        ms = new Set<T.Material>();
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          gs.add(o.geometry);
          const list = Array.isArray(o.material) ? o.material : [o.material];
          list.forEach((m) => ms.add(m));
        }
      });
      gs.forEach((g) => g.dispose());
      ms.forEach((m) => m.dispose());
      mats.forEach((m) => m.dispose());
      tex.dispose();
      glowTexture.dispose();
      glowMaterial.dispose();
      lights.forEach((l) => l.dispose());
    },
  };
}

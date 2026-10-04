import * as T from "three";
import { art, asset, bakeStatic } from "./assets";
import type { Arena } from "./world";
import type { Collider } from "./core";
export const authoredThemes = new Set([
  "cemetery",
  "cathedral",
  "crypt",
  "factory",
]);
const cache = new Map<
  string,
  { baked: T.Group; obstacles: Collider[]; lamps: T.Vector3[] }
>();
export function authoredCemetery(
  scene: T.Scene,
  room: number,
  theme = "cemetery",
): Arena {
  if (!cache.has(theme)) {
    const source = asset(theme)!.scene,
      obstacles: Collider[] = [],
      lamps: T.Vector3[] = [];
    source.updateMatrixWorld(true);
    source.traverse((o) => {
      const structural =
        /^(Boundary wall|Nave front|Bell tower|Statue pedestal|Rear boundary|Aisle wall|Apse wall|Entry wall|Catacomb retaining wall|Crypt end wall|Brick shed wall|Factory end wall)(?:[. ]*\d+)?$/.test(
          o.name.replaceAll("_", " "),
        );
      if (o.userData.collision || structural) {
        const b = new T.Box3().setFromObject(o),
          s = b.getSize(new T.Vector3()),
          p = b.getCenter(new T.Vector3());
        obstacles.push({
          x: p.x,
          z: p.z,
          w: s.x,
          d: s.z,
          h: theme === "cemetery" && !structural ? 1.6 : b.max.y,
        });
      }
      if (o.userData.light) lamps.push(o.getWorldPosition(new T.Vector3()));
    });
    cache.set(theme, { baked: bakeStatic(source), obstacles, lamps });
  }
  const { baked, obstacles, lamps } = cache.get(theme)!;
  const root = baked.clone(true);
  scene.add(root);
  const indoor = theme !== "cemetery";
  scene.background = indoor
    ? new T.Color(theme === "factory" ? 0x242221 : 0x171d21)
    : art.sky;
  scene.backgroundIntensity = 0.1;
  scene.backgroundBlurriness = 0.035;
  scene.fog = new T.FogExp2(
    theme === "factory" ? 0x30251d : 0x20272c,
    indoor ? 0.008 : 0.01,
  );
  const lights = lamps.slice(0, 6).map((p) => {
    const l = new T.PointLight(
      theme === "crypt" ? 0xffae62 : 0xffbd77,
      26,
      theme === "cathedral" ? 20 : 15,
      1.8,
    );
    l.position.copy(p);
    root.add(l);
    return l;
  });
  // Repeated sectors have alternate cover arrangements without blocking the axial route.
  const extra: Collider[] = [];
  const extraGeometry: T.BufferGeometry[] = [];
  if (room > 0) {
    const stone = art.materials.get("Weathered limestone")!;
    for (const side of [-1, 1]) {
      const geo = new T.BoxGeometry(theme === "factory" ? 3 : 2.4, 1.1, 2.2),
        mesh = new T.Mesh(geo, stone);
      mesh.position.set(
        side * (room % 2 ? 5.8 : 11),
        0.55,
        ((room % 3) - 1) * 10,
      );
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      extraGeometry.push(geo);
      extra.push({
        x: mesh.position.x,
        z: mesh.position.z,
        w: theme === "factory" ? 3 : 2.4,
        d: 2.2,
        h: 1.1,
      });
    }
  }
  const portal = new T.Group();
  portal.position.set(0, 2.5, -28);
  root.add(portal);
  portal.visible = false;
  const material = new T.MeshBasicMaterial({
    color: 0xa4d5b2,
    transparent: true,
    opacity: 0.65,
  });
  const ring = new T.Mesh(new T.TorusGeometry(2, 0.045, 8, 64), material);
  portal.add(ring);
  return {
    root,
    lights,
    portal,
    colliders: [...obstacles.map((c) => ({ ...c })), ...extra],
    secret: new T.Vector3(room % 2 ? 23 : -23, 0.9, -26),
    spawn: [
      [-21, -25],
      [21, -25],
      [-22, 23],
      [22, 23],
      [-8, -25],
      [8, -25],
    ].map(([x, z]) => new T.Vector3(x, 0, z)),
    dispose: () => {
      root.removeFromParent();
      ring.geometry.dispose();
      material.dispose();
      extraGeometry.forEach((g) => g.dispose());
      lights.forEach((l) => l.dispose());
    },
  };
}

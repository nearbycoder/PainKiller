import * as T from "three";
const wood = new T.MeshStandardMaterial({ color: 0x765032, roughness: 0.9 });
const steel = new T.MeshStandardMaterial({
  color: 0x555954,
  metalness: 0.7,
  roughness: 0.5,
});
const olive = new T.MeshStandardMaterial({
  color: 0x464a2d,
  metalness: 0.4,
  roughness: 0.65,
});
const brass = new T.MeshStandardMaterial({
  color: 0x9b763d,
  metalness: 0.7,
  roughness: 0.4,
});
const cache = new Map<string, T.Group>();
/** Shared low-poly geometry; projectiles are actual stakes, grenades and rockets. */
export function projectileModel(kind: string): T.Group {
  if (!cache.has(kind)) {
    const root = new T.Group();
    const cylinder = (
      radius: number,
      length: number,
      material: T.Material,
      z = 0,
    ) => {
      const m = new T.Mesh(
        new T.CylinderGeometry(radius, radius, length, 8),
        material,
      );
      m.rotation.x = Math.PI / 2;
      m.position.z = z;
      root.add(m);
      return m;
    };
    const tip = (
      radius: number,
      length: number,
      z: number,
      material: T.Material,
    ) => {
      const m = new T.Mesh(new T.ConeGeometry(radius, length, 8), material);
      m.rotation.x = Math.PI / 2;
      m.position.z = z;
      root.add(m);
    };
    if (kind === "stake") {
      cylinder(0.032, 1.05, wood, -0.4);
      tip(0.034, 0.22, 0.235, steel);
    } else if (kind === "grenade") {
      cylinder(0.095, 0.26, olive);
      tip(0.09, 0.1, 0.18, steel);
      cylinder(0.098, 0.04, brass, -0.14);
    } else if (kind === "rocket") {
      cylinder(0.075, 0.48, olive);
      tip(0.075, 0.2, 0.34, steel);
      for (let i = 0; i < 4; i++) {
        const m = new T.Mesh(new T.BoxGeometry(0.23, 0.018, 0.16), steel);
        m.rotation.z = (i * Math.PI) / 2;
        m.position.z = -0.2;
        root.add(m);
      }
    } else if (kind === "star" || kind === "blade") {
      for (let i = 0; i < (kind === "star" ? 4 : 5); i++) {
        const shape = new T.Shape();
        shape.moveTo(-0.025, -0.04);
        shape.lineTo(0.05, 0.025);
        shape.lineTo(0.3, 0);
        shape.lineTo(0.11, -0.09);
        shape.closePath();
        const m = new T.Mesh(
          new T.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false }),
          steel,
        );
        m.rotation.z = (i * Math.PI * 2) / (kind === "star" ? 4 : 5);
        root.add(m);
      }
    } else {
      const material = new T.MeshBasicMaterial({
        color: kind === "hellfire" ? 0xf29142 : 0x86d6ea,
      });
      const mesh = new T.Mesh(
        new T.IcosahedronGeometry(kind === "storm" ? 0.3 : 0.09, 1),
        material,
      );
      mesh.scale.z = kind === "ice" ? 2.4 : 1;
      root.add(mesh);
    }
    cache.set(kind, root);
  }
  return cache.get(kind)!.clone(true);
}

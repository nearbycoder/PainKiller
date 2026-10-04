import * as T from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

const library = new Map<string, GLTF>();
export const art = {
  ready: false,
  sky: null as T.DataTexture | null,
  materials: new Map<string, T.MeshStandardMaterial>(),
};
const base = `${import.meta.env.BASE_URL}assets/`;
export async function loadArt(
  progress: (label: string, fraction: number) => void,
) {
  const loader = new GLTFLoader();
  const names = [
    "cemetery",
    "cathedral",
    "crypt",
    "factory",
    "revenant",
    "skeleton",
    "enemy-wardrobe",
    "supplies",
    ...Array.from({ length: 5 }, (_, i) => `weapon-${i}`),
  ];
  let completed = 0;
  // Bounded parallel loading avoids decoding every 2K map in one browser frame.
  for (let i = 0; i < names.length; i += 2) {
    await Promise.all(
      names.slice(i, i + 2).map(async (name) => {
        const gltf = await loader.loadAsync(`${base}models/${name}.glb`);
        gltf.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            for (const mat of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              if (mat instanceof T.MeshStandardMaterial) {
                if (name === "enemy-wardrobe") {
                  mat.color.set(
                    mat.name === "Soot wool"
                      ? 0x414747
                      : mat.name === "Weathered armor"
                        ? 0x52646a
                        : mat.name === "Worn hide"
                          ? 0x77665a
                          : 0x988564,
                  );
                  mat.roughness = mat.name === "Weathered armor" ? 0.63 : 0.9;
                }
                for (const t of [mat.map, mat.normalMap, mat.roughnessMap])
                  if (t) t.anisotropy = 8;
                if (
                  (name === "cemetery" || name === "weapon-0") &&
                  !art.materials.has(mat.name)
                )
                  art.materials.set(mat.name, mat);
              }
            }
          }
        });
        library.set(name, gltf);
        progress(name, ++completed / (names.length + 1));
      }),
    );
  }
  art.sky = await new HDRLoader().loadAsync(`${base}textures/moonrise.hdr`);
  art.sky.mapping = T.EquirectangularReflectionMapping;
  art.ready = true;
  progress("Ready", 1);
}
export function asset(name: string): GLTF | undefined {
  return library.get(name);
}
export function cloneActor(name: string): T.Group {
  return clone(library.get(name)!.scene) as T.Group;
}

/** Merge static geometry by material, retaining named articulated assemblies separately. */
export function bakeStatic(source: T.Object3D): T.Group {
  const group = new T.Group();
  source.updateMatrixWorld(true);
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  source.traverse((o) => {
    if (!(o instanceof T.Mesh) || o instanceof T.SkinnedMesh) return;
    const geo = o.geometry.clone();
    // Retain indices so shared vertices are transformed once by the GPU.
    if (!geo.index) {
      const indices = new Uint32Array(geo.attributes.position.count);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
      geo.setIndex(new T.BufferAttribute(indices, 1));
    }
    geo.applyMatrix4(o.matrixWorld);
    // Exported meshes differ in tangent / secondary UV attributes; retain a uniform contract.
    for (const key of Object.keys(geo.attributes))
      if (!["position", "normal", "uv"].includes(key)) geo.deleteAttribute(key);
    if (!geo.getAttribute("uv"))
      geo.setAttribute(
        "uv",
        new T.BufferAttribute(
          new Float32Array(geo.getAttribute("position").count * 2),
          2,
        ),
      );
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(geo);
  });
  for (const [mat, geos] of batches) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (merged) {
      const mesh = new T.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

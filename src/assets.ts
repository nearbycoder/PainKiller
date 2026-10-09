import * as T from "three";
import { filterTexture } from "./fidelity";
import { touchFirst } from "./device";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import sizes from "virtual:asset-sizes";

const library = new Map<string, GLTF>();
export const art = {
  ready: false,
  sky: null as T.DataTexture | null,
  materials: new Map<string, T.MeshStandardMaterial>(),
};
const base = `${import.meta.env.BASE_URL}assets/`;
/**
 * Phones and tablets load lighter art: every texture at most 512 pixels wide (a quarter of
 * the memory, plenty at a phone's render resolution), one file and four images decoding
 * at a time, and the later arenas only when a level needs them.
 */
export const LIGHT_ART = touchFirst();
const LIGHT_TEXTURE_SIZE = 512;
const loader = new GLTFLoader();
/**
 * Embedded images by content. The five weapon files carry the same armory maps and the
 * arenas share many of theirs, so each distinct image is decoded once; textures cloned
 * from one source share a single GPU texture in three.js.
 */
const images = new Map<string, Promise<T.Texture>>();
loader.register((parser) => {
  const load = parser.loadImageSource.bind(parser);
  parser.loadImageSource = async (index, imageLoader) => {
    const view = parser.json.images[index].bufferView;
    if (view === undefined) return load(index, imageLoader);
    const key = contentKey(await parser.getDependency("bufferView", view));
    let image = images.get(key);
    if (!image) {
      image = decoding(() => load(index, imageLoader)).then((t) =>
        LIGHT_ART ? shrink(t, LIGHT_TEXTURE_SIZE) : t,
      );
      image.catch(() => images.delete(key));
      images.set(key, image);
    }
    return image;
  };
  return { name: "PURGATORY_shared_images" };
});
/** Length and two 32-bit hashes of the bytes: equal keys mean equal images. */
function contentKey(bytes: ArrayBuffer) {
  const words = new Uint32Array(bytes, 0, bytes.byteLength >> 2),
    tail = new Uint8Array(bytes, words.length * 4);
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < words.length; i++) {
    a = Math.imul(a ^ words[i], 0x01000193);
    b = Math.imul(b + words[i], 0x5bd1e995) ^ (b >>> 15);
  }
  for (const byte of tail) a = Math.imul(a ^ byte, 0x01000193);
  return `${bytes.byteLength}:${a >>> 0}:${b >>> 0}`;
}
let decodes = 0;
const waiting: (() => void)[] = [];
/** Runs `decode` when fewer than four light-art images are decoding (always on desktop). */
async function decoding<X>(decode: () => Promise<X>) {
  if (!LIGHT_ART) return decode();
  if (decodes >= 4) await new Promise<void>((r) => waiting.push(r));
  decodes++;
  try {
    return await decode();
  } finally {
    decodes--;
    waiting.shift()?.();
  }
}
/** Scale the texture's image down to `size` pixels on its longer side, freeing the original. */
async function shrink(texture: T.Texture, size: number) {
  const image = texture.image as ImageBitmap | HTMLImageElement,
    scale = size / Math.max(image.width, image.height);
  if (!(scale < 1)) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ("close" in image) image.close();
  // A bitmap, where there is one, stays out of iOS's budget for canvas memory.
  texture.image =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(canvas)
      : canvas;
  if (texture.image !== canvas) canvas.width = canvas.height = 0;
  texture.needsUpdate = true;
  return texture;
}
/** Environment scenes only some levels use; the web build fetches them after the menu is up. */
export const DEFERRED_ART = ["cathedral", "crypt", "factory"];
const pending = new Map<string, Promise<void>>();
/**
 * Load actors, weapons, supplies, the cemetery (the title backdrop) and the sky. With
 * `everything`, the deferred environments load up front too, so development builds and
 * scripted checks never wait on them; otherwise call prefetchArt() once the menu is up.
 *
 * `progress` gets the bytes received so far and the total. Files that fail do not stop
 * the others; the promise then rejects, and calling loadArt again fetches only what is
 * still missing.
 */
export async function loadArt(
  progress: (loaded: number, total: number) => void,
  everything = true,
) {
  const names = [
    "cemetery",
    ...(everything ? DEFERRED_ART : []),
    "revenant",
    "skeleton",
    "enemy-wardrobe",
    "supplies",
    ...Array.from({ length: 5 }, (_, i) => `weapon-${i}`),
  ];
  const size = (name: string) => sizes[name] ?? 0,
    total = [...names, "sky"].reduce((n, name) => n + size(name), 0),
    received = new Map<string, number>();
  for (const name of names)
    if (library.has(name)) received.set(name, size(name));
  if (art.sky) received.set("sky", size("sky"));
  const report = () => {
    let loaded = 0;
    for (const n of received.values()) loaded += n;
    progress(Math.min(loaded, total), total);
  };
  const track = (name: string) => (event: ProgressEvent) => {
    received.set(name, Math.min(event.loaded, size(name) || event.loaded));
    report();
  };
  const failures: unknown[] = [];
  const settle = async (name: string, load: () => Promise<void>) => {
    try {
      await load();
      received.set(name, size(name));
    } catch (error) {
      received.delete(name);
      failures.push(error);
    }
    report();
  };
  report();
  const missing = names.filter((name) => !library.has(name));
  // Bounded parallel loading avoids decoding every 2K map in one browser frame.
  const parallel = LIGHT_ART ? 1 : 2;
  for (let i = 0; i < missing.length; i += parallel)
    await Promise.all(
      missing
        .slice(i, i + parallel)
        .map((name) => settle(name, () => loadModel(name, track(name)))),
    );
  if (!art.sky)
    await settle("sky", async () => {
      const sky = await new HDRLoader().loadAsync(
        `${base}textures/moonrise.hdr`,
        track("sky"),
      );
      sky.mapping = T.EquirectangularReflectionMapping;
      // The sky is drawn blurred and lights the scene through two environment maps
      // sized from it (about 24 MB of GPU memory each at full size).
      if (LIGHT_ART) halve(sky);
      art.sky = sky;
    });
  if (failures.length) throw failures[0];
  art.ready = true;
}
/** Halve a half-float sky's width and height, averaging each 2 × 2 block. */
function halve(sky: T.DataTexture) {
  const { width, height, data } = sky.image as {
    width: number;
    height: number;
    data: Uint16Array;
  };
  if (!(data instanceof Uint16Array) || width % 2 || height % 2) return;
  const w = width / 2,
    h = height / 2,
    out = new Uint16Array(w * h * 4),
    { fromHalfFloat: f, toHalfFloat } = T.DataUtils;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        const i = (2 * y * width + 2 * x) * 4 + c,
          below = i + width * 4;
        out[(y * w + x) * 4 + c] = toHalfFloat(
          (f(data[i]) + f(data[i + 4]) + f(data[below]) + f(data[below + 4])) /
            4,
        );
      }
  sky.image = { width: w, height: h, data: out };
  sky.needsUpdate = true;
}
/** Whether a theme's scene is loaded; procedural themes never need one. */
export function hasArt(theme: string) {
  return !DEFERRED_ART.includes(theme) || library.has(theme);
}
/** Load one deferred environment, sharing the request with a prefetch already under way. */
export function ensureArt(theme: string): Promise<void> {
  if (hasArt(theme)) return Promise.resolve();
  if (!pending.has(theme))
    pending.set(
      theme,
      loadModel(theme).catch((error) => {
        pending.delete(theme);
        throw error;
      }),
    );
  return pending.get(theme)!;
}
/**
 * Fetch the remaining environments one at a time in the background. With light art
 * (phones and tablets) each waits until a level needs it, to keep memory down.
 */
export async function prefetchArt() {
  if (LIGHT_ART) return;
  for (const theme of DEFERRED_ART)
    try {
      await ensureArt(theme);
    } catch (error) {
      console.warn(`Could not prefetch ${theme}; retrying when needed`, error);
    }
}
async function loadModel(
  name: string,
  onProgress?: (event: ProgressEvent) => void,
) {
  const gltf = await loader.loadAsync(`${base}models/${name}.glb`, onProgress);
  gltf.scene.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!(mat instanceof T.MeshStandardMaterial)) continue;
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
        if (t) filterTexture(t, 8);
      if (
        (name === "cemetery" || name === "weapon-0") &&
        !art.materials.has(mat.name)
      )
        art.materials.set(mat.name, mat);
    }
  });
  // The parser holds the whole file (the images' compressed bytes included); nothing
  // reads it again.
  delete (gltf as Partial<GLTF>).parser;
  library.set(name, gltf);
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

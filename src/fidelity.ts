import type * as T from "three";

/** What one step of the Graphics fidelity slider draws. */
export interface Fidelity {
  name: string;
  /** What the step changes, for the Options page. */
  note: string;
  /** Sun shadow map size in pixels; 0 draws no shadows. */
  shadowMap: number;
  /** Sun shadow refreshes per second (the display's rate when 60 or more). */
  shadowRate: number;
  /** Ambient occlusion resolution as a share of the frame; 0 is off. */
  ao: number;
  /** Ambient occlusion samples per pixel. */
  aoSamples: number;
  antialiasing: "none" | "fxaa" | "smaa";
  /** Highest device pixels per CSS pixel on HiDPI displays (before resolution scale). */
  maxPixelRatio: number;
  /** Airborne dust, ash or snow drawn in every arena. */
  atmosphere: number;
  /** Share of spark particles drawn: 0.5 hides every other one, 2 adds as many again. */
  sparks: number;
  /** Raise every texture to the GPU's highest anisotropic filtering. */
  maxAnisotropy: boolean;
}
export const FIDELITY: Fidelity[] = [
  {
    name: "Low",
    note: "No shadows, ambient occlusion or antialiasing; fewer particles; at most one rendered pixel per screen pixel. For weak and integrated graphics.",
    shadowMap: 0,
    shadowRate: 30,
    ao: 0,
    aoSamples: 16,
    antialiasing: "none",
    maxPixelRatio: 1,
    atmosphere: 64,
    sparks: 0.5,
    maxAnisotropy: false,
  },
  {
    name: "Medium",
    note: "Sun shadows and FXAA antialiasing. The default.",
    shadowMap: 1024,
    shadowRate: 30,
    ao: 0,
    aoSamples: 16,
    antialiasing: "fxaa",
    maxPixelRatio: 1.5,
    atmosphere: 128,
    sparks: 1,
    maxAnisotropy: false,
  },
  {
    name: "High",
    note: "Sharper shadows and half-resolution ambient occlusion.",
    shadowMap: 2048,
    shadowRate: 30,
    ao: 0.5,
    aoSamples: 16,
    antialiasing: "fxaa",
    maxPixelRatio: 1.5,
    atmosphere: 128,
    sparks: 1,
    maxAnisotropy: false,
  },
  {
    name: "Ultra",
    note: "4K shadows refreshed every frame, full-resolution ambient occlusion, SMAA, the sharpest texture filtering, denser particles and up to 2× pixel density.",
    shadowMap: 4096,
    shadowRate: 60,
    ao: 1,
    aoSamples: 32,
    antialiasing: "smaa",
    maxPixelRatio: 2,
    atmosphere: 384,
    sparks: 2,
    maxAnisotropy: true,
  },
];
export const DEFAULT_FIDELITY = 1;
/** The step for a saved `quality` value (old saves had 0–2, which keep their meaning). */
export function fidelity(quality: number): Fidelity {
  return FIDELITY[
    Math.max(0, Math.min(FIDELITY.length - 1, Math.round(quality) || 0))
  ];
}

/**
 * Textures whose filtering follows the fidelity step, each with the anisotropy it was
 * made with. Disposed textures leave the set.
 */
const filtered = new Map<T.Texture, number>();
let ceiling = 0;
export function filterTexture<X extends T.Texture>(t: X, anisotropy: number) {
  if (!filtered.has(t)) t.addEventListener("dispose", () => filtered.delete(t));
  filtered.set(t, anisotropy);
  t.anisotropy = ceiling ? Math.max(anisotropy, ceiling) : anisotropy;
  return t;
}
/** Raise every registered texture to `max` (0 restores each one's own filtering). */
export function setAnisotropy(max: number) {
  ceiling = max;
  for (const [t, own] of filtered) {
    const value = max ? Math.max(own, max) : own;
    if (t.anisotropy !== value) {
      t.anisotropy = value;
      t.needsUpdate = true;
    }
  }
}
export function filteredTextures() {
  return [...filtered.keys()];
}

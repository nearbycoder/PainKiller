import { DEFAULT_BINDINGS, cloneBindings, parseBindings } from "./bindings";
export const defaults = {
  sensitivity: 0.002,
  fov: 80,
  volume: 0.45,
  music: true,
  musicVolume: 0.65,
  effectsVolume: 1,
  difficulty: 1,
  quality: 1,
  adaptiveResolution: true,
  renderScale: 1,
  brightness: 1,
  invertY: false,
  headBob: true,
  crosshair: true,
  hints: true,
  bindings: cloneBindings(DEFAULT_BINDINGS),
};
export type Settings = typeof defaults;
export function parseSettings(raw: string | null): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw || "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      saved = value;
  } catch {}
  const result = { ...defaults };
  const limits = {
    sensitivity: [0.0005, 0.006],
    fov: [65, 110],
    volume: [0, 1],
    musicVolume: [0, 1],
    effectsVolume: [0, 1],
    difficulty: [0, 2],
    quality: [0, 2],
    renderScale: [0.5, 1],
    brightness: [0.65, 1.5],
  };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const v = saved[key],
      [min, max] = limits[key];
    if (typeof v === "number" && Number.isFinite(v))
      result[key] = Math.max(min, Math.min(max, v));
  }
  result.quality = Math.round(result.quality);
  result.difficulty = Math.round(result.difficulty);
  for (const key of [
    "music",
    "invertY",
    "headBob",
    "crosshair",
    "adaptiveResolution",
    "hints",
  ] as const)
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  result.bindings = parseBindings(saved.bindings);
  return result;
}

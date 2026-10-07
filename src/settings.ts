import {
  DEFAULT_BINDINGS,
  DEFAULT_PAD_BINDINGS,
  cloneBindings,
  clonePadBindings,
  parseBindings,
  parsePadBindings,
} from "./bindings";
export const defaults = {
  sensitivity: 0.002,
  /** Right-stick look speed; 1 is the speed mouse sensitivity 0.002 used to give. */
  stickSpeed: 1,
  vibration: true,
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
  /** Size of the in-game HUD (not menus or the touch layout). */
  hudScale: 1,
  invertY: false,
  headBob: true,
  crosshair: true,
  hints: true,
  /** Switch to another weapon when the mode in hand runs dry. */
  autoSwitch: true,
  bindings: cloneBindings(DEFAULT_BINDINGS),
  padBindings: clonePadBindings(DEFAULT_PAD_BINDINGS),
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
    stickSpeed: [0.25, 3],
    fov: [65, 110],
    volume: [0, 1],
    musicVolume: [0, 1],
    effectsVolume: [0, 1],
    difficulty: [0, 2],
    quality: [0, 2],
    renderScale: [0.5, 1],
    brightness: [0.65, 1.5],
    hudScale: [0.75, 1.5],
  };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const v = saved[key],
      [min, max] = limits[key];
    if (typeof v === "number" && Number.isFinite(v))
      result[key] = Math.max(min, Math.min(max, v));
  }
  // Before stick speed had its own option, it followed mouse sensitivity; keep that speed.
  if (typeof saved.stickSpeed !== "number")
    result.stickSpeed = Math.max(
      0.25,
      Math.min(3, result.sensitivity / defaults.sensitivity),
    );
  result.quality = Math.round(result.quality);
  result.difficulty = Math.round(result.difficulty);
  for (const key of [
    "music",
    "invertY",
    "headBob",
    "crosshair",
    "adaptiveResolution",
    "hints",
    "vibration",
    "autoSwitch",
  ] as const)
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  result.bindings = parseBindings(saved.bindings);
  result.padBindings = parsePadBindings(saved.padBindings);
  return result;
}

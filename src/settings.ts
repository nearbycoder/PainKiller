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
  /** Share of each stick axis ignored around the centre. */
  stickDeadzone: 0.18,
  /** Right-stick response: 0 linear, 1 precise (slower near the centre). */
  lookCurve: 0,
  /** Move with the right stick and look with the left. */
  swapSticks: false,
  /** Sprint stays on after a press until pressed again or you stop moving. */
  toggleSprint: false,
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
  /** 0 cross and dot, 1 cross, 2 dot, 3 circle; see CROSSHAIR_STYLES. */
  crosshairStyle: 0,
  /** Index into CROSSHAIR_COLORS. */
  crosshairColor: 0,
  crosshairSize: 1,
  hints: true,
  /** Switch to another weapon when the mode in hand runs dry. */
  autoSwitch: true,
  /** A red HUD and a heartbeat at low health. */
  lowHealthWarning: true,
  bindings: cloneBindings(DEFAULT_BINDINGS),
  padBindings: clonePadBindings(DEFAULT_PAD_BINDINGS),
};
export type Settings = typeof defaults;
export const CROSSHAIR_STYLES = ["Cross and dot", "Cross", "Dot", "Circle"];
export const CROSSHAIR_COLORS: [string, string][] = [
  ["Bone", "#edf2df"],
  ["Green", "#6cff7a"],
  ["Yellow", "#ffe14d"],
  ["Cyan", "#4ff0ff"],
  ["Magenta", "#ff4fd8"],
];
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
    stickDeadzone: [0.05, 0.3],
    lookCurve: [0, 1],
    fov: [65, 110],
    volume: [0, 1],
    musicVolume: [0, 1],
    effectsVolume: [0, 1],
    difficulty: [0, 2],
    quality: [0, 2],
    renderScale: [0.5, 1],
    brightness: [0.65, 1.5],
    hudScale: [0.75, 1.5],
    crosshairStyle: [0, CROSSHAIR_STYLES.length - 1],
    crosshairColor: [0, CROSSHAIR_COLORS.length - 1],
    crosshairSize: [0.75, 2],
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
  result.lookCurve = Math.round(result.lookCurve);
  result.crosshairStyle = Math.round(result.crosshairStyle);
  result.crosshairColor = Math.round(result.crosshairColor);
  for (const key of [
    "music",
    "invertY",
    "headBob",
    "crosshair",
    "adaptiveResolution",
    "hints",
    "vibration",
    "autoSwitch",
    "lowHealthWarning",
    "swapSticks",
    "toggleSprint",
  ] as const)
    if (typeof saved[key] === "boolean") result[key] = saved[key];
  result.bindings = parseBindings(saved.bindings);
  result.padBindings = parsePadBindings(saved.padBindings);
  return result;
}

import { ownedSelection } from "./tarot";
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
export function blocked(
  x: number,
  z: number,
  r: number,
  colliders: Collider[],
  feet = 0,
) {
  return colliders.some(
    (c) =>
      feet < c.h &&
      x + r > c.x - c.w / 2 &&
      x - r < c.x + c.w / 2 &&
      z + r > c.z - c.d / 2 &&
      z - r < c.z + c.d / 2,
  );
}
export function slide(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  colliders: Collider[],
  feet = 0,
) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dz) / Math.max(r * 0.6, 0.15)),
  );
  for (let i = 0; i < steps; i++) {
    if (!blocked(x + dx / steps, z, r, colliders, feet)) x += dx / steps;
    if (!blocked(x, z + dz / steps, r, colliders, feet)) z += dz / steps;
  }
  return { x, z };
}
export interface Save {
  version: 1;
  unlocked: number;
  level: number;
  room: number;
  kills: number;
  souls: number;
  cards: number[];
  selectedCard: number;
  best: Record<string, number>;
  completed: boolean;
  /** Snapshot at the start of the current wave; Continue resumes there. */
  resume?: Resume;
  /** Best results per completed level, keyed by level index. */
  records?: Record<string, LevelRecord>;
}
export interface LevelRecord {
  /** Fastest clear, seconds. */
  time: number;
  kills: number;
  /** Most relics found in one clear. */
  secrets: number;
  /** Cleared at least once without dying. */
  deathless: boolean;
}
/** Fold one clear into a level's record; `fastest` is true when the time improved. */
export function mergeRecord(
  previous: LevelRecord | undefined,
  run: LevelRecord,
) {
  const record: LevelRecord = previous
    ? {
        time: Math.min(previous.time, run.time),
        kills: Math.max(previous.kills, run.kills),
        secrets: Math.max(previous.secrets, run.secrets),
        deathless: previous.deathless || run.deathless,
      }
    : { ...run };
  return { record, fastest: !previous || run.time < previous.time };
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function parseRecords(raw: unknown): Record<string, LevelRecord> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, LevelRecord> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as Record<string, unknown> | null;
    const level = Number(key);
    if (
      !Number.isInteger(level) ||
      level < 0 ||
      level > 23 ||
      !r ||
      typeof r.time !== "number" ||
      !Number.isFinite(r.time) ||
      r.time <= 0 ||
      typeof r.kills !== "number" ||
      !(r.kills >= 0) ||
      typeof r.secrets !== "number" ||
      !(r.secrets >= 0 && r.secrets <= 100) ||
      typeof r.deathless !== "boolean"
    )
      continue;
    out[String(level)] = {
      time: r.time,
      kills: Math.floor(r.kills),
      secrets: Math.floor(r.secrets),
      deathless: r.deathless,
    };
  }
  return out;
}
/** Player state when a wave began. Ammunition of -1 stands for the Thresher's infinite supply. */
export interface Resume {
  level: number;
  room: number;
  /** The wave about to begin, 1–3. */
  wave: number;
  health: number;
  armor: number;
  ammo: number[];
  altAmmo: number[];
  weapon: number;
  souls: number;
  cardUsed: boolean;
  /** Fixed sector supplies already collected (0 health, 1 armor, 2–3 ammunition, 4 relic). */
  taken: number[];
  kills: number;
  levelSouls: number;
  secrets: number;
  elapsed: number;
  /** Deaths so far in this level. */
  deaths: number;
  /** Level stats when the sector began, restored by a retry after death. */
  sector: { kills: number; souls: number; secrets: number };
}
export function parseResume(r: unknown): Resume | undefined {
  if (!r || typeof r !== "object") return undefined;
  const x = r as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const ammo = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 5 &&
    v.every((n) => num(n, -1, 10000) && Number.isInteger(n));
  const sector = x.sector as Record<string, unknown> | undefined;
  if (
    !num(x.level, 0, 23) ||
    !Number.isInteger(x.level) ||
    !num(x.room, 0, 4) ||
    !Number.isInteger(x.room) ||
    !num(x.wave, 1, 3) ||
    !Number.isInteger(x.wave) ||
    !num(x.health, 1, 200) ||
    !num(x.armor, 0, 200) ||
    !ammo(x.ammo) ||
    !ammo(x.altAmmo) ||
    !num(x.weapon, 0, 4) ||
    !num(x.souls, 0, 66) ||
    typeof x.cardUsed !== "boolean" ||
    !Array.isArray(x.taken) ||
    !x.taken.every((n) => Number.isInteger(n) && n >= 0 && n <= 4) ||
    !num(x.kills, 0, 1e6) ||
    !num(x.levelSouls, 0, 1e6) ||
    !num(x.secrets, 0, 100) ||
    !num(x.elapsed, 0, 1e7) ||
    !num(x.deaths, 0, 1e5) ||
    !sector ||
    !num(sector.kills, 0, 1e6) ||
    !num(sector.souls, 0, 1e6) ||
    !num(sector.secrets, 0, 100)
  )
    return undefined;
  return {
    level: x.level as number,
    room: x.room as number,
    wave: x.wave as number,
    health: x.health as number,
    armor: x.armor as number,
    ammo: [...(x.ammo as number[])],
    altAmmo: [...(x.altAmmo as number[])],
    weapon: Math.floor(x.weapon as number),
    souls: Math.floor(x.souls as number),
    cardUsed: x.cardUsed,
    taken: [...new Set(x.taken as number[])],
    kills: x.kills as number,
    levelSouls: x.levelSouls as number,
    secrets: x.secrets as number,
    elapsed: x.elapsed as number,
    deaths: Math.floor(x.deaths as number),
    sector: {
      kills: sector.kills as number,
      souls: sector.souls as number,
      secrets: sector.secrets as number,
    },
  };
}
export const freshSave = (): Save => ({
  version: 1,
  unlocked: 0,
  level: 0,
  room: 0,
  kills: 0,
  souls: 0,
  cards: [],
  selectedCard: 0,
  best: {},
  completed: false,
  records: {},
});
export function parseSave(raw: string | null): Save {
  try {
    const s = JSON.parse(raw || "null");
    if (!s || s.version !== 1) return freshSave();
    const cards: number[] = Array.isArray(s.cards)
      ? [
          ...new Set<number>(
            s.cards.filter(
              (x: unknown) =>
                Number.isInteger(x) && Number(x) >= 0 && Number(x) < 3,
            ),
          ),
        ]
      : [];
    return {
      version: 1,
      unlocked: clamp(Math.floor(Number(s.unlocked) || 0), 0, 23),
      level: clamp(Math.floor(Number(s.level) || 0), 0, 23),
      room: clamp(Math.floor(Number(s.room) || 0), 0, 4),
      kills: Math.max(0, Number(s.kills) || 0),
      souls: Math.max(0, Number(s.souls) || 0),
      cards,
      // Never leave an unowned card equipped while another is owned.
      selectedCard: ownedSelection(
        cards,
        clamp(Math.floor(Number(s.selectedCard) || 0), 0, 2),
      ),
      best:
        s.best && typeof s.best === "object"
          ? (Object.fromEntries(
              Object.entries(s.best).filter(
                ([, v]) =>
                  typeof v === "number" && Number.isFinite(v) && v >= 0,
              ),
            ) as Record<string, number>)
          : {},
      completed: s.completed === true,
      records: parseRecords(s.records),
      ...(() => {
        const resume = parseResume(s.resume);
        // A snapshot only counts for the sector the save points at.
        return resume && resume.level === s.level && resume.room === s.room
          ? { resume }
          : {};
      })(),
    };
  } catch {
    return freshSave();
  }
}
export function damageAfterArmor(damage: number, armor: number) {
  const absorbed = Math.min(armor, damage * 0.6);
  return { health: damage - absorbed, armor: armor - absorbed };
}
export function segmentSphere(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
) {
  const dx = bx - ax,
    dy = by - ay,
    dz = bz - az;
  const t = clamp(
    ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) /
      (dx * dx + dy * dy + dz * dz || 1),
    0,
    1,
  );
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy, az + dz * t - cz) <= r;
}
/** Voussoir layout for a round arch: wide spans get more stones so the ring stays closed. */
export function archSegments(width: number, height: number) {
  const radius = width / 2,
    springing = height - radius,
    tangential = 0.78,
    radial = Math.min(width * 0.16, 1.4),
    count = Math.max(12, Math.ceil((Math.PI * radius) / (tangential * 0.9)));
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + 0.5) / count) * Math.PI;
    return {
      x: Math.cos(angle) * radius,
      y: springing + Math.sin(angle) * radius,
      rotation: angle - Math.PI / 2,
      tangential,
      radial,
    };
  });
}
/**
 * Stereo pan (-1 left … 1 right) and gain for a sound at (sx, sz) heard by a
 * listener at (lx, lz) facing `yaw` (0 looks down -Z). Silent beyond `range`.
 */
export function spatialCue(
  lx: number,
  lz: number,
  yaw: number,
  sx: number,
  sz: number,
  range = 48,
) {
  const dx = sx - lx,
    dz = sz - lz,
    distance = Math.hypot(dx, dz);
  if (distance > range) return { pan: 0, gain: 0, behind: false, distance };
  const right =
      distance > 0.01
        ? (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance
        : 0,
    ahead =
      distance > 0.01
        ? (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) / distance
        : 1,
    behind = ahead < -0.2;
  const gain =
    clamp(1 / (1 + Math.max(0, distance - 3) / 9), 0.15, 1) *
    (behind ? 0.85 : 1);
  // Keep some of every cue in both ears; hard pans are fatiguing on headphones.
  return { pan: right * 0.6, gain, behind, distance };
}
/** Signed bearing (radians, positive to the right, ±π behind) of (sx, sz) seen from a listener facing `yaw`. */
export function bearing(
  lx: number,
  lz: number,
  yaw: number,
  sx: number,
  sz: number,
) {
  const dx = sx - lx,
    dz = sz - lz;
  return Math.atan2(
    dx * Math.cos(yaw) - dz * Math.sin(yaw),
    -dx * Math.sin(yaw) - dz * Math.cos(yaw),
  );
}

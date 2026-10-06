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
});
export function parseSave(raw: string | null): Save {
  try {
    const s = JSON.parse(raw || "null");
    if (!s || s.version !== 1) return freshSave();
    return {
      version: 1,
      unlocked: clamp(Math.floor(Number(s.unlocked) || 0), 0, 23),
      level: clamp(Math.floor(Number(s.level) || 0), 0, 23),
      room: clamp(Math.floor(Number(s.room) || 0), 0, 4),
      kills: Math.max(0, Number(s.kills) || 0),
      souls: Math.max(0, Number(s.souls) || 0),
      cards: Array.isArray(s.cards)
        ? [
            ...new Set<number>(
              s.cards.filter(
                (x: unknown) =>
                  Number.isInteger(x) && Number(x) >= 0 && Number(x) < 3,
              ),
            ),
          ]
        : [],
      selectedCard: clamp(Math.floor(Number(s.selectedCard) || 0), 0, 2),
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

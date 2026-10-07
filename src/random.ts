/**
 * The game's own random sequence (mulberry32). Gameplay and combat effects draw from it
 * instead of Math.random, which Three.js consumes for every object it creates
 * (generateUUID) and which therefore depends on what happens to be cached. Seeded from
 * Math.random at start-up, so ordinary play is as random as before; seedRandom() makes a
 * run repeatable.
 */
let state = (Math.random() * 4294967296) | 0;
function mix(t: number) {
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function random() {
  return mix((state = (state + 0x6d2b79f5) | 0));
}
/** A separate sequence, for systems that must not move the game's (sound, for one). */
export function generator(seed: number) {
  return () => mix((seed = (seed + 0x6d2b79f5) | 0));
}
export function seedRandom(seed: number) {
  state = seed | 0;
}
/** The current position in the sequence, to check that something left it untouched. */
export function randomState() {
  return state;
}
/** Run `build` without moving the game's sequence (cosmetic set-up such as the warm-up). */
export function isolated<T>(build: () => T, seed = 1): T {
  const saved = state;
  state = seed | 0;
  try {
    return build();
  } finally {
    state = saved;
  }
}

/** At this much health or less, the HUD and a heartbeat warn that you are close to death. */
export const LOW_HEALTH = 25;
/** How strongly to warn: 0 above {@link LOW_HEALTH}, rising from 0.4 to 1 as health falls. */
export function lowHealth(health: number) {
  if (health > LOW_HEALTH || health <= 0) return 0;
  return 0.4 + 0.6 * (1 - health / LOW_HEALTH);
}
/** Seconds between heartbeats: about 67 a minute at 25 health, 109 close to none. */
export function heartbeatInterval(health: number) {
  return 0.55 + 0.35 * Math.max(0, Math.min(1, health / LOW_HEALTH));
}

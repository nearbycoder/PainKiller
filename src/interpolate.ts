import * as T from "three";

/**
 * Draws moving objects between the last two fixed simulation steps, so motion is even
 * on displays that are not exactly 60 Hz. {@link record} runs at the start of every
 * step; {@link apply} moves objects part of the way from where that step found them
 * to where it left them, just for drawing, and {@link restore} puts the simulated
 * positions back, so nothing the game decides can see the drawn ones.
 */
export class Interpolator {
  /** Where each tracked object was at the start of the latest step: x, y, z, yaw. */
  private previous = new Map<T.Object3D, Float64Array>();
  /** Simulated transforms held while drawing, and whether yaw was moved (arrays reused). */
  private store = new Map<T.Object3D, Float64Array>();
  private held = new Set<T.Object3D>();
  private generation = 0;
  private seen = new Map<T.Object3D, number>();
  /**
   * @param jump Anything that moved further than this in one step (a sector start, a
   * rescued enemy) is drawn where it landed rather than slid there.
   */
  constructor(public jump = 4) {}
  /** Remember where these objects are as a simulation step begins. */
  record(objects: Iterable<T.Object3D>) {
    this.generation++;
    for (const o of objects) {
      let p = this.previous.get(o);
      if (!p) this.previous.set(o, (p = new Float64Array(4)));
      p[0] = o.position.x;
      p[1] = o.position.y;
      p[2] = o.position.z;
      p[3] = o.rotation.y;
      this.seen.set(o, this.generation);
    }
    // Forget objects that are no longer tracked (killed enemies, spent projectiles).
    for (const [o, g] of this.seen)
      if (g !== this.generation) {
        this.seen.delete(o);
        this.previous.delete(o);
        this.store.delete(o);
      }
  }
  /** Forget everything, so nothing is slid from before a teleport or a new sector. */
  reset() {
    this.previous.clear();
    this.seen.clear();
    this.store.clear();
  }
  /**
   * Draw tracked objects `alpha` (0–1) of the way from their previous step to the
   * current one. Objects with `yaw` set also turn part of the way. Call
   * {@link restore} once drawing is done.
   */
  apply(objects: Iterable<T.Object3D>, alpha: number, yaw = false) {
    const a = Math.min(1, Math.max(0, alpha));
    for (const o of objects) {
      const p = this.previous.get(o);
      if (!p || this.held.has(o)) continue;
      const dx = o.position.x - p[0],
        dy = o.position.y - p[1],
        dz = o.position.z - p[2];
      if (dx * dx + dy * dy + dz * dz > this.jump * this.jump) continue;
      let h = this.store.get(o);
      if (!h) this.store.set(o, (h = new Float64Array(5)));
      h[0] = o.position.x;
      h[1] = o.position.y;
      h[2] = o.position.z;
      h[3] = o.rotation.y;
      h[4] = yaw ? 1 : 0;
      this.held.add(o);
      o.position.set(p[0] + dx * a, p[1] + dy * a, p[2] + dz * a);
      if (yaw) o.rotation.y = p[3] + (h[3] - p[3]) * a;
    }
  }
  /**
   * Put back the simulated transforms that {@link apply} replaced. Drawing refreshed
   * their world matrices (and their bones') at the drawn place, and hit tests read
   * those, so they are refreshed again here.
   */
  restore() {
    for (const o of this.held) {
      const h = this.store.get(o)!;
      o.position.set(h[0], h[1], h[2]);
      if (h[4]) o.rotation.y = h[3];
      o.updateMatrixWorld(true);
    }
    this.held.clear();
  }
}

/** The point `alpha` of the way from `from` to `to`, or `to` after a jump. */
export function between(
  from: T.Vector3,
  to: T.Vector3,
  alpha: number,
  out: T.Vector3,
  jump = 4,
) {
  if (from.distanceToSquared(to) > jump * jump) return out.copy(to);
  return out.lerpVectors(from, to, Math.min(1, Math.max(0, alpha)));
}

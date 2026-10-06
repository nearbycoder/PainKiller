/** One-time combat hints, shown once each the first time their situation comes up. */
export type HintId =
  "arsenal" | "freeze" | "grenade" | "storm" | "souls" | "tarot";
export type InputKind = "keyboard" | "controller" | "touch";

const TEXT: Record<HintId, Record<InputKind, string>> = {
  arsenal: {
    keyboard:
      "All five weapons are yours · 1–5 or R / V to switch · right mouse fires each alternate mode",
    controller:
      "All five weapons are yours · RB / LB to switch · LT fires each alternate mode",
    touch:
      "All five weapons are yours · ◀ ▶ to switch · ALT fires each alternate mode",
  },
  freeze: {
    keyboard: "Frozen · switch to the shotgun's left-mouse blast to shatter it",
    controller: "Frozen · hit it with the shotgun's RT blast to shatter it",
    touch: "Frozen · hit it with the shotgun's FIRE blast to shatter it",
  },
  grenade: {
    keyboard: "Shoot a stake (left mouse) into your own grenade to launch it",
    controller: "Shoot a stake (RT) into your own grenade to launch it",
    touch: "Shoot a stake (FIRE) into your own grenade to launch it",
  },
  storm: {
    keyboard:
      "Hold both mouse buttons for a storm orb · costs 1 shuriken + 16 charge",
    controller: "Hold RT + LT for a storm orb · costs 1 shuriken + 16 charge",
    touch: "Hold FIRE + ALT for a storm orb · costs 1 shuriken + 16 charge",
  },
  souls: {
    keyboard:
      "Souls heal 1 HP · gather 66 to become the Wraith: invulnerable, 4× damage",
    controller:
      "Souls heal 1 HP · gather 66 to become the Wraith: invulnerable, 4× damage",
    touch:
      "Souls heal 1 HP · gather 66 to become the Wraith: invulnerable, 4× damage",
  },
  tarot: {
    keyboard:
      "Press Q to awaken your tarot card for 30 seconds, once per sector",
    controller:
      "Press Y to awaken your tarot card for 30 seconds, once per sector",
    touch: "Tap TAROT to awaken your card for 30 seconds, once per sector",
  },
};
export const HINT_IDS = Object.keys(TEXT) as HintId[];
export const hintText = (id: HintId, input: InputKind) => TEXT[id][input];

export class HintQueue {
  readonly seen: Set<HintId>;
  enabled = true;
  private queue: HintId[] = [];
  private current: { id: HintId; time: number } | null = null;
  constructor(
    seen: Iterable<string> = [],
    readonly duration = 6,
  ) {
    this.seen = new Set(
      [...seen].filter((id): id is HintId => HINT_IDS.includes(id as HintId)),
    );
  }
  /** Queue a hint unless it was already shown, is pending, or hints are off. */
  trigger(id: HintId) {
    if (
      !this.enabled ||
      this.seen.has(id) ||
      this.queue.includes(id) ||
      this.current?.id === id
    )
      return false;
    this.queue.push(id);
    return true;
  }
  /**
   * Advance the visible hint. While `blocked` (a general's introduction) nothing new
   * appears. Returns the id of a hint that just became visible, so it can be saved as seen.
   */
  update(dt: number, blocked = false): HintId | null {
    if (this.current && (this.current.time -= dt) <= 0) this.current = null;
    if (this.current || blocked || !this.enabled) return null;
    const id = this.queue.shift();
    if (!id) return null;
    this.seen.add(id);
    this.current = { id, time: this.duration };
    return id;
  }
  get visible() {
    return this.current?.id ?? null;
  }
  /** Fade level of the visible hint, 0–1. */
  get opacity() {
    if (!this.current) return 0;
    const t = this.current.time;
    return Math.min(1, t / 0.6, (this.duration - t) / 0.3 + 0.2);
  }
  /** Drop what is pending (sector change, death) but keep what has been seen. */
  clear() {
    this.queue = [];
    this.current = null;
  }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.clear();
  }
}

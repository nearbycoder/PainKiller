/**
 * The messages in the middle of the view. There used to be one toast, and every message
 * replaced the one showing, so feedback such as "AMMUNITION REPLENISHED" cut off the
 * Wraith or a general's name after a fraction of a second. Messages now have a rank:
 *
 * - urgent (a general's shockwave) shows at once; the message it interrupts comes back
 *   for the rest of its time afterwards;
 * - major (waves, sectors, level and general names, relics, the tarot, the Wraith) shows
 *   for at least {@link MIN_SHOWN} seconds, or its whole time if shorter, before another
 *   major message takes its place; one that arrives sooner waits its turn;
 * - minor (feedback on the player's own action: ammunition, an empty weapon, the storm
 *   orb's cost) never replaces anything: it shows on a smaller line under a major or
 *   urgent message, or on the main line when nothing else is showing.
 *
 * It reads no clock and draws no random numbers: `update()` is called from the game's
 * fixed simulation step.
 */
export type MessageRank = "minor" | "major" | "urgent";

export interface Message {
  text: string;
  /** Seconds left on screen. */
  left: number;
  /** Seconds shown so far. */
  shown: number;
  rank: MessageRank;
}

/** How long a major message is guaranteed before another major one replaces it. */
export const MIN_SHOWN = 2;
/** An interrupted message comes back only if at least this much of it is left. */
export const MIN_RESUME = 0.5;
/** Major messages waiting for their turn; older ones beyond this are dropped. */
export const MAX_WAITING = 3;

const message = (text: string, time: number, rank: MessageRank): Message => ({
  text,
  left: time,
  shown: 0,
  rank,
});

export class Messages {
  /** The major or urgent message on the main line. */
  main: Message | null = null;
  /** The minor message, under the main one (or on the main line when it is empty). */
  minor: Message | null = null;
  /** A major message an urgent one interrupted. */
  interrupted: Message | null = null;
  waiting: Message[] = [];

  push(text: string, time = 3, rank: MessageRank = "major") {
    if (rank === "minor") {
      this.minor = message(text, time, rank);
      return;
    }
    const main = this.main;
    if (main?.text === text) {
      // The same message again (a second shockwave ring): keep it up for longer.
      main.left = Math.max(main.left, time);
      return;
    }
    if (rank === "urgent") {
      if (main?.rank === "major" && main.left >= MIN_RESUME)
        this.interrupted = main;
      this.main = message(text, time, rank);
      return;
    }
    if (!main) {
      this.main = message(text, time, rank);
      return;
    }
    if (this.waiting.some((m) => m.text === text)) return;
    this.waiting.push(message(text, time, rank));
    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
    this.advance();
  }

  update(dt: number) {
    for (const m of [this.main, this.minor]) {
      if (!m) continue;
      m.left -= dt;
      m.shown += dt;
    }
    if (this.minor && this.minor.left <= 0) this.minor = null;
    if (this.main && this.main.left <= 0) this.main = null;
    this.advance();
  }

  /** Puts the next message on the main line if the current one has had its time. */
  private advance() {
    const main = this.main;
    if (main?.rank === "urgent") return;
    if (!main && this.interrupted) {
      this.main = this.interrupted;
      this.interrupted = null;
      return;
    }
    if (
      this.waiting.length &&
      (!main || main.shown >= Math.min(MIN_SHOWN, main.shown + main.left))
    )
      this.main = this.waiting.shift()!;
  }

  /** The main line: the major or urgent message, or else the minor one. */
  get line() {
    return (this.main ?? this.minor)?.text ?? "";
  }
  /** The smaller line under a major or urgent message. */
  get under() {
    return this.main && this.minor ? this.minor.text : "";
  }
  /** Seconds left on the main line. */
  get left() {
    return Math.max(0, (this.main ?? this.minor)?.left ?? 0);
  }
  /** Whether a message is on screen or waiting its turn. */
  has(text: string) {
    return [this.main, this.minor, this.interrupted, ...this.waiting].some(
      (m) => m?.text === text,
    );
  }
  clear() {
    this.main = this.minor = this.interrupted = null;
    this.waiting = [];
  }
}

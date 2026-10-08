import { describe, expect, it } from "vitest";
import { MAX_WAITING, MIN_SHOWN, Messages } from "../src/messages";

/** Advances the queue in simulation steps, as the game does. */
const run = (m: Messages, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) m.update(1 / 60);
};

describe("messages", () => {
  it("shows a message on the main line until its time is up", () => {
    const m = new Messages();
    m.push("WAVE 1  /  THE GATES ARE SEALED", 2);
    expect(m.line).toBe("WAVE 1  /  THE GATES ARE SEALED");
    run(m, 1.9);
    expect(m.line).toBe("WAVE 1  /  THE GATES ARE SEALED");
    expect(m.left).toBeCloseTo(0.1, 5);
    run(m, 0.2);
    expect(m.line).toBe("");
    expect(m.left).toBe(0);
  });

  it("puts a minor message under a major one instead of replacing it", () => {
    const m = new Messages();
    m.push("WRAITH FORM  /  UNCHAINED FOR 15 SECONDS", 4);
    run(m, 0.5);
    m.push("AMMUNITION REPLENISHED", 1, "minor");
    expect(m.line).toBe("WRAITH FORM  /  UNCHAINED FOR 15 SECONDS");
    expect(m.under).toBe("AMMUNITION REPLENISHED");
    run(m, 1.1);
    expect(m.under).toBe("");
    expect(m.line).toBe("WRAITH FORM  /  UNCHAINED FOR 15 SECONDS");
    run(m, 2.5);
    expect(m.line).toBe("");
  });

  it("shows a minor message on the main line when nothing else is showing", () => {
    const m = new Messages();
    m.push("OUT OF ROCKETS", 1, "minor");
    expect(m.line).toBe("OUT OF ROCKETS");
    expect(m.under).toBe("");
    m.push("OUT OF SHELLS", 1, "minor");
    expect(m.line).toBe("OUT OF SHELLS");
    // A major message takes the main line; the minor one moves under it.
    m.push("SECTOR CLEANSED  /  ENTER THE GREEN GATE", 5);
    expect(m.line).toBe("SECTOR CLEANSED  /  ENTER THE GREEN GATE");
    expect(m.under).toBe("OUT OF SHELLS");
  });

  it(`gives a major message ${MIN_SHOWN} s before another replaces it`, () => {
    const m = new Messages();
    m.push("25 SOULS  /  TAROT CONDITION MET", 4);
    run(m, 0.5);
    m.push("SECTOR CLEANSED  /  ENTER THE GREEN GATE", 5);
    expect(m.line).toBe("25 SOULS  /  TAROT CONDITION MET");
    expect(m.has("SECTOR CLEANSED  /  ENTER THE GREEN GATE")).toBe(true);
    run(m, MIN_SHOWN - 0.5 - 1 / 30);
    expect(m.line).toBe("25 SOULS  /  TAROT CONDITION MET");
    run(m, 1 / 15);
    expect(m.line).toBe("SECTOR CLEANSED  /  ENTER THE GREEN GATE");
    // The waiting message gets its whole time once it shows.
    expect(m.left).toBeGreaterThan(4.9);
  });

  it("replaces a major message that has had its time at once", () => {
    const m = new Messages();
    m.push("HALLOWED GROUND  /  The dead have forgotten how to rest.", 5);
    run(m, 3);
    m.push("WAVE 1  /  THE GATES ARE SEALED", 2);
    expect(m.line).toBe("WAVE 1  /  THE GATES ARE SEALED");
  });

  it("lets a short major message finish before the next one", () => {
    const m = new Messages();
    m.push("THE GENERAL ENRAGES", 1.5);
    run(m, 0.2);
    m.push("THE GENERAL HAS FALLEN", 4);
    run(m, 1.2);
    expect(m.line).toBe("THE GENERAL ENRAGES");
    run(m, 0.2);
    expect(m.line).toBe("THE GENERAL HAS FALLEN");
  });

  it("shows an urgent message at once and brings back the one it interrupted", () => {
    const m = new Messages();
    m.push("THE SAND COLOSSUS", 5);
    run(m, 1);
    m.push("SHOCKWAVE  /  JUMP", 1.2, "urgent");
    expect(m.line).toBe("SHOCKWAVE  /  JUMP");
    // A major message cannot replace an urgent one; it waits.
    m.push("THE GENERAL ENRAGES", 2);
    run(m, 1.1);
    expect(m.line).toBe("SHOCKWAVE  /  JUMP");
    // A second ring keeps the warning up.
    m.push("SHOCKWAVE  /  JUMP", 1.2, "urgent");
    run(m, 1.1);
    expect(m.line).toBe("SHOCKWAVE  /  JUMP");
    run(m, 0.2);
    expect(m.line).toBe("THE SAND COLOSSUS");
    // It had four seconds left when interrupted (less the frame it came back on).
    expect(m.left).toBeGreaterThan(3.8);
    expect(m.left).toBeLessThanOrEqual(4);
    // The general's name had already shown for a second, so the waiting message
    // follows a second later.
    run(m, 1.05);
    expect(m.line).toBe("THE GENERAL ENRAGES");
  });

  it("does not bring back an interrupted message that had almost ended", () => {
    const m = new Messages();
    m.push("WAVE 2  /  THE GATES ARE SEALED", 2);
    run(m, 1.7);
    m.push("SHOCKWAVE  /  JUMP", 1.2, "urgent");
    run(m, 1.3);
    expect(m.line).toBe("");
  });

  it("keeps the waiting line short and without repeats", () => {
    const m = new Messages();
    m.push("A", 5);
    m.push("B", 5);
    m.push("B", 5);
    for (const t of ["C", "D", "E"]) m.push(t, 5);
    expect(m.waiting.map((w) => w.text)).toEqual(["C", "D", "E"]);
    expect(m.waiting.length).toBe(MAX_WAITING);
  });

  it("clears everything", () => {
    const m = new Messages();
    m.push("A", 5);
    m.push("B", 5);
    m.push("C", 1, "minor");
    m.clear();
    expect(m.line).toBe("");
    expect(m.under).toBe("");
    expect(m.has("B")).toBe(false);
    run(m, 1);
    expect(m.line).toBe("");
  });
});

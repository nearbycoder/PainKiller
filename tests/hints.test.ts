import { describe, expect, it } from "vitest";
import { HINT_IDS, HintQueue, hintText } from "../src/hints";

describe("one-time combat hints", () => {
  it("shows each hint once, in order, one at a time", () => {
    const hints = new HintQueue([], 6);
    expect(hints.trigger("arsenal")).toBe(true);
    expect(hints.trigger("freeze")).toBe(true);
    expect(hints.trigger("arsenal")).toBe(false);
    expect(hints.update(0.1)).toBe("arsenal");
    expect(hints.visible).toBe("arsenal");
    expect(hints.update(3)).toBe(null);
    expect(hints.update(3.1)).toBe("freeze");
    expect(hints.trigger("arsenal")).toBe(false);
    hints.update(7);
    expect(hints.visible).toBe(null);
    expect([...hints.seen]).toEqual(["arsenal", "freeze"]);
  });
  it("restores seen hints and ignores unknown saved ids", () => {
    const hints = new HintQueue(["storm", "bogus"]);
    expect([...hints.seen]).toEqual(["storm"]);
    expect(hints.trigger("storm")).toBe(false);
  });
  it("waits while blocked by a general's introduction", () => {
    const hints = new HintQueue();
    hints.trigger("souls");
    expect(hints.update(0.1, true)).toBe(null);
    expect(hints.visible).toBe(null);
    expect(hints.update(0.1, false)).toBe("souls");
  });
  it("never shows anything once disabled, and forgets what was pending", () => {
    const hints = new HintQueue();
    hints.trigger("grenade");
    hints.update(0.1);
    hints.setEnabled(false);
    expect(hints.visible).toBe(null);
    expect(hints.trigger("tarot")).toBe(false);
    expect(hints.update(1)).toBe(null);
    hints.setEnabled(true);
    expect(hints.trigger("grenade")).toBe(false);
    expect(hints.trigger("tarot")).toBe(true);
  });
  it("has text for every input type", () => {
    for (const id of HINT_IDS)
      for (const input of ["keyboard", "controller", "touch"] as const)
        expect(hintText(id, input).length).toBeGreaterThan(10);
    expect(hintText("storm", "controller")).toMatch(/RT \+ LT/);
  });
});

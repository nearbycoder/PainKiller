import { describe, expect, it } from "vitest";
import {
  bindPad,
  clonePadBindings,
  DEFAULT_PAD_BINDINGS,
  PAD_ACTIONS,
  PAD_START,
  padActionLabel,
  padBindable,
  padLabel,
  parsePadBindings,
} from "../src/bindings";
import { parseSettings } from "../src/settings";
import { hintText } from "../src/hints";

describe("controller bindings", () => {
  it("keeps the old fixed layout as the default, with no shared buttons", () => {
    const used = PAD_ACTIONS.map(([a]) => DEFAULT_PAD_BINDINGS[a]).filter(
      (b) => b !== null,
    );
    expect(new Set(used).size).toBe(used.length);
    expect(DEFAULT_PAD_BINDINGS).toMatchObject({
      primary: 7,
      alternate: 6,
      jump: 0,
      sprint: 10,
      previous: 4,
      next: 5,
      use: 2,
      tarot: 3,
      inspect: 1,
    });
    expect(used).not.toContain(PAD_START);
    expect(parseSettings("{}").padBindings).toEqual(
      clonePadBindings(DEFAULT_PAD_BINDINGS),
    );
  });
  it("never binds Start, Home or out-of-range buttons", () => {
    expect(padBindable(PAD_START)).toBe(false);
    expect(padBindable(16)).toBe(false);
    expect(padBindable(-1)).toBe(false);
    expect(padBindable(2.5)).toBe(false);
    expect(padBindable("7")).toBe(false);
    for (const b of [0, 8, 10, 12, 15]) expect(padBindable(b)).toBe(true);
  });
  it("parses saved bindings, dropping bad values and duplicates", () => {
    const b = parsePadBindings({
      jump: 7,
      primary: 7,
      alternate: PAD_START,
      weapon1: 12,
      bogus: 3,
    });
    // A duplicated button goes to the first action in menu order.
    expect(b.primary).toBe(7);
    expect(b.jump).toBe(null);
    expect(b.alternate).toBe(null);
    expect(b.weapon1).toBe(12);
    expect(b.tarot).toBe(3); // default kept; "bogus" ignored
    // A default whose button a saved action claimed is dropped, not shared.
    expect(parsePadBindings({ inspect: 0 }).jump).toBe(null);
    expect(parsePadBindings("nonsense")).toEqual(DEFAULT_PAD_BINDINGS);
    expect(parsePadBindings([1, 2])).toEqual(DEFAULT_PAD_BINDINGS);
    // Explicitly unbound stays unbound.
    expect(parsePadBindings({ use: null }).use).toBe(null);
  });
  it("moves a button from the action that had it", () => {
    const b = clonePadBindings(DEFAULT_PAD_BINDINGS);
    expect(bindPad(b, "jump", 7)).toBe("primary");
    expect(b.jump).toBe(7);
    expect(b.primary).toBe(null);
    expect(bindPad(b, "jump", 7)).toBe(null);
    expect(bindPad(b, "weapon2", 13)).toBe(null);
    expect(b.weapon2).toBe(13);
    expect(bindPad(b, "use", PAD_START)).toBe(null);
    expect(b.use).toBe(2);
    const json = JSON.parse(JSON.stringify({ padBindings: b }));
    expect(parseSettings(JSON.stringify(json)).padBindings).toEqual(b);
  });
  it("labels buttons and words controller hints with the bound buttons", () => {
    expect(padLabel(0)).toBe("A");
    expect(padLabel(7)).toBe("RT");
    expect(padLabel(14)).toBe("D-PAD ←");
    expect(padActionLabel(DEFAULT_PAD_BINDINGS, "weapon1")).toBe("—");
    expect(hintText("storm", "controller")).toMatch(/Hold RT \+ LT/);
    expect(hintText("tarot", "controller")).toMatch(/^Press Y /);
    expect(hintText("arsenal", "controller")).toMatch(/RB \/ LB to switch/);
    expect(hintText("tarot", "controller", () => "D-PAD ↑")).toMatch(
      /^Press D-PAD ↑ /,
    );
  });
});

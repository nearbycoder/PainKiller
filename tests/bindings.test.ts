import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  actionLabel,
  actionsByCode,
  bind,
  bindable,
  cloneBindings,
  DEFAULT_BINDINGS,
  keyLabel,
  moveLabel,
  parseBindings,
  unbind,
} from "../src/bindings";
import { defaults, parseSettings } from "../src/settings";
import { hintText } from "../src/hints";

describe("key bindings", () => {
  it("binds every action by default with no shared codes", () => {
    const codes = ACTIONS.flatMap(([a]) => DEFAULT_BINDINGS[a]);
    expect(ACTIONS.every(([a]) => DEFAULT_BINDINGS[a].length > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it("never allows Escape and accepts keys and mouse buttons", () => {
    expect(bindable("Escape")).toBe(false);
    expect(bindable("KeyJ")).toBe(true);
    expect(bindable("Mouse3")).toBe(true);
    expect(bindable("Mouse9")).toBe(false);
    expect(bindable("MediaPlayPause")).toBe(false);
  });
  it("moves a key that another action already uses", () => {
    const b = cloneBindings(DEFAULT_BINDINGS);
    expect(bind(b, "jump", 0, "KeyW")).toBe("forward");
    expect(b.jump).toEqual(["KeyW"]);
    expect(b.forward).toEqual([]);
    expect(bind(b, "jump", 1, "Mouse3")).toBe(null);
    expect(b.jump).toEqual(["KeyW", "Mouse3"]);
    // Rebinding a slot to the code in the action's other slot swaps nothing in.
    expect(bind(b, "jump", 0, "Mouse3")).toBe(null);
    expect(b.jump).toEqual(["Mouse3"]);
    expect(bind(b, "jump", 0, "Escape")).toBe(null);
    expect(b.jump).toEqual(["Mouse3"]);
    unbind(b, "jump", 0);
    expect(b.jump).toEqual([]);
    expect(DEFAULT_BINDINGS.forward).toEqual(["KeyW"]);
  });
  it("parses saved bindings defensively", () => {
    const b = parseBindings({
      forward: ["ArrowUp", "Escape", 4, "KeyW", "KeyT"],
      jump: "Space",
      bogus: ["KeyB"],
    });
    expect(b.forward).toEqual(["ArrowUp", "KeyW"]);
    expect(b.jump).toEqual(["Space"]);
    // The default owner of a code a saved action claimed loses it.
    expect(b.lookUp).toEqual([]);
    expect(parseBindings(null)).toEqual(cloneBindings(DEFAULT_BINDINGS));
    expect(parseBindings([])).toEqual(cloneBindings(DEFAULT_BINDINGS));
  });
  it("round trips through the saved options", () => {
    const b = cloneBindings(DEFAULT_BINDINGS);
    bind(b, "use", 0, "Mouse4");
    const s = parseSettings(JSON.stringify({ ...defaults, bindings: b }));
    expect(s.bindings.use).toEqual(["Mouse4"]);
    expect(parseSettings("{}").bindings).toEqual(
      cloneBindings(DEFAULT_BINDINGS),
    );
  });
  it("labels keys and buttons for prompts", () => {
    expect(keyLabel("KeyE")).toBe("E");
    expect(keyLabel("Digit3")).toBe("3");
    expect(keyLabel("Mouse0")).toBe("LMB");
    expect(keyLabel("Mouse3")).toBe("MOUSE 4");
    expect(keyLabel("Numpad8")).toBe("NUM 8");
    expect(actionLabel(DEFAULT_BINDINGS, "primary")).toBe("LMB / Z");
    expect(moveLabel(DEFAULT_BINDINGS)).toBe("WASD");
    const b = cloneBindings(DEFAULT_BINDINGS);
    bind(b, "forward", 0, "KeyI");
    expect(moveLabel(b)).toBe("I A S D");
    expect(actionsByCode(b).get("KeyI")).toEqual(["forward"]);
  });
  it("words keyboard hints with the bound keys", () => {
    expect(hintText("tarot", "keyboard")).toMatch(/^Press Q /);
    expect(hintText("tarot", "keyboard", () => "MOUSE 5")).toMatch(
      /^Press MOUSE 5 /,
    );
    expect(hintText("arsenal", "keyboard")).toMatch(/1–5 or R \/ V/);
  });
});

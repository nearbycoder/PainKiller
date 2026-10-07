import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { parseWindowState, windowPlacement, DEFAULT_SIZE } =
  require("../desktop/window-state.cjs") as typeof import("../desktop/window-state.cjs");

const screen = { x: 0, y: 0, width: 2560, height: 1400 };
const right = { x: 2560, y: 0, width: 1920, height: 1040 };
const state = (bounds: object, extra = {}) =>
  parseWindowState(JSON.stringify({ bounds, ...extra }));

describe("desktop window state", () => {
  it("ignores missing and malformed files", () => {
    for (const raw of [
      "",
      "{ not json",
      "null",
      "[]",
      "{}",
      '{"bounds":{"width":"wide","height":700}}',
      '{"bounds":{"width":0,"height":700}}',
    ])
      expect(parseWindowState(raw)).toBeNull();
    expect(windowPlacement(null, [screen])).toEqual({
      bounds: DEFAULT_SIZE,
      maximized: false,
      fullscreen: false,
    });
  });

  it("keeps a window that fits where it was", () => {
    const s = state({ x: 300, y: 120, width: 1280, height: 800 });
    expect(windowPlacement(s, [screen]).bounds).toEqual({
      x: 300,
      y: 120,
      width: 1280,
      height: 800,
    });
    // On a second display too.
    const there = state({ x: 2700, y: 40, width: 1200, height: 760 });
    expect(windowPlacement(there, [screen, right]).bounds).toMatchObject({
      x: 2700,
      y: 40,
    });
  });

  it("keeps the maximized and fullscreen flags", () => {
    const s = state(
      { x: 10, y: 10, width: 1200, height: 700 },
      { maximized: true, fullscreen: true },
    );
    expect(windowPlacement(s, [screen])).toMatchObject({
      maximized: true,
      fullscreen: true,
      bounds: { width: 1200, height: 700 },
    });
    expect(
      windowPlacement(
        state({ width: 1200, height: 700 }, { fullscreen: "yes" }),
        [],
      ).fullscreen,
    ).toBe(false);
  });

  it("drops a position that is on no display any more", () => {
    // The second monitor was unplugged.
    const gone = state({ x: 2700, y: 40, width: 1200, height: 760 });
    expect(windowPlacement(gone, [screen]).bounds).toEqual(DEFAULT_SIZE);
  });

  it("pulls a window part off its display back onto it", () => {
    const s = state({ x: 1500, y: -50, width: 1280, height: 800 });
    expect(windowPlacement(s, [screen]).bounds).toEqual({
      x: 2560 - 1280,
      y: 0,
      width: 1280,
      height: 800,
    });
  });

  it("keeps sizes between the minimum and the display", () => {
    const tiny = state({ x: 100, y: 100, width: 300, height: 200 });
    expect(windowPlacement(tiny, [screen]).bounds).toMatchObject({
      width: 960,
      height: 600,
    });
    const huge = state({ x: 0, y: 0, width: 3000, height: 1600 });
    expect(windowPlacement(huge, [screen]).bounds).toEqual({
      x: 0,
      y: 0,
      width: 2560,
      height: 1400,
    });
  });

  it("keeps the size where no position is reported (Wayland)", () => {
    const s = state({ width: 1104, height: 702 });
    expect(windowPlacement(s, [screen]).bounds).toEqual({
      width: 1104,
      height: 702,
    });
  });
});

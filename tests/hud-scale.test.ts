import { describe, it, expect } from "vitest";
import { parseSettings } from "../src/settings";

describe("interface scale", () => {
  it("defaults to 100% and is clamped to 75-150%", () => {
    expect(parseSettings(null).hudScale).toBe(1);
    expect(parseSettings('{"hudScale":1.3}').hudScale).toBe(1.3);
    expect(parseSettings('{"hudScale":3}').hudScale).toBe(1.5);
    expect(parseSettings('{"hudScale":0.2}').hudScale).toBe(0.75);
    expect(parseSettings('{"hudScale":"big"}').hudScale).toBe(1);
  });
});

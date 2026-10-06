import { describe, expect, it } from "vitest";
import { damageKey, deathRecap, deathTip, describeDamage } from "../src/recap";

describe("death recap", () => {
  it("names every damage cause the game reports", () => {
    expect(describeDamage(damageKey("hellfire", "witch"))).toBe(
      "a witch's hellfire",
    );
    expect(describeDamage("hellfire:boss", "The Iron Seraph")).toBe(
      "the Iron Seraph's hellfire",
    );
    expect(describeDamage("shockwave", "The Sand Colossus")).toBe(
      "the Sand Colossus's shockwave",
    );
    expect(describeDamage("shockwave")).toBe("the general's shockwave");
    expect(describeDamage("general contact")).toBe("the general");
    expect(describeDamage("explosion")).toBe("your own blast");
    expect(describeDamage("brute")).toBe("a brute");
    expect(describeDamage("hellfire")).toBe("the damned's hellfire");
    expect(describeDamage("mystery")).toBe("the damned");
    for (const melee of ["shambler", "skeleton", "knight", "hound", "brute"])
      expect(deathTip(melee).length).toBeGreaterThan(20);
    expect(deathTip("shockwave")).toMatch(/jump/);
    expect(deathTip("explosion")).toMatch(/close range/);
    expect(deathTip("mystery")).toBe("");
  });
  it("sorts the top three sources, rounds, and drops slivers", () => {
    const r = deathRecap(
      {
        "hellfire:monk": 18.4,
        brute: 35,
        explosion: 51.6,
        hound: 9,
        "hellfire:witch": 0.2,
      },
      "brute",
    );
    expect(r.killedBy).toBe("Slain by a brute");
    expect(r.sources).toEqual([
      { name: "Your own blast", damage: 52 },
      { name: "A brute", damage: 35 },
      { name: "A monk's hellfire", damage: 18 },
    ]);
    expect(r.tip).toMatch(/brute/);
  });
  it("names the general and copes with an empty log", () => {
    const r = deathRecap(
      { shockwave: 30, "general contact": 22 },
      "shockwave",
      "The Gravewarden",
    );
    expect(r.killedBy).toBe("Slain by the Gravewarden's shockwave");
    expect(r.sources[1].name).toBe("The Gravewarden");
    expect(deathRecap({}, "hound").sources).toEqual([]);
  });
});

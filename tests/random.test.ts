import { describe, it, expect } from "vitest";
import {
  generator,
  isolated,
  random,
  randomState,
  seedRandom,
} from "../src/random";

describe("the game's random sequence", () => {
  it("repeats for the same seed and differs for another", () => {
    seedRandom(42);
    const a = Array.from({ length: 50 }, random);
    seedRandom(42);
    expect(Array.from({ length: 50 }, random)).toEqual(a);
    seedRandom(43);
    expect(Array.from({ length: 50 }, random)).not.toEqual(a);
  });
  it("stays in [0, 1) and spreads evenly", () => {
    seedRandom(7);
    const xs = Array.from({ length: 20000 }, random);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const buckets = new Array(10).fill(0);
    for (const x of xs) buckets[Math.floor(x * 10)]++;
    for (const n of buckets) expect(Math.abs(n - 2000)).toBeLessThan(200);
  });
  it("is not moved by Math.random, separate generators or isolated set-up", () => {
    seedRandom(5);
    const expected = [random(), random(), random()];
    seedRandom(5);
    random();
    const before = randomState();
    Math.random();
    const sound = generator(9);
    sound();
    sound();
    const built = isolated(() => [random(), random()]);
    expect(randomState()).toBe(before);
    expect([random(), random()]).toEqual(expected.slice(1));
    // An isolated build is itself repeatable.
    expect(isolated(() => [random(), random()])).toEqual(built);
  });
  it("restores the sequence when isolated set-up throws", () => {
    seedRandom(11);
    const before = randomState();
    expect(() =>
      isolated(() => {
        random();
        throw new Error("model failed");
      }),
    ).toThrow("model failed");
    expect(randomState()).toBe(before);
  });
});

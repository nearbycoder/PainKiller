import { describe, expect, it } from "vitest";
import { freshSave, parseResume, parseSave, type Resume } from "../src/core";

const snapshot = (): Resume => ({
  level: 3,
  room: 2,
  wave: 3,
  health: 64,
  armor: 12,
  ammo: [-1, 40, 30, 10, 80],
  altAmmo: [-1, 20, 5, 150, 90],
  weapon: 2,
  souls: 41,
  cardUsed: true,
  taken: [0, 4],
  kills: 87,
  levelSouls: 30,
  secrets: 1,
  elapsed: 311,
  sector: { kills: 52, souls: 18, secrets: 0 },
});

describe("wave resume snapshots", () => {
  it("round-trips a valid snapshot for the saved sector", () => {
    const save = { ...freshSave(), level: 3, room: 2, resume: snapshot() };
    expect(parseSave(JSON.stringify(save)).resume).toEqual(snapshot());
  });
  it("drops a snapshot that belongs to another sector", () => {
    const save = { ...freshSave(), level: 3, room: 1, resume: snapshot() };
    expect(parseSave(JSON.stringify(save)).resume).toBeUndefined();
  });
  it("rejects malformed snapshots without losing the rest of the save", () => {
    for (const bad of [
      { wave: 0 },
      { wave: 4 },
      { health: 0 },
      { health: "64" },
      { ammo: [1, 2, 3] },
      { ammo: [-1, 40, 30, 10, 1.5] },
      { altAmmo: [-2, 0, 0, 0, 0] },
      { weapon: 7 },
      { souls: 99 },
      { cardUsed: "yes" },
      { taken: [9] },
      { sector: null },
      { level: 30 },
    ]) {
      expect(parseResume({ ...snapshot(), ...bad })).toBeUndefined();
      const save = parseSave(
        JSON.stringify({
          ...freshSave(),
          level: 3,
          room: 2,
          kills: 500,
          resume: { ...snapshot(), ...bad },
        }),
      );
      expect(save.resume).toBeUndefined();
      expect(save.kills).toBe(500);
    }
    expect(parseResume(null)).toBeUndefined();
    expect(parseResume("snapshot")).toBeUndefined();
  });
  it("keeps older saves without a snapshot working", () => {
    const old = { ...freshSave(), level: 5, room: 1 };
    const save = parseSave(JSON.stringify(old));
    expect(save.level).toBe(5);
    expect(save.resume).toBeUndefined();
  });
});

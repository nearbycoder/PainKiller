import { describe, expect, it } from "vitest";
import {
  formatTime,
  freshSave,
  mergeRecord,
  parseResume,
  parseSave,
  type Resume,
} from "../src/core";

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
  deaths: 2,
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
      { deaths: -1 },
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

describe("per-level records", () => {
  const run = { time: 300, kills: 80, secrets: 0, deathless: false };
  it("keeps the fastest time and the best of everything else", () => {
    const first = mergeRecord(undefined, run);
    expect(first.fastest).toBe(true);
    const slower = mergeRecord(first.record, {
      time: 420,
      kills: 95,
      secrets: 1,
      deathless: true,
    });
    expect(slower.fastest).toBe(false);
    expect(slower.record).toEqual({
      time: 300,
      kills: 95,
      secrets: 1,
      deathless: true,
    });
    const faster = mergeRecord(slower.record, { ...run, time: 250 });
    expect(faster.fastest).toBe(true);
    expect(faster.record.time).toBe(250);
    expect(faster.record.deathless).toBe(true);
  });
  it("saves valid records and drops corrupt ones", () => {
    const save = parseSave(
      JSON.stringify({
        ...freshSave(),
        records: {
          "2": run,
          "3": { ...run, time: -5 },
          "40": run,
          x: run,
          "5": { ...run, deathless: "yes" },
        },
      }),
    );
    expect(save.records).toEqual({ "2": run });
    expect(parseSave(JSON.stringify(freshSave())).records).toEqual({});
  });
  it("formats times as minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3725)).toBe("62:05");
  });
});

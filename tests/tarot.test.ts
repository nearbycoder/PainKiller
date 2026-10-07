import { describe, expect, it } from "vitest";
import { freshSave, parseSave } from "../src/core";
import { LEVELS } from "../src/data";
import {
  cardConditionMet,
  earnCard,
  levelCard,
  ownedSelection,
  TAROT_SOULS,
} from "../src/tarot";

describe("grave tarot", () => {
  it("awards Wrath, Quickening and Bulwark by chapter, then repeats", () => {
    expect([1, 2, 3, 4, 5].map(levelCard)).toEqual([0, 1, 2, 0, 1]);
    // The Hollow City's levels all award Quickening.
    expect(
      LEVELS.filter((l) => l.chapter === 2).map((l) => levelCard(l.chapter)),
    ).toEqual(Array(6).fill(1));
  });

  it("is won with 25 souls in the level or a relic", () => {
    expect(TAROT_SOULS).toBe(25);
    expect(cardConditionMet(24, 0)).toBe(false);
    expect(cardConditionMet(25, 0)).toBe(true);
    expect(cardConditionMet(0, 1)).toBe(true);
  });

  it("equips a new card when the equipped one is not owned", () => {
    // A fresh save has Wrath selected but owns nothing.
    const save = freshSave();
    expect(earnCard(save, 1)).toEqual({ earned: true, equipped: true });
    expect(save).toMatchObject({ cards: [1], selectedCard: 1 });
    // Earning it again changes nothing.
    expect(earnCard(save, 1)).toEqual({ earned: false, equipped: false });
    expect(save).toMatchObject({ cards: [1], selectedCard: 1 });
  });

  it("keeps a choice among owned cards", () => {
    const save = { cards: [0, 1], selectedCard: 0 };
    expect(earnCard(save, 2)).toEqual({ earned: true, equipped: false });
    expect(save).toEqual({ cards: [0, 1, 2], selectedCard: 0 });
    // The first card on a fresh save is Wrath, already selected.
    const first = freshSave();
    expect(earnCard(first, 0)).toEqual({ earned: true, equipped: false });
    expect(first.selectedCard).toBe(0);
  });

  it("never loads a save with an unowned card equipped while one is owned", () => {
    expect(ownedSelection([], 0)).toBe(0);
    expect(ownedSelection([1], 0)).toBe(1);
    expect(ownedSelection([2, 1], 1)).toBe(1);
    const raw = (cards: number[], selectedCard: number) =>
      JSON.stringify({ ...freshSave(), cards, selectedCard });
    expect(parseSave(raw([1], 0)).selectedCard).toBe(1);
    expect(parseSave(raw([0, 2], 1)).selectedCard).toBe(0);
    expect(parseSave(raw([0, 2], 2)).selectedCard).toBe(2);
    expect(parseSave(raw([], 2)).selectedCard).toBe(2);
  });
});

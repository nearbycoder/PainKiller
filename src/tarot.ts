/** Grave tarot: which card a level awards, and earning it. */
export const TAROT_SOULS = 25;

/** The card a level of this chapter awards: Wrath, Quickening, Bulwark, then again. */
export function levelCard(chapter: number) {
  return (chapter - 1) % 3;
}

/** Whether this level's card is won when the level ends. */
export function cardConditionMet(levelSouls: number, secrets: number) {
  return secrets > 0 || levelSouls >= TAROT_SOULS;
}

/**
 * Add a card to the owned set. When the equipped card is not owned (a fresh save
 * starts with Wrath selected), the new card is equipped; a choice among owned cards
 * is kept. Returns whether the card is new and whether it was equipped.
 */
export function earnCard(
  save: { cards: number[]; selectedCard: number },
  card: number,
) {
  const earned = !save.cards.includes(card);
  if (earned) save.cards.push(card);
  const equipped = !save.cards.includes(save.selectedCard);
  if (equipped) save.selectedCard = card;
  return { earned, equipped };
}

/** An equipped card that is not owned is replaced by the first owned one. */
export function ownedSelection(cards: number[], selected: number) {
  return cards.length && !cards.includes(selected) ? cards[0] : selected;
}

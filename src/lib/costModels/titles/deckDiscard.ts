import { CostModel } from '../model';

// The ships whose play discards the top of the player's own draw deck (#1744). The table holds the draw
// deck in every game, so the play does the discard itself, as Ptol's reveal does in a bot game (#1738).

const MINUS = '−';

/** The cards both ships discard from the top of the draw deck. */
const DISCARDS = 3;

const cardsText = (n: number): string => `${n} ${n === 1 ? 'card' : 'cards'}`;

export const DECK_DISCARD_MODELS: CostModel[] = [
  // "When you play this ship, discard the top three cards of your deck. This ship is cost -1 for each
  // Human personnel discarded in this way." A short deck discards what it holds and counts those.
  {
    title: 'Alliance Galor',
    family: 'ownCost',
    playCost: (play, facts) => {
      const top = (facts.drawDeckTop ?? []).slice(0, DISCARDS);
      if (!top.length) return { cost: play.printed, reason: 'no card discarded, the draw deck is empty' };
      const humans = top.filter((c) => c.type === 'personnel' && c.species.includes('human')).length;
      return {
        cost: Math.max(0, play.printed - humans),
        reason: `${humans} Human personnel of ${cardsText(top.length)} discarded`,
        discard: { ids: top.map((c) => c.id) },
      };
    },
  },
  // "When you play this ship, you may discard the top three cards of your deck to make this ship cost -2."
  // Offered only while the draw deck holds three cards or more (the owner's ruling).
  {
    title: 'Type III Galor',
    family: 'ownCost',
    playCost: (play, facts) =>
      (facts.drawDeckTop ?? []).length >= DISCARDS
        ? {
            cost: play.printed,
            reason: `${MINUS}2 if you discard the top ${DISCARDS} cards of your deck`,
            choice: { label: `Discard the top ${DISCARDS}: ${MINUS}2`, cost: play.printed - 2, discardTop: DISCARDS },
          }
        : null,
  },
];

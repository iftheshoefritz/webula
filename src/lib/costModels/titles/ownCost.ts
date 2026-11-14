import { CostModel } from '../model';

// The cards that change their own cost (#1654).

const MINUS = '−';

export const OWN_COST_MODELS: CostModel[] = [
  // "When you play this equipment, if you command a Borg personnel, it is cost -2." The table checks it.
  {
    title: 'Borg Nanoprobes',
    family: 'ownCost',
    playCost: (play, facts) =>
      facts.commanded.some((p) => p.species.includes('borg')) ? { cost: play.printed - 2, reason: 'you command a Borg' } : null,
  },
  // "When you play this personnel, you may discard an equipment or event card from hand to make this
  // personnel cost -2." A "may": the printed cost, and the choice while the hand holds such a card.
  {
    title: 'Goran',
    family: 'ownCost',
    playCost: (play, facts) =>
      facts.hand.some((c) => c.id !== play.id && (c.type === 'equipment' || c.type === 'event'))
        ? {
            cost: play.printed,
            reason: 'you may discard an equipment or event',
            choice: { label: `Discard a card: ${MINUS}2`, cost: play.printed - 2 },
          }
        : null,
  },
];

import { CostModel } from '../model';

// The cards that add to the counters the player may spend this turn (#1655).

export const LIMIT_MODELS: CostModel[] = [
  // "Plays in your core. You may spend an additional counter each turn." The table checks it: +1 to the
  // limit of the turn while a copy is in the core, one grant however many copies.
  {
    title: 'Surprise Party',
    family: 'limit',
    limitGrant: (facts) => (facts.core.includes('Surprise Party') ? { amount: 1, reason: 'in your core' } : null),
  },
  // "When you play this personnel, you may spend an additional 5 counters this turn." A "may": the
  // printed cost, and the choice of +5 to this turn's limit. The opponent's points are not on this table.
  {
    title: 'Tricia Jenkins Relaxed Pilot',
    label: 'Tricia Jenkins',
    family: 'limit',
    playCost: (play) => ({
      cost: play.printed,
      reason: 'you may spend 5 more counters this turn',
      choice: { label: 'Raise the limit: +5', limit: 5 },
    }),
  },
];

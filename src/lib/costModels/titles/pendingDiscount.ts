import { CostModel } from '../model';

// The cards whose play makes a later card of this turn cheaper (#1656).

export const PENDING_DISCOUNT_MODELS: CostModel[] = [
  // "When you play this personnel, the next [Fed][DS9] personnel you play this turn is cost -2." The
  // table checks the next play's Affiliation and Icons; the turn ends the discount.
  {
    title: 'Sarish Rez Ministerial Adjutant',
    label: 'Sarish Rez',
    family: 'pendingDiscount',
    pendingDiscount: {
      label: 'next [Fed][DS9] personnel',
      amount: 2,
      applies: (play) =>
        play.type === 'personnel' && !!play.affiliation?.includes('federation') && !!play.icons?.includes('[ds9]'),
    },
  },
];

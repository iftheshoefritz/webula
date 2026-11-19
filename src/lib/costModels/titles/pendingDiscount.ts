import { CostModel } from '../model';
import { missionRequires } from './completedMission';

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
  // "When you play this personnel, if each of your non-headquarters missions requires Diplomacy, you may
  // download up to two events, then play each of them at cost -3." (#1762) The printed cost, and while each
  // mission of the player's that is not a headquarters requires Diplomacy (an empty slot is no mission; with
  // no such mission the condition holds), a choice to download up to 2 events: each leaves a pending discount
  // of −3 for the play of that card alone (`pendingDiscountsOf`).
  {
    title: "Alexander Rozhenko K'mtar",
    label: "K'mtar",
    family: 'pendingDiscount',
    playCost: (play, facts) =>
      (facts.missions ?? []).every((m) => m.type === '' || m.type === 'h' || missionRequires(m, 'Diplomacy'))
        ? {
            cost: play.printed,
            reason: 'each non-headquarters mission requires Diplomacy',
            choice: { label: 'Download up to 2 events…', download: 'event', max: 2, discount: 3 },
          }
        : null,
  },
];

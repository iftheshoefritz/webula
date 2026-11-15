import { CostModel, CostPlay } from '../model';

// The personnel whose play makes the next card of a kind played this turn cheaper (#1699), as Sarish
// Rez does (#1656). Each test reads only the next play.

const MINUS = '−';

const personnelWith = (play: CostPlay, ...icons: string[]): boolean =>
  play.type === 'personnel' && icons.every((icon) => !!play.icons?.includes(icon));

export const NEXT_OF_KIND_MODELS: CostModel[] = [
  // "When you play this personnel, the next Temporal event you play this turn is cost -2." Temporal is a
  // keyword.
  {
    title: 'Icheb Second Officer',
    label: 'Icheb',
    family: 'pendingDiscount',
    pendingDiscount: {
      label: 'next Temporal event',
      amount: 2,
      applies: (play) => play.type === 'event' && !!play.keywords?.includes('temporal'),
    },
  },
  // "When you play this personnel, the next [Baj][DS9] personnel you play this turn is cost -2."
  {
    title: 'Elizabeth Lense Valedictorian',
    label: 'Elizabeth Lense',
    family: 'pendingDiscount',
    pendingDiscount: {
      label: 'next [Baj][DS9] personnel',
      amount: 2,
      applies: (play) => personnelWith(play, '[ds9]') && !!play.affiliation?.includes('bajoran'),
    },
  },
  // "When you play this personnel, the next [AU][TNG] or [Pa][TNG] personnel you play this turn is cost -3."
  {
    title: 'Shelley',
    family: 'pendingDiscount',
    pendingDiscount: {
      label: 'next [AU][TNG] or [Pa][TNG] personnel',
      amount: 3,
      applies: (play) => personnelWith(play, '[au]', '[tng]') || personnelWith(play, '[pa]', '[tng]'),
    },
  },
  // "When you play this personnel, the next Android you play this turn is cost -2." Android is a species,
  // "Android/Borg" too.
  {
    title: 'Data Proud Father',
    label: 'Data',
    family: 'pendingDiscount',
    pendingDiscount: {
      label: 'next Android',
      amount: 2,
      applies: (play) => !!play.species?.includes('android'),
    },
  },
  // "You may play this personnel at cost -2 to ignore his next ability. When you play this personnel, the
  // next [TOS] personnel you play this turn is cost -3." A "may": the printed cost and the choice. The
  // ability the choice ignores is the discount, so a taken choice leaves none (`pendingDiscountsOf`).
  {
    title: 'Leonard H. McCoy Experienced Advisor',
    label: 'McCoy',
    family: 'pendingDiscount',
    playCost: (play) => ({
      cost: play.printed,
      reason: 'you may ignore his next ability',
      choice: { label: `Ignore his next ability: ${MINUS}2`, cost: play.printed - 2 },
    }),
    pendingDiscount: {
      label: 'next [TOS] personnel',
      amount: 3,
      applies: (play) => personnelWith(play, '[tos]'),
    },
  },
];

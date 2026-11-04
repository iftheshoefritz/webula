// The fixed opponent dilemma pile of the dilemma bot (#1282): 3 copies of each of 9 Chula dilemmas.

export interface BotDilemma {
  title: string;
  collectorsInfo: string;
  cost: number;
}

export const OPPONENT_DILEMMAS: BotDilemma[] = [
  { title: 'Chula: The Game', collectorsInfo: '30V002', cost: 0 },
  { title: 'Chula: Echoes', collectorsInfo: '1C015', cost: 1 },
  { title: 'Chula: Unfortunate Roll', collectorsInfo: '16V005', cost: 1 },
  { title: 'Chula: Pick One to Save Two', collectorsInfo: '1C016', cost: 2 },
  { title: 'Chula: The Precipice', collectorsInfo: '19V001', cost: 2 },
  { title: 'Chula: Trickery', collectorsInfo: '30V003', cost: 2 },
  { title: 'Chula: Move Along Home', collectorsInfo: '8U006', cost: 3 },
  { title: 'Chula: The Dice', collectorsInfo: '13R004', cost: 3 },
  { title: 'Chula: The Chandra', collectorsInfo: '14U004', cost: 4 },
];

export const COPIES_OF_EACH = 3;

/** The card data strips the leading zeros of a number in the collector's info and lowercases it. */
export const collectorsKey = (info: string) => info.replace(/(^|[^0-9])0+(\d+)/g, '$1$2').toLowerCase();

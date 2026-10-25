// The fixed opponent dilemma pile of the dilemma bot (#1282): 3 copies of each of 9 Chula dilemmas.

export type DilemmaId =
  | 'game'
  | 'echoes'
  | 'moveAlongHome'
  | 'pickOne'
  | 'chandra'
  | 'dice'
  | 'precipice'
  | 'trickery'
  | 'unfortunateRoll';

export interface BotDilemma {
  id: DilemmaId;
  title: string;
  collectorsInfo: string;
  cost: number;
}

export const OPPONENT_DILEMMAS: BotDilemma[] = [
  { id: 'game', title: 'Chula: The Game', collectorsInfo: '30V002', cost: 0 },
  { id: 'echoes', title: 'Chula: Echoes', collectorsInfo: '1C015', cost: 1 },
  { id: 'unfortunateRoll', title: 'Chula: Unfortunate Roll', collectorsInfo: '16V005', cost: 1 },
  { id: 'pickOne', title: 'Chula: Pick One to Save Two', collectorsInfo: '1C016', cost: 2 },
  { id: 'precipice', title: 'Chula: The Precipice', collectorsInfo: '19V001', cost: 2 },
  { id: 'trickery', title: 'Chula: Trickery', collectorsInfo: '30V003', cost: 2 },
  { id: 'moveAlongHome', title: 'Chula: Move Along Home', collectorsInfo: '8U006', cost: 3 },
  { id: 'dice', title: 'Chula: The Dice', collectorsInfo: '13R004', cost: 3 },
  { id: 'chandra', title: 'Chula: The Chandra', collectorsInfo: '14U004', cost: 4 },
];

export const COPIES_OF_EACH = 3;

export const DILEMMA_BY_ID: Record<DilemmaId, BotDilemma> = Object.fromEntries(
  OPPONENT_DILEMMAS.map((d) => [d.id, d]),
) as Record<DilemmaId, BotDilemma>;

/** The whole pile, one entry for each copy. */
export function opponentPile(): DilemmaId[] {
  return OPPONENT_DILEMMAS.flatMap((d) => Array<DilemmaId>(COPIES_OF_EACH).fill(d.id));
}

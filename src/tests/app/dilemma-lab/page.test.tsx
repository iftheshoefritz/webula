/**
 * @jest-environment node
 */

import { readFileSync } from 'fs';
import { join } from 'path';

let mockData: Record<string, string>[] = [];
jest.mock('../../../lib/loadCards', () => ({ loadCards: () => ({ data: mockData }) }));
jest.mock('../../../components/DilemmaLabClient', () => ({ __esModule: true, default: () => null }));

import DilemmaLabPage from '../../../app/dilemma-lab/page';
import type { LabDeck } from '../../../components/DilemmaLabClient';
import type { ChampionshipDeck } from '../../../lib/championshipDecks';

const rows = JSON.parse(
  readFileSync(join(process.cwd(), 'championship-decks', 'index.json'), 'utf-8'),
) as ChampionshipDeck[];
const label = (row: ChampionshipDeck) => `${row.event}: ${row.deckName} (${row.player})`;

describe('the dilemma lab page (#1327)', () => {
  it('lists only the decks with authorizedUse', () => {
    const decks = (DilemmaLabPage().props as { decks: LabDeck[] }).decks;
    expect(decks.map((deck) => deck.label)).toEqual(rows.filter((row) => row.authorizedUse).map(label));
    expect(rows.some((row) => !row.authorizedUse)).toBe(true);
  });
});

describe('the condition of Sphere 117 in the dilemma lab (#1363)', () => {
  const BORG = rows.find((row) => row.deckName === 'ECC 2026 | Borg Dissident')!;
  // The five missions of the Borg Dissident deck, Unicomplex its headquarters.
  const mission = (originalName: string, missiontype: string, quadrant = 'd') => ({
    originalName,
    name: originalName.toLowerCase(),
    type: 'mission',
    missiontype,
    quadrant,
    skills: '',
  });
  const missions = (hq: string) => [
    mission('Unimatrix 116 Assimilate Starship', 's'),
    mission('Nudios Reestablish Neural Cooperative', 'p'),
    mission('Fluidic Space Assault on Species 8472', 's'),
    mission('Akusei Belt Hunt Alien', 'p'),
    mission('Unicomplex Root of the Hive Mind', 'h', hq),
  ];
  const decksOf = (data: Record<string, string>[]) => {
    mockData = data;
    try {
      return (DilemmaLabPage().props as { decks: LabDeck[] }).decks;
    } finally {
      mockData = [];
    }
  };

  it('holds for the Borg Dissident deck, with Sphere 117 in its draw deck and only [DQ] missions, and for no other deck', () => {
    const decks = decksOf(missions('d'));
    expect(decks.filter((deck) => deck.sphere117).map((deck) => deck.label)).toEqual([label(BORG)]);
  });

  it('reads the headquarters too, which the mission list leaves out', () => {
    const decks = decksOf(missions('a'));
    expect(decks.find((deck) => deck.label === label(BORG))!.sphere117).toBeUndefined();
  });
});

/**
 * @jest-environment node
 */

import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../../lib/loadCards', () => ({ loadCards: () => ({ data: [] }) }));
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

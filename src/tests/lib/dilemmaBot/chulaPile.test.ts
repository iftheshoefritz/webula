import { readFileSync } from 'fs';
import { join } from 'path';
import { chulaPileDeck, dilemmaIdOf } from '../../../lib/dilemmaBot/chulaPile';
import { COPIES_OF_EACH, OPPONENT_DILEMMAS, collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { mergeDeckPiles, cardPileFor, extractDilemmas } from '../../../app/decks/deckBuilderUtils';

// The rows are read by hand, lowercased and with the zeros of the collector's info stripped as
// `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();

describe('chulaPileDeck', () => {
  const deck = chulaPileDeck(data);

  it('holds COPIES_OF_EACH of each OPPONENT_DILEMMAS card, 27 cards', () => {
    expect(Object.keys(deck)).toHaveLength(OPPONENT_DILEMMAS.length);
    expect(Object.values(deck).reduce((n, e) => n + e.count, 0)).toBe(27);
    for (const d of OPPONENT_DILEMMAS) {
      const entry = deck[collectorsKey(d.collectorsInfo)];
      expect(entry.count).toBe(COPIES_OF_EACH);
      expect(entry.row.originalName).toBe(d.title);
      expect(entry.row.pile).toBe('dilemmaPile');
      expect(cardPileFor(entry.row)).toBe('dilemmaPile');
    }
  });

  it('takes none of the other versions of a Chula dilemma', () => {
    for (const other of ['0P083', '13A001', '0VP176', '0VP321']) {
      expect(deck[collectorsKey(other)]).toBeUndefined();
    }
    expect(Object.values(deck).map((e) => e.row.originalName)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/Promo|\*A|\*VP/)])
    );
  });

  it('replaces the dilemmas of a deck through mergeDeckPiles', () => {
    const other = data.find((r) => r.type === 'dilemma' && dilemmaIdOf(r) === null);
    const mission = data.find((r) => r.type === 'mission');
    const deck0 = {
      [other.collectorsinfo]: { count: 2, row: { ...other, count: 2, pile: 'dilemmaPile' } },
      [mission.collectorsinfo]: { count: 1, row: { ...mission, count: 1, pile: 'mission' } },
    };
    const merged = mergeDeckPiles(deck0, deck, ['dilemmaPile']);
    expect(merged[mission.collectorsinfo]).toBeDefined();
    expect(merged[other.collectorsinfo]).toBeUndefined();
    expect(extractDilemmas(merged)).toHaveLength(27);
  });

  it('gives an empty deck with no card data', () => {
    expect(chulaPileDeck([])).toEqual({});
  });
});

describe('dilemmaIdOf', () => {
  it('maps each card of the pile back to its DilemmaId', () => {
    const deck = chulaPileDeck(data);
    for (const d of OPPONENT_DILEMMAS) {
      expect(dilemmaIdOf(deck[collectorsKey(d.collectorsInfo)].row)).toBe(d.id);
    }
  });

  it('returns null for a card that is not of the pile', () => {
    const versions = data.filter((r) => ['0p83', '13a1', '0vp176', '0vp321'].includes(r.collectorsinfo));
    expect(versions).toHaveLength(4);
    for (const row of versions) expect(dilemmaIdOf(row)).toBeNull();
    expect(dilemmaIdOf(data.find((r) => r.type === 'personnel'))).toBeNull();
    expect(dilemmaIdOf({ collectorsinfo: '' })).toBeNull();
  });
});

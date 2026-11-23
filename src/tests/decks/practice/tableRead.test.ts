// Issue #1878: the range, span and attribute models read the table view. The view of a part of the table equals
// the view of the whole table; `keywordCards` reads what `distinctTitlesWith` read; and `attributesOnTableOf` on
// the `?fixture=attributes` table gives what it gave before the models moved.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_ATTRIBUTES_CORE, PRACTICE_ATTRIBUTES_TSV, PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { CardInstance, TableState, createCardInstances, initialTableState, tableReducer } from '../../../app/decks/practice/tableReducer';
import { tableReadOf, tableViewOf, tableViewOfInput } from '../../../app/decks/practice/tableView';
import { attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { commandsKeywordCard, distinctTitleCount, keywordCards } from '../../../lib/tableView';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The rows are read by hand, normalised as `parseCardData` does, as `tableView.test.ts` does.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    if (row.type !== 'dilemma') row.dilemmatype = '';
    return row;
  });
})();

const rowsOf = (tsv: string): any[] => extractDrawDeck(deckFromTsv(tsv, data));

/** The `?fixture=attributes` deal. */
function attributesTable(): TableState {
  const deck = deckFromTsv(`${PRACTICE_DECK_TSV}\n${PRACTICE_ATTRIBUTES_TSV}`, data);
  const rows = rowsOf(PRACTICE_ATTRIBUTES_TSV);
  const crew = rows.filter((r) => !PRACTICE_ATTRIBUTES_CORE.includes(r.originalName));
  const core = PRACTICE_ATTRIBUTES_CORE.flatMap((name) => rows.filter((r) => r.originalName === name));
  const extra = new Set([...crew, ...core].map((r) => r.originalName));
  const cards = extractDrawDeck(deck).filter((r: any) => !extra.has(r.originalName));
  return tableReducer(initialTableState, {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((r: any) => r.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    extraHand: [],
    extraCrew: createCardInstances(crew),
    extraCore: createCardInstances(core),
  });
}

let nextId = 0;
const card = (row: Record<string, string>, placedOn: CardInstance[] = []): CardInstance =>
  ({ id: `k-${nextId++}`, card: { originalName: row.name, ...row }, faceUp: true, placedOn }) as unknown as CardInstance;

describe('the table view of a part of the table (#1878)', () => {
  it('gives the missions, the core, the events and the brig of tableViewOf', () => {
    const table = attributesTable();
    const whole = tableViewOf(table);
    const part = tableViewOfInput({
      missions: table.missions,
      core: table.core,
      hand: table.hand,
      discard: table.discard,
      brig: table.brig,
      score: table.score,
      rangeUsed: table.rangeUsed,
    });
    expect(part.missions).toEqual(whole.missions);
    expect(part.core).toEqual(whole.core);
    expect(part.events).toEqual(whole.events);
    expect(part.brig).toEqual(whole.brig);
    expect(part.drawDeck).toEqual([]);
  });

  it('looks up the instance of every card of the slots and the core', () => {
    const table = attributesTable();
    const read = tableReadOf(table);
    const ship = table.missions[2].ships[0];
    expect(read.instance(ship.id)).toBe(ship);
    expect(read.instance(ship.crew![0].id)).toBe(ship.crew![0]);
    expect(read.instance(table.core[0].id)).toBe(table.core[0]);
    expect(read.awayTeam(0)).toBe(table.missions[0].awayTeam);
  });
});

describe('keywordCards (#1878)', () => {
  const capture = (name: string) => card({ name, type: 'event', keywords: 'capture.' });
  const slot = (ship: CardInstance, missionPlaced: CardInstance[] = []) => ({
    mission: card({ name: 'A Mission', type: 'mission' }, missionPlaced),
    awayTeam: [],
    ships: [ship],
    underMission: [],
    completed: false,
  });

  it('counts a Capture card placed on a ship, leaves out a card placed on a core card, and counts two copies once', () => {
    const onShip = card({ name: 'Ship', type: 'ship' }, [capture('Scorched Hand')]);
    const coreCard = card({ name: 'Core Event', type: 'event' }, [capture('Under Core')]);
    const view = tableViewOfInput({
      missions: [slot(onShip, [capture('Brutal Struggle')])] as any,
      core: [coreCard, capture('Brutal Struggle')],
      hand: [],
      discard: [],
      brig: [],
    });
    const cards = keywordCards(view, { keyword: 'capture' });
    expect(cards.map((c) => c.title).sort()).toEqual(['Brutal Struggle', 'Brutal Struggle', 'Scorched Hand']);
    expect(distinctTitleCount(cards)).toBe(2);
    expect(keywordCards(view, { keyword: 'capture', type: 'personnel' })).toEqual([]);
    expect(commandsKeywordCard({ keyword: 'capture', type: 'event' }).holds(view)).toBe(true);
    expect(commandsKeywordCard({ keyword: 'maneuver', type: 'event' }).holds(view)).toBe(false);
  });
});

describe('attributesOnTableOf on the ?fixture=attributes table (#1878)', () => {
  it('gives what it gave before the models read the view', () => {
    const table = attributesTable();
    const ship = table.missions[2].ships[0];
    const kira = ship.crew!.find((c) => String(c.card?.originalName).startsWith('Kira Nerys'))!;
    const map = attributesOnTableOf(table, true);
    // Kira Nerys Reformed Collaborator, a [TN] personnel, under Dark Dissension: Integrity -1 and Cunning +1; the
    // ship's Range +1 from Soliton Wave.
    expect(map).toEqual({ [kira.id]: { integrity: 3, cunning: 7 }, [ship.id]: { range: 9 } });
  });
});

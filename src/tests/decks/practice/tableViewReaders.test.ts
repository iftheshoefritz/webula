// Issue #1877: the conditions of the "when you play" models and the mission readers of the practice table read
// the table view. Their words and their answers are the ones the code before #1877 gave, pinned here on the
// fixture tables and on invented cards.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV, PRACTICE_MISSIONS_TSV, PRACTICE_TAIN_HAND, PRACTICE_TAIN_TSV } from '../../../lib/practiceDeck';
import { CardInstance, MISSION_SLOTS, TableState, createCardInstances, initialTableState, tableReducer } from '../../../app/decks/practice/tableReducer';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { costFactsSource } from '../../../lib/costModels/factsSource';
import { tableViewOf } from '../../../app/decks/practice/tableView';
import { EARTH_TITLE, NIMBUS_TITLE, commandsUnicomplex, slotsTitled } from '../../../app/decks/practice/missionSpends';
import { discardCandidates } from '../../../app/decks/practice/completionEffects';
import { inPlayCards } from '../../../app/decks/practice/playRules';
import { playConditionLine, playConditionOf, playModelOf } from '../../../lib/playModels';
import { inPlay, missions } from '../../../lib/tableView';

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

function deal(deckTsv: string, hand: string[] = []): TableState {
  const deck = deckFromTsv(deckTsv, data);
  const all = extractDrawDeck(deck);
  const extra = all.filter((r: any) => hand.includes(r.originalName));
  const cards = all.filter((r: any) => !hand.includes(r.originalName));
  return tableReducer(initialTableState, {
    type: 'resetWithPiles',
    cards: createCardInstances([...cards, ...cards.filter((r: any) => r.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    extraHand: createCardInstances(extra),
  });
}

const tainTable = () => deal(PRACTICE_TAIN_TSV, PRACTICE_TAIN_HAND);
const missionsTable = () => deal(PRACTICE_MISSIONS_TSV);
const piles = () => deal(PRACTICE_DECK_TSV);

const line = (title: string, table: TableState, at = {}) => {
  const model = playModelOf(title)!;
  return playConditionLine(model, playConditionOf(model, costFactsOf(table, []), at)!);
};

describe('the play conditions on the fixture tables (#1877)', () => {
  it('words and answers as before', () => {
    const tain = tainTable();
    expect(line('Enabran Tain "Retired" Spymaster', tain)).toBe('Condition met: each of your non-headquarters missions requires Intelligence');
    expect(line('Annexation Drone', tain)).toBe('Condition met: each of your non-headquarters missions is an [AQ] mission');
    expect(line('DaiMon Solok Cargo Runner', tain)).toBe('Condition not met: you command three [Fer] personnel');
    expect(line('Jean-Luc Picard Vintner', piles())).toBe('Condition not met: each of your non-headquarters missions requires Biology');
    expect(line('Mavek Science Officer', piles(), { missionIndex: 0 })).toBe('Condition met: your non-Cardassian is at this mission');
    expect(line('Mavek Science Officer', piles())).toBe('Condition not met: your non-Cardassian is at this mission');
    expect(line('Opaka Collaborator', tain)).toBe('Condition not met: you command Bajor and no other headquarters mission');
    expect(line('Eris Harbinger of the Dominion', tain)).toBe('Condition not met: you command a Founder and a Vorta');
    expect(line('Klaa Dauntless Hunter', piles())).toBe('Condition not met: you command a Maneuver event');
    expect(line('Kira Taban Husband and Father', tain)).toBe("Condition not checked: needs the opponent's score");
  });

  it('every slot with a mission card has a type, so "no name" and "no type" skip the same slots', () => {
    for (const table of [tainTable(), missionsTable(), piles()]) {
      for (const m of missions(tableViewOf(table), { includeEmpty: true })) expect(m.empty).toBe(m.type === '');
    }
  });
});

describe('the mission title queries (#1877)', () => {
  it('finds Earth and Nimbus III by their whole title, and a version by `titled`', () => {
    const table = missionsTable();
    expect(slotsTitled(table, EARTH_TITLE)).toEqual([0]);
    expect(slotsTitled(table, NIMBUS_TITLE)).toEqual([1]);
    expect(slotsTitled(table, 'Earth')).toEqual([]);
    expect(missions(tableViewOf(table), { titled: 'earth' }).map((m) => m.index)).toEqual([0]);
    expect(missions(costFactsSourceOf(table), { title: NIMBUS_TITLE }).map((m) => m.index)).toEqual([1]);
  });
});

const costFactsSourceOf = (table: TableState) => costFactsSource(costFactsOf(table, []));

// Invented cards.
const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const mission = (id: string, name: string, missiontype = 'p') => card(id, { type: 'mission', name: name.toLowerCase(), originalName: name, missiontype });
const person = (id: string, name: string, unique = 'n') => card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, unique });

function invented(over: Partial<TableState> & { names?: string[]; awayTeam?: CardInstance[] }): TableState {
  const { names = [], awayTeam = [], ...rest } = over;
  return {
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: names[i] ? mission(`m${i}`, names[i], i === 0 ? 'h' : 'p') : null,
      ships: [],
      awayTeam: i === 1 ? awayTeam : [],
      underMission: [],
    })),
    ...rest,
  };
}

describe('the mission readers (#1877)', () => {
  it('commandsUnicomplex reads a Unicomplex in any slot', () => {
    expect(commandsUnicomplex(invented({ names: ['Unicomplex Root of the Hive Mind', 'Nimbus III Staff Backwater Embassy'] }))).toBe(true);
    expect(commandsUnicomplex(invented({ names: ['Nimbus III Staff Backwater Embassy', 'Unicomplexion'] }))).toBe(false);
    expect(commandsUnicomplex(missionsTable())).toBe(false);
  });

  it('Starbase 718 offers no copy of a title held in the brig, as before', () => {
    const discard = [person('d1', 'Odo', 'y'), person('d2', 'Kira', 'y')];
    expect(discardCandidates(invented({ discard, brig: [person('b1', 'Odo')] })).map((c) => c.id)).toEqual(['d2']);
    expect(discardCandidates(invented({ discard, awayTeam: [person('a1', 'Kira')] })).map((c) => c.id)).toEqual(['d1']);
  });

  it('the cards in play leave out the brig, the hand and the piles', () => {
    const table = invented({ names: ['HQ', 'Planet'], awayTeam: [person('a1', 'Data')], brig: [person('b1', 'Worf')], hand: [person('h1', 'Odo')] });
    expect(inPlay(tableViewOf(table)).map((c) => c.id)).toEqual(['a1']);
    expect(inPlayCards(table).map((c) => c.id)).toEqual(['a1']);
  });
});

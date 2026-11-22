// Issue #1875: the table view, its selectors and its conditions. The builder runs on the fixture tables of
// `resetWithPiles`; the selectors agree with the readers of today, each with its own meaning of "command";
// and each condition's words equal the string the old code prints for the same case.
import { readFileSync } from 'fs';
import { join } from 'path';
import { deckFromTsv, extractDilemmas, extractDrawDeck, extractMissions } from '../../../app/decks/deckBuilderUtils';
import {
  PRACTICE_ATTRIBUTES_CORE,
  PRACTICE_ATTRIBUTES_TSV,
  PRACTICE_COSTS_CORE,
  PRACTICE_COSTS_CREW,
  PRACTICE_COSTS_TSV,
  PRACTICE_DECK_TSV,
  PRACTICE_SET67_TSV,
  PRACTICE_TAIN_HAND,
  PRACTICE_TAIN_TSV,
} from '../../../lib/practiceDeck';
import { CardInstance, MissionSlot, TableState, createCardInstances, initialTableState, tableReducer } from '../../../app/decks/practice/tableReducer';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { tableViewOf } from '../../../app/decks/practice/tableView';
import { commandedPersonnel } from '../../../app/decks/practice/rangeModels';
import { botTableFactsOf } from '../../../app/decks/practice/attempt';
import { costModelOf } from '../../../lib/costModels/registry';
import type { CostPlay } from '../../../lib/costModels/model';
import { playConditionLine, playConditionOf, playModelOf } from '../../../lib/playModels';
import {
  TableView,
  aboardThisShip,
  atThisMission,
  commands,
  commandsEach,
  commandsEvents,
  completedMissionRequiring,
  completedMissions,
  count,
  events,
  missionRequires,
  missions,
  personnel,
  requiresSkill,
  ships,
} from '../../../lib/tableView';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The rows are read by hand, normalised as `parseCardData` does, as `selectAgain.test.ts` does.
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

interface Extras {
  hand?: any[];
  crew?: any[];
  core?: any[];
}

/** The fixture deal of `deckTsv` with `extras`, as `?fixture=piles` and its variants deal it. */
function deal(deckTsv: string, extras: Extras = {}): TableState {
  const deck = deckFromTsv(deckTsv, data);
  const extra = new Set([...(extras.hand ?? []), ...(extras.crew ?? []), ...(extras.core ?? [])].map((r) => r.originalName));
  const cards = extractDrawDeck(deck).filter((r: any) => !extra.has(r.originalName));
  return tableReducer(initialTableState, {
    type: 'resetWithPiles',
    // The personnel twice, as the page deals them, so the away team, the crew and the brig fill.
    cards: createCardInstances([...cards, ...cards.filter((r: any) => r.type === 'personnel')]),
    missions: createCardInstances(extractMissions(deck), 'up'),
    dilemmas: createCardInstances(extractDilemmas(deck)),
    extraHand: createCardInstances(extras.hand ?? []),
    extraCrew: createCardInstances(extras.crew ?? []),
    extraCore: createCardInstances(extras.core ?? []),
  });
}

const rowsOf = (tsv: string): any[] => extractDrawDeck(deckFromTsv(tsv, data));

function costsTable(): TableState {
  const rows = rowsOf(PRACTICE_COSTS_TSV);
  return deal(`${PRACTICE_DECK_TSV}\n${PRACTICE_COSTS_TSV}`, {
    crew: rows.filter((r) => r.originalName === PRACTICE_COSTS_CREW),
    core: rows.filter((r) => r.originalName === PRACTICE_COSTS_CORE),
    hand: rows.filter((r) => r.originalName !== PRACTICE_COSTS_CREW && r.originalName !== PRACTICE_COSTS_CORE),
  });
}

function attributesTable(): TableState {
  const rows = rowsOf(PRACTICE_ATTRIBUTES_TSV);
  return deal(`${PRACTICE_DECK_TSV}\n${PRACTICE_ATTRIBUTES_TSV}`, {
    crew: rows.filter((r) => !PRACTICE_ATTRIBUTES_CORE.includes(r.originalName)),
    core: PRACTICE_ATTRIBUTES_CORE.flatMap((name) => rows.filter((r) => r.originalName === name)),
  });
}

function tainTable(): TableState {
  const rows = rowsOf(PRACTICE_TAIN_TSV);
  return deal(PRACTICE_TAIN_TSV, { hand: PRACTICE_TAIN_HAND.flatMap((name) => rows.filter((r) => r.originalName === name)) });
}

const TABLES: [string, () => TableState][] = [
  ['costs', costsTable],
  ['attributes', attributesTable],
  ['tain', tainTable],
];

/** `table` with the first personnel of slot 0's away team stopped. */
function withFirstStopped(table: TableState): [TableState, string] {
  const slot = table.missions[0];
  const first = slot.awayTeam.find((c) => c.card?.type === 'personnel')!;
  const awayTeam = slot.awayTeam.map((c) => (c.id === first.id ? { ...c, stopped: true } : c));
  return [{ ...table, missions: table.missions.map((s, i) => (i === 0 ? { ...s, awayTeam } : s)) }, first.id];
}

const ids = (list: { id: string }[]): string[] => list.map((c) => c.id);

/** Every id any selector gives on `view`, the cards of the missions it selects too. */
const everySelected = (view: TableView): string[] => [
  ...ids(personnel(view, { unstopped: false })),
  ...ids(ships(view)),
  ...ids(events(view)),
  ...missions(view, { includeEmpty: true }).flatMap((m) => [
    ...(m.card ? [m.card.id] : []),
    ...ids(m.awayTeam),
    ...ids(m.ships.flatMap((s) => s.crew)),
    ...ids(m.placedOn),
  ]),
];

describe.each(TABLES)('tableViewOf on the %s fixture (#1875)', (_name, tableOf) => {
  it('keeps a stopped personnel with unstopped: false and leaves it out with unstopped: true', () => {
    const [table, stopped] = withFirstStopped(tableOf());
    const view = tableViewOf(table);
    expect(ids(personnel(view, { unstopped: false }))).toContain(stopped);
    expect(ids(personnel(view, { unstopped: true }))).not.toContain(stopped);
    expect(personnel(view, { unstopped: false }).find((p) => p.id === stopped)?.stopped).toBe(true);
  });

  it('never selects a card of the brig, though the view keeps the brig', () => {
    const table = tableOf();
    expect(table.brig.length).toBeGreaterThan(0);
    const view = tableViewOf(table);
    expect(ids(view.brig)).toEqual(ids(table.brig));
    const selected = new Set(everySelected(view));
    for (const id of ids(table.brig)) expect(selected.has(id)).toBe(false);
  });

  it('keeps every entry with its id, its title and its row', () => {
    const table = tableOf();
    const view = tableViewOf(table);
    const crew = view.missions[2].ships[0].crew;
    expect(ids(crew)).toEqual(ids(table.missions[2].ships[0].crew ?? []));
    expect(crew[0].row).toBe(table.missions[2].ships[0].crew![0].card);
    expect(crew[0].shipId).toBe(table.missions[2].ships[0].id);
    expect(crew[0].missionIndex).toBe(2);
    expect(view.hand.map((c) => c.title)).toEqual(costFactsOf(table).hand.map((c) => c.title));
  });

  it('counts "command" both ways, as the readers of today do', () => {
    const [table] = withFirstStopped(tableOf());
    const view = tableViewOf(table);
    // The cost and play models: the unstopped personnel only (#1751).
    expect(count(view, { of: 'personnel', unstopped: true })).toBe(costFactsOf(table).commanded.length);
    // The range, attribute and bot readers: the stopped personnel too.
    expect(ids(personnel(view, { unstopped: false }))).toEqual(ids(commandedPersonnel(table.missions)));
    expect(count(view, { of: 'personnel', unstopped: false })).toBe(botTableFactsOf(table).commanded.length);
    expect(count(view, { of: 'personnel', unstopped: true })).toBeLessThan(count(view, { of: 'personnel', unstopped: false }));
  });

  it('gives the missions of costFactsOf and its events', () => {
    const table = tableOf();
    const view = tableViewOf(table);
    const facts = costFactsOf(table);
    expect(view.missions.map((m) => [m.name, m.requirements, m.type, m.points, m.quadrant, m.icons, m.regions])).toEqual(
      facts.missions!.map((m) => [m.name, m.requirements, m.type, m.points, m.quadrant, m.icons, m.regions])
    );
    expect(events(view).map((e) => [e.title, e.keywords])).toEqual(facts.events!.map((e) => [e.title, e.keywords]));
  });
});

describe('events() (#1875)', () => {
  it('holds the core, a mission card and a ship, never an event placed on a core card', () => {
    const table = costsTable();
    const coreEvent = table.core.find((c) => c.card?.type === 'event')!;
    const event = (id: string): CardInstance => ({ id, face: 'up', card: { name: `invented ${id}`, originalName: `Invented ${id}`, type: 'event' } });
    const [onCore, onMission] = [event('on-core'), event('on-mission')];
    const missions: MissionSlot[] = table.missions.map((s, i) => (i === 0 ? { ...s, mission: { ...s.mission!, placedOn: [onMission] } } : s));
    const core: CardInstance[] = table.core.map((c) => (c.id === coreEvent.id ? { ...c, placedOn: [onCore] } : c));
    const view = tableViewOf({ ...table, missions, core });
    const selected = ids(events(view));
    expect(selected).toContain(coreEvent.id);
    expect(selected).toContain(onMission.id);
    expect(events(view).find((e) => e.id === onMission.id)).toMatchObject({ place: 'missionCard', missionIndex: 0 });
    const onShip = table.missions[2].ships[0].placedOn![0];
    expect(events(view).find((e) => e.id === onShip.id)).toMatchObject({ place: 'ship', missionIndex: 2, shipId: table.missions[2].ships[0].id });
    expect(selected).not.toContain(onCore.id);
    expect(view.core.find((c) => c.id === coreEvent.id)?.placedOn.map((c) => c.id)).toEqual([onCore.id]);
  });
});

describe('Crescent Nebula changes the requirements (#1828, #1875)', () => {
  it('adds Intelligence to the other non-[Fed] missions with requirements', () => {
    const view = tableViewOf(deal(PRACTICE_SET67_TSV));
    const nebula = view.missions.findIndex((m) => m.name.startsWith('Crescent Nebula'));
    expect(nebula).toBeGreaterThanOrEqual(0);
    const changed = view.missions.filter((m) => m.index !== nebula && m.requirements.startsWith('intelligence, ('));
    expect(changed.length).toBeGreaterThan(0);
    for (const m of changed) {
      expect(requiresSkill(m, 'Intelligence')).toBe(true);
      expect(missionRequires('Intelligence', { query: { where: (x) => x.index === m.index } }).holds(view)).toBe(true);
    }
    expect(view.missions[nebula].requirements.startsWith('intelligence, (')).toBe(false);
  });
});

// The conditions' words, against the string of the old code for the same case.

const play = (printed: number, extra: Partial<CostPlay> = {}): CostPlay => ({ type: 'personnel', printed, ...extra });
const reasonOf = (title: string, table: TableState, p: CostPlay = play(5)): string | undefined =>
  costModelOf(title)!.playCost!(p, costFactsOf(table))?.reason;

describe('commands (#1875)', () => {
  it('reads as Borg Nanoprobes reads: "you command a Borg"', () => {
    const table = costsTable();
    const c = commands({ of: 'personnel', unstopped: true, species: 'borg' }, 'a Borg');
    expect(c.holds(tableViewOf(table))).toBe(true);
    expect(c.text(tableViewOf(table))).toBe(reasonOf('Borg Nanoprobes', table, { type: 'equipment', printed: 3 }));
  });

  it('reads as ifCommand with a minimum: "you command <n> [Fed] personnel" (Lwaxana Troi)', () => {
    const table = costsTable();
    const view = tableViewOf(table);
    const c = commands({ of: 'personnel', unstopped: true, affiliation: 'federation' }, '[Fed] personnel', { min: 3 });
    expect(c.holds(view)).toBe(true);
    expect(c.text(view)).toBe(reasonOf('Lwaxana Troi Extravagant Ambassador', table));
  });

  it('takes an override of its words', () => {
    const view = tableViewOf(costsTable());
    expect(commands({ of: 'personnel', unstopped: true }, 'anyone', { text: 'you command someone' }).text(view)).toBe('you command someone');
  });
});

describe('commandsEach (#1875)', () => {
  it('reads as forEach: Assimilator "you command <n> Borg"', () => {
    const table = costsTable();
    const c = commandsEach({ of: 'personnel', unstopped: true, species: 'borg' }, 'Borg', { limit: 5 });
    expect(c.holds(tableViewOf(table))).toBe(true);
    expect(c.text(tableViewOf(table))).toBe(reasonOf('Assimilator Rogue Borg Vessel', table, play(6, { type: 'ship' })));
  });

  it('adds the limit past it, as forEach does', () => {
    const table = costsTable();
    const borg = table.missions[2].ships[0].crew!.find((c) => String(c.card?.species).includes('borg'))!;
    const crew = [...table.missions[2].ships[0].crew!, ...Array.from({ length: 5 }, (_, i) => ({ ...borg, id: `borg-${i}` }))];
    const more: TableState = {
      ...table,
      missions: table.missions.map((s, i) => (i === 2 ? { ...s, ships: [{ ...s.ships[0], crew }] } : s)),
    };
    const text = commandsEach({ of: 'personnel', unstopped: true, species: 'borg' }, 'Borg', { limit: 5 }).text(tableViewOf(more));
    expect(text).toBe(reasonOf('Assimilator Rogue Borg Vessel', more, play(6, { type: 'ship' })));
    expect(text).toMatch(/\(limit 5\)$/);
  });
});

describe('commandsEvents (#1875)', () => {
  it('reads as Gowron: "you command <n> events"', () => {
    const table = costsTable();
    const c = commandsEvents({ min: 3 });
    expect(c.holds(tableViewOf(table))).toBe(true);
    expect(c.text(tableViewOf(table))).toBe(reasonOf('Gowron Celebrated Leader', table));
  });

  it('reads as forEachEvent: Jorem "you command 1 Assault event"', () => {
    const table = costsTable();
    const assault: CardInstance = { id: 'assault', face: 'up', card: { name: 'invented assault', originalName: 'Invented Assault', type: 'event', keywords: 'Assault.' } };
    const withAssault = { ...table, core: [...table.core, assault] };
    const c = commandsEvents({ keyword: 'assault', what: 'Assault' });
    expect(c.holds(tableViewOf(withAssault))).toBe(true);
    expect(c.text(tableViewOf(withAssault))).toBe(reasonOf('Jorem', withAssault));
    expect(c.text(tableViewOf(withAssault))).toBe('you command 1 Assault event');
    expect(c.holds(tableViewOf(table))).toBe(false);
  });
});

describe('missionRequires (#1875)', () => {
  const tain = () => playModelOf('Enabran Tain "Retired" Spymaster')!;

  it('reads and holds as Enabran Tain\'s condition: "each of your non-headquarters missions requires Intelligence"', () => {
    const table = tainTable();
    const state = playConditionOf(tain(), costFactsOf(table))!;
    const c = missionRequires('Intelligence', { each: true });
    expect(state.status).toBe('met');
    expect(c.holds(tableViewOf(table))).toBe(true);
    expect(c.text(tableViewOf(table))).toBe(playConditionLine(tain(), state).replace(/^Condition met: /, ''));
  });

  it('does not hold where Enabran Tain\'s condition is not met', () => {
    const table = costsTable();
    const state = playConditionOf(tain(), costFactsOf(table))!;
    expect(state.status).toBe('notMet');
    expect(missionRequires('Intelligence', { each: true }).holds(tableViewOf(table))).toBe(false);
  });
});

describe('a condition of the table with its own words (#1875)', () => {
  it('reads as DaiMon Solok\'s: "you command three [Fer] personnel"', () => {
    const table = tainTable();
    const model = playModelOf('DaiMon Solok Cargo Runner')!;
    const state = playConditionOf(model, costFactsOf(table))!;
    const c = commands({ of: 'personnel', unstopped: true, affiliation: 'ferengi' }, '[Fer] personnel', {
      min: 3,
      text: 'you command three [Fer] personnel',
    });
    expect(c.holds(tableViewOf(table))).toBe(state.status === 'met');
    expect(c.text(tableViewOf(table))).toBe(state.text);
  });
});

describe('completedMissionRequiring and completedMissions (#1875)', () => {
  /** The costs table with the first mission requiring Diplomacy or Leadership completed. */
  function completedTable(): [TableState, number] {
    const table = costsTable();
    const view = tableViewOf(table);
    const index = view.missions.findIndex((m) => requiresSkill(m, 'diplomacy') || requiresSkill(m, 'leadership'));
    expect(index).toBeGreaterThanOrEqual(0);
    return [{ ...table, missions: table.missions.map((s, i) => (i === index ? { ...s, completed: true } : s)) }, index];
  }

  it('reads as Data Lucasian Chair: "you completed <name> (requires <skill>)"', () => {
    const [table] = completedTable();
    const c = completedMissionRequiring(['Diplomacy', 'Leadership']);
    expect(c.holds(tableViewOf(table))).toBe(true);
    expect(c.text(tableViewOf(table))).toBe(reasonOf('Data Lucasian Chair', table));
    expect(c.holds(tableViewOf(costsTable()))).toBe(false);
  });

  it('counts the completed missions, within min and max', () => {
    const [table, index] = completedTable();
    const view = tableViewOf(table);
    expect(completedMissions().holds(view)).toBe(true);
    expect(completedMissions({ min: 2 }).holds(view)).toBe(false);
    expect(completedMissions({ max: 0 }).holds(view)).toBe(false);
    expect(completedMissions().text(view)).toBe('you completed 1 mission');
    expect(missions(view, { completed: true }).map((m) => m.index)).toEqual([index]);
  });
});

describe('atThisMission and aboardThisShip (#1875)', () => {
  const person = (id: string, row: Record<string, string>, stopped = false): CardInstance => ({
    id,
    face: 'up',
    card: { name: `invented ${id}`, originalName: `Invented ${id}`, type: 'personnel', affiliation: 'cardassian', species: 'cardassian', ...row },
    ...(stopped ? { stopped: true } : {}),
  });
  const ship: CardInstance = { id: 'ship', face: 'up', card: { name: 'invented ship', originalName: 'Invented Ship', type: 'ship' } };

  function tableWith(awayTeam: CardInstance[], crew: CardInstance[] = []): TableState {
    const table = costsTable();
    return {
      ...table,
      missions: table.missions.map((s, i) => (i === 1 ? { ...s, awayTeam, ships: [{ ...ship, crew }] } : s)),
    };
  }

  it('reads as Ari: "a Gul or Legate at this mission", a stopped one counting', () => {
    const table = tableWith([person('gul', { keywords: 'Gul.' }, true)]);
    const c = atThisMission({ unstopped: false, where: (p) => p.keywords.includes('gul') || p.keywords.includes('legate') }, 'a Gul or Legate');
    expect(c.holds(tableViewOf(table), { missionIndex: 1 })).toBe(true);
    expect(c.holds(tableViewOf(table), { missionIndex: 0 })).toBe(false);
    expect(c.holds(tableViewOf(table))).toBe(false);
    expect(c.text(tableViewOf(table), { missionIndex: 1 })).toBe(reasonOf('Ari', table, play(3, { missionIndex: 1 })));
  });

  it('reads as Scimitar with a count: "2 Remans at this mission"', () => {
    const table = tableWith([person('r1', { species: 'reman' })], [person('r2', { species: 'reman' })]);
    const c = atThisMission({ unstopped: false, species: 'reman' }, (n) => (n === 1 ? '1 Reman' : `${n} Remans`));
    expect(c.text(tableViewOf(table), { missionIndex: 1 })).toBe(reasonOf('Scimitar Reman Warbird', table, play(5, { type: 'ship', missionIndex: 1 })));
    expect(c.text(tableViewOf(table), { missionIndex: 1 })).toBe('2 Remans at this mission');
  });

  it('reads and holds as Mavek\'s condition: "your non-Cardassian is at this mission", the card itself left out', () => {
    const model = playModelOf('Mavek Science Officer')!;
    const c = atThisMission({ unstopped: false, where: (p) => !p.species.includes('cardassian') }, 'your non-Cardassian is');
    for (const awayTeam of [[person('mavek', { species: 'vulcan' })], [person('mavek', { species: 'vulcan' }), person('other', { species: 'human' })]]) {
      const table = tableWith(awayTeam);
      const at = { missionIndex: 1, id: 'mavek' };
      const state = playConditionOf(model, costFactsOf(table), at)!;
      expect(c.holds(tableViewOf(table), at)).toBe(state.status === 'met');
      expect(c.text(tableViewOf(table), at)).toBe(state.text);
    }
  });

  it('aboardThisShip reads the crew of the played card\'s ship only', () => {
    const table = tableWith([person('down', { skills: 'Engineer' })], [person('up', { skills: 'Engineer' }), person('played', { skills: 'Engineer' })]);
    const c = aboardThisShip({ unstopped: true, skill: 'engineer' }, (n) => `${n} Engineer personnel`);
    expect(c.holds(tableViewOf(table), { shipId: 'ship', id: 'played' })).toBe(true);
    expect(c.text(tableViewOf(table), { shipId: 'ship', id: 'played' })).toBe('1 Engineer personnel aboard this ship');
    expect(c.holds(tableViewOf(table), { missionIndex: 1 })).toBe(false);
  });
});

describe('the selectors\' options (#1875)', () => {
  it('match a skill, a keyword, an icon, a place and a ship', () => {
    const table = costsTable();
    const view = tableViewOf(table);
    const shipId = table.missions[2].ships[0].id;
    expect(ids(personnel(view, { unstopped: false, aboard: shipId }))).toEqual(
      ids((table.missions[2].ships[0].crew ?? []).filter((c) => c.card?.type === 'personnel'))
    );
    expect(personnel(view, { unstopped: false, at: 0 }).every((p) => p.missionIndex === 0 && p.shipId === undefined)).toBe(true);
    const withIcon = personnel(view, { unstopped: false, icon: '[DS9]' });
    expect(withIcon.every((p) => p.icons.includes('[ds9]'))).toBe(true);
    expect(ids(personnel(view, { unstopped: false, icon: 'ds9' }))).toEqual(ids(withIcon));
    expect(ships(view, { at: 2 }).map((s) => s.id)).toEqual([shipId]);
    expect(missions(view, { includeEmpty: true })).toHaveLength(view.missions.length);
    expect(missions(view, { headquarters: false }).every((m) => m.type !== 'h' && !m.empty)).toBe(true);
  });
});

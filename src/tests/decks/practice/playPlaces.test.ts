import { readFileSync } from 'fs';
import { join } from 'path';
import { placeTableOf, playPlacesOf, type PlayPlaces } from '../../../app/decks/practice/playPlaces';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableState } from '../../../app/decks/practice/tableReducer';
import { playPlacesOfRow } from '../../../lib/playPlaces';
import { classifySentence, sentencesOf } from '../../../lib/playPlaces/parse';

// Where a personnel, a ship or an equipment may be played (#1855), on hand-built tables of real card rows,
// lowercased as the page reads them.

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
const cards = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: Record<string, string> = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    return row;
  });
})();
const row = (name: string) => {
  const found = cards.find((c) => c.originalName === name);
  if (!found) throw new Error(`no card ${name}`);
  return found;
};

let next = 0;
const instance = (name: string, crew: string[] = []): CardInstance => {
  const c: CardInstance = { id: `card-${++next}`, card: row(name), face: 'up' };
  if (crew.length) c.crew = crew.map((n) => instance(n));
  return c;
};

const tableOf = (slots: Partial<MissionSlot>[], extra: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] })),
  ...extra,
});

const sorted = (places: PlayPlaces | null) =>
  places && { awayTeams: [...places.awayTeams].sort(), crews: [...places.crews].sort(), shipRows: [...places.shipRows].sort() };

const EARTH = 'Earth Cradle of the Federation';
const MOAB = 'Moab IV Avert Danger';

describe('the headquarters rules', () => {
  it("makes a [TNG] personnel eligible at Earth's away team and the crews of its ship row, not at a planet", () => {
    const earthShip = instance('U.S.S. Enterprise-E Federation Envoy');
    const moabShip = instance('U.S.S. Enterprise-E Flagship of the Federation');
    const table = tableOf([
      { mission: instance(EARTH), ships: [earthShip] },
      { mission: instance(MOAB), ships: [moabShip] },
    ]);
    expect(sorted(playPlacesOf(row("Deanna Troi Ship's Counselor"), table))).toEqual({
      awayTeams: [0],
      crews: [earthShip.id],
      shipRows: [],
    });
    expect(sorted(playPlacesOf(row('U.S.S. Enterprise-E Federation Envoy'), table))).toEqual({ awayTeams: [], crews: [], shipRows: [0] });
  });

  it("reads Kira Nerys Starfleet Emissary's own headquarters through the headquarters table", () => {
    const table = tableOf([
      { mission: instance('Bajor Gift of the Prophets') },
      { mission: instance('Cardassia Prime Hardscrabble World') },
      { mission: instance('Ferenginar Financial Hub') },
    ]);
    expect(sorted(playPlacesOf(row('Kira Nerys Starfleet Emissary'), table))?.awayTeams).toEqual([0, 1]);
  });
});

describe("a ship's own text for the cards played aboard it", () => {
  it('U.S.S. Relativity takes a [Fut][Fed] personnel aboard, not a non-[Fut] one', () => {
    const relativity = instance('U.S.S. Relativity Federation Timeship');
    const table = tableOf([{ mission: instance(MOAB), ships: [relativity] }]);
    expect(sorted(playPlacesOf(row('Geordi La Forge Retired Engineer'), table))?.crews).toEqual([relativity.id]);
    expect(sorted(playPlacesOf(row("Deanna Troi Ship's Counselor"), table))?.crews).toEqual([]);
    expect(sorted(playPlacesOf(row('Tricorder'), table))?.crews).toEqual([relativity.id]);
  });

  it("U.S.S. Voyager takes a [Voy] personnel only while it is at a [DQ] mission, and Tykk takes no equipment", () => {
    const voyager = instance('U.S.S. Voyager Home Away From Home');
    const tykk = instance('Tykk');
    const kim = row(cards.find((c) => c.type === 'personnel' && c.icons.includes('[voy]') && c.affiliation === 'federation')!.originalName);
    const atAlpha = tableOf([{ mission: instance(MOAB), ships: [voyager, tykk] }]);
    const atDelta = tableOf([{ mission: instance("Caretaker's Array Protect Ocampa"), ships: [voyager, tykk] }]);
    expect(sorted(playPlacesOf(kim, atAlpha))?.crews).toEqual([]);
    expect(sorted(playPlacesOf(kim, atDelta))?.crews).toEqual([voyager.id]);
    expect(sorted(playPlacesOf(row('Tricorder'), atDelta))?.crews).toEqual([voyager.id]);
  });
});

describe("the played card's own text", () => {
  it('Tomek gets only the crews of [Rom] ships', () => {
    const romName = cards.find((c) => c.type === 'ship' && c.affiliation === 'romulan')!.originalName;
    const rom = instance(romName);
    const fed = instance('U.S.S. Enterprise-E Federation Envoy');
    const table = tableOf([{ mission: instance(MOAB), ships: [rom, fed] }]);
    expect(sorted(playPlacesOf(row('Tomek Displaced Alien'), table))).toEqual({ awayTeams: [], crews: [rom.id], shipRows: [] });
    expect(sorted(playPlacesOf(row("Telek R'Mor Astrophysical Researcher"), table))?.crews).toEqual([rom.id]);
  });

  it('U.S.S. Reliant Searching for Lifeless Planets plays at Earth while a [TOS] personnel is commanded', () => {
    const lush = 'Earth Lush and Beautiful Home';
    const reliant = row('U.S.S. Reliant Searching for Lifeless Planets');
    const without = tableOf([{ mission: instance(EARTH) }, { mission: instance(lush) }, { mission: instance(MOAB) }]);
    expect(sorted(playPlacesOf(reliant, without))?.shipRows).toEqual([1]); // [TOS]: Earth Lush and Beautiful Home's own rule
    const withTos = tableOf([
      { mission: instance(EARTH) },
      { mission: instance(lush) },
      { mission: instance(MOAB), awayTeam: [instance('Tristan Adams Deranged Psychiatrist')] },
    ]);
    expect(sorted(playPlacesOf(reliant, withTos))?.shipRows).toEqual([0, 1]);
  });

  it('Shuttlepod One plays at the mission of an Enterprise, not of a U.S.S. Enterprise', () => {
    const table = tableOf([
      { mission: instance(MOAB), ships: [instance('U.S.S. Enterprise-E Federation Envoy')] },
      { mission: instance('Curnab Sector Prevent Historical Disruption'), ships: [instance('Enterprise Damaged Starship')] },
    ]);
    expect(sorted(playPlacesOf(row('Shuttlepod One Reliable Transport'), table))?.shipRows).toEqual([1]);
  });

  it("Tristan Adams's cost text adds no place", () => {
    const table = tableOf([{ mission: instance(MOAB), ships: [instance('U.S.S. Enterprise-E Federation Envoy')] }]);
    expect(sorted(playPlacesOf(row('Tristan Adams Deranged Psychiatrist'), table))).toEqual({ awayTeams: [], crews: [], shipRows: [] });
  });

  it('Kamok takes a place and leaves the cost: a [Kli] ship at a non-[AQ] mission', () => {
    const klingonShip = cards.find((c) => c.type === 'ship' && c.affiliation === 'klingon')!.originalName;
    const alpha = instance(klingonShip);
    const delta = instance(klingonShip);
    const table = tableOf([
      { mission: instance(MOAB), ships: [alpha] },
      { mission: instance("Caretaker's Array Protect Ocampa"), ships: [delta] },
    ]);
    expect(sorted(playPlacesOf(row('Kamok'), table))?.crews).toEqual([delta.id]);
  });
});

describe("a mission's own text", () => {
  it("Curnab Sector takes Temporal ships, off while the player commands a headquarters", () => {
    const relativity = row('U.S.S. Relativity Federation Timeship');
    const curnab = { mission: instance('Curnab Sector Prevent Historical Disruption') };
    expect(sorted(playPlacesOf(relativity, tableOf([curnab])))?.shipRows).toEqual([0]);
    expect(sorted(playPlacesOf(relativity, tableOf([curnab, { mission: instance(EARTH) }])))?.shipRows).toEqual([]);
    expect(sorted(playPlacesOf(row('U.S.S. Enterprise-E Federation Envoy'), tableOf([curnab])))?.shipRows).toEqual([]);
  });

  it('Vanden Prime takes [Car] ships only while it is complete', () => {
    const carShip = row(cards.find((c) => c.type === 'ship' && c.affiliation === 'cardassian')!.originalName);
    const vanden = instance('Vanden Prime Coordinate Resistance Operations');
    expect(sorted(playPlacesOf(carShip, tableOf([{ mission: vanden }])))?.shipRows).toEqual([]);
    expect(sorted(playPlacesOf(carShip, tableOf([{ mission: vanden, completed: true }])))?.shipRows).toEqual([0]);
  });
});

describe('the shape of the answer', () => {
  it('gives null for an event, and three empty sets for a card with no eligible place', () => {
    const table = tableOf([{ mission: instance(MOAB) }]);
    expect(playPlacesOf(row('Inspiring Leader'), table)).toBeNull();
    expect(sorted(playPlacesOf(row("Deanna Troi Ship's Counselor"), table))).toEqual({ awayTeams: [], crews: [], shipRows: [] });
  });

  it('reads a raw-case row as it reads a lowercased one', () => {
    const table = tableOf([{ mission: instance(EARTH) }]);
    const raw = { name: "Deanna Troi Ship's Counselor", type: 'Personnel', affiliation: 'Federation', icons: '[Stf][TNG]', gametext: '' };
    expect(sorted(playPlacesOfRow(raw, placeTableOf(table)))?.awayTeams).toEqual([0]);
  });
});

describe('the parse', () => {
  it('keeps a brace reference with full stops in one sentence', () => {
    expect(sentencesOf('You may play this personnel aboard your {U.S.S. Voyager}. Order - Draw.')).toEqual([
      'you may play this personnel aboard your {u.s.s. voyager}',
      'order - draw',
    ]);
  });

  it('reads an opponent\'s ship as no place, and a condition it cannot read as unread', () => {
    expect(classifySentence("while you command two founders, you may play this personnel at cost +2 aboard an opponent's ship").kind).toBe('notAPlace');
    expect(classifySentence("while you command {qo'nos} and no other [aq] missions, you may play this ship at your [dq] mission").kind).toBe('unread');
  });
});

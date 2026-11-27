import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../app/decks/practice/tableReducer';
import { AttributeTable, personnelAttributesOnTable, shipAttributesOnTable } from '../../app/decks/practice/attributeModels';
import { shipRangeOnTable } from '../../app/decks/practice/shipRange';
import { modifierCardOf, tableViewOf } from '../../app/decks/practice/tableView';
import { skillsGainedOf } from '../../lib/modifiers';

// Issue #1942: a stopped personnel or ship is the source of no modifier row, at every place the amount evaluators
// read. Rulebook v4, Glossary › "stopped", p. 20: "You cannot use the game text, attributes, icons, or any other
// characteristic of any of your personnel or ships that are stopped." The same entry says equipment does not become
// stopped, so an equipment's row applies whatever flag its instance carries. The titles are real; every other card
// is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', unique: 'n', gametext: '', ...extra },
  face: 'up',
});
const stop = (c: CardInstance): CardInstance => ({ ...c, stopped: true });

const mission = (name: string) => card(name, 'mission', { points: '35', missiontype: 'p' });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', ...extra });
const ship = (name: string, crew: CardInstance[] = [], extra: Record<string, string> = {}): CardInstance => ({
  ...card(name, 'ship', { range: '7', weapons: '7', shields: '6', ...extra }),
  crew,
});

const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] }));
const tableOf = (missions: MissionSlot[], extra: Partial<AttributeTable> = {}): AttributeTable => ({
  missions,
  core: [],
  hand: [],
  discard: [],
  brig: [],
  score: 0,
  ...extra,
});

const shipRead = (table: AttributeTable, s: CardInstance) => ({ range: shipRangeOnTable(table, s), ...shipAttributesOnTable(table, s) });
const SHIP_PRINTED = { range: 7, weapons: 7, shields: 6 };
const shipPlus = (n: number) => ({ range: 7 + n, weapons: 7 + n, shields: 6 + n });
const PRINTED = { integrity: 5, cunning: 6, strength: 4 };

describe('a stopped source changes nothing (#1942)', () => {
  it('commanded: a stopped A. G. Robinson Prototype Captain gives no [SF] ship +1', () => {
    const robinson = personnel('A. G. Robinson Prototype Captain', { affiliation: 'starfleet', icons: '[cmd][pa]' });
    const far = ship('Far', [], { affiliation: 'starfleet' });
    const at = (r: CardInstance) => tableOf(slotsOf([{ mission: mission('One'), awayTeam: [r] }, { mission: mission('Two'), ships: [far] }]));
    expect(shipRead(at(robinson), far)).toEqual(shipPlus(1));
    expect(shipRead(at(stop(robinson)), far)).toEqual(SHIP_PRINTED);
  });

  it('aboard: a stopped Thomas Riker Defiant Leader gives his [Fed] ship no Range +2', () => {
    const riker = personnel('Thomas Riker Defiant Leader', { affiliation: 'federation' });
    const on = (r: CardInstance) => ship('Relativity', [r], { affiliation: 'federation', range: '8' });
    const at = (s: CardInstance) => tableOf(slotsOf([{ mission: mission('Here'), ships: [s] }]));
    const crewed = on(riker);
    expect(shipRangeOnTable(at(crewed), crewed)).toBe(10);
    expect(shipRangeOnTable(tableOf(slotsOf([])), crewed)).toBe(10);
    const stopped = on(stop(riker));
    expect(shipRangeOnTable(at(stopped), stopped)).toBe(8);
    expect(shipRangeOnTable(tableOf(slotsOf([])), stopped)).toBe(8);
  });

  it('self: a stopped Brennan Scott shows his printed attributes, and an unstopped teammate still changes them', () => {
    const brennan = personnel('Brennan Scott');
    const hand = [card('Filler', 'event'), card('Filler', 'event')];
    const at = (b: CardInstance, team: CardInstance[] = []) => tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [b, ...team] }]), { hand });
    expect(personnelAttributesOnTable(at(brennan), brennan)).toEqual({ integrity: 3, cunning: 4, strength: 2 });
    const stopped = stop(brennan);
    expect(personnelAttributesOnTable(at(stopped), stopped)).toEqual(PRINTED);
    const artim = personnel('Artim Inspirational Child', { unique: 'y' });
    const uniqueStopped = stop(personnel('Brennan Scott', { unique: 'y' }));
    expect(personnelAttributesOnTable(at(uniqueStopped, [artim]), uniqueStopped)).toEqual({ integrity: 6, cunning: 7, strength: 5 });
  });

  it('self: a stopped I.S.S. Enterprise Terran Flagship has no Range +2', () => {
    const flagship = ship('I.S.S. Enterprise Terran Flagship');
    const at = (s: CardInstance) => tableOf(slotsOf([{ mission: mission('Here'), ships: [s] }]));
    expect(shipRangeOnTable(at(flagship), flagship)).toBe(9);
    const stopped = stop(flagship);
    expect(shipRangeOnTable(at(stopped), stopped)).toBe(7);
  });

  it('group and shipRow: a stopped ship gives no skill, and a stopped equipment still does', () => {
    const thinker = personnel('Thinker', { keywords: 'think tank', skills: 'Science' });
    const tower = (crew: CardInstance[]) => ship('Think Tank Ship Ivory Tower', crew);
    const at = (s: CardInstance) => tableOf(slotsOf([{ mission: mission('Here'), ships: [s] }]));
    const gained = (t: AttributeTable, c: CardInstance) => skillsGainedOf(tableViewOf(t as never), modifierCardOf(c));
    expect(gained(at(tower([thinker])), thinker)).toEqual(['Telepathy']);
    expect(gained(at(stop(tower([thinker]))), thinker)).toEqual([]);

    const engineer = personnel('Engineer', { skills: 'Engineer' });
    const padd = card('Engineering PADD', 'equipment');
    const team = (p: CardInstance) => tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [p, engineer] }]));
    expect(gained(team(padd), engineer)).toEqual(['Astrometrics']);
    expect(gained(team(stop(padd)), engineer)).toEqual(['Astrometrics']);
  });
});

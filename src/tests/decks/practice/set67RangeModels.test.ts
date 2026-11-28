import { readFileSync } from 'fs';
import { join } from 'path';
import { gameReducer, initialGameState } from '../../../app/decks/practice/gameLog';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableState } from '../../../app/decks/practice/tableReducer';
import { attributeModelOf } from '../../../app/decks/practice/attributeModels';
import { attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { rangeSpanModelOf } from '../../../app/decks/practice/rangeModels';
import { moveSpanTotal, shipRangeOnTable } from '../../../app/decks/practice/shipRange';
import { cardTitleOf } from '../../../lib/cardTitle';

// The range and span models of set 67 (60S, #1827): Soliton Wave and Shadows of the Night. The rows
// follow the card data: lowercased fields, and `originalName` as printed. Every card here but the
// titles under test is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, missiontype: string, span = '2') => card(name, 'mission', { span, quadrant: 'a', missiontype });
const ship = (name: string, range: string, extra: Record<string, string> = {}) => card(name, 'ship', { range, ...extra });
const event = (name: string) => card(name, 'event');

const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...slots[i] }));

const tableOf = (slots: Partial<MissionSlot>[], extra: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: slotsOf(slots),
  ...extra,
});

describe('Soliton Wave (#1827)', () => {
  it('makes every ship on every ship row Range +1 while it is in the core, each copy +1', () => {
    const a = ship('Alpha Ship', '7');
    const b = ship('Beta Ship', '9');
    const slots = [
      { mission: mission('Here', 's'), ships: [a] },
      { mission: mission('There', 'p'), ships: [b] },
    ];
    const one = tableOf(slots, { core: [event('Soliton Wave')] });
    expect(shipRangeOnTable(one, a)).toBe(8);
    expect(shipRangeOnTable(one, b)).toBe(10);
    const two = tableOf(slots, { core: [event('Soliton Wave'), event('Soliton Wave')] });
    expect(shipRangeOnTable(two, a)).toBe(9);
  });

  it('lifts a ship of Range 0 to 1', () => {
    const z = ship('Zero Ship', '0');
    expect(shipRangeOnTable(tableOf([{ mission: mission('Here', 's'), ships: [z] }], { core: [event('Soliton Wave')] }), z)).toBe(1);
  });

  it('gives the printed Range with the setting off', () => {
    const a = ship('Alpha Ship', '7');
    expect(shipRangeOnTable(tableOf([{ mission: mission('Here', 's'), ships: [a] }], { core: [event('Soliton Wave')] }), a, false)).toBe(7);
  });

  it('gives nothing placed on a mission card or a ship, in the discard pile, or to a ship off the ship rows', () => {
    const a = ship('Alpha Ship', '7');
    const onMission = tableOf([{ mission: { ...mission('Here', 's'), placedOn: [event('Soliton Wave')] }, ships: [a] }]);
    expect(shipRangeOnTable(onMission, a)).toBe(7);
    const onShip = { ...ship('Beta Ship', '7'), placedOn: [event('Soliton Wave')] };
    expect(shipRangeOnTable(tableOf([{ mission: mission('Here', 's'), ships: [onShip] }]), onShip)).toBe(7);
    const discarded = tableOf([{ mission: mission('Here', 's'), ships: [a] }], { discard: [event('Soliton Wave')] });
    expect(shipRangeOnTable(discarded, a)).toBe(7);
    const inHand = ship('Gamma Ship', '7');
    expect(shipRangeOnTable(tableOf([], { core: [event('Soliton Wave')], hand: [inHand] }), inHand)).toBe(7);
  });

  it("shows on the ship's band as a rise over the printed Range", () => {
    const a = ship('Alpha Ship', '7');
    const t = tableOf([{ mission: mission('Here', 's'), ships: [a] }], { core: [event('Soliton Wave')] });
    expect(attributesOnTableOf(t, true)[a.id]).toEqual({ range: 8 });
    expect(attributesOnTableOf(t, false)[a.id]).toBeUndefined();
  });
});

describe('Shadows of the Night (#1827)', () => {
  const core = () => [event('Shadows of the Night')];
  const costly = () => ship('Costly Ship', '9', { cost: '3' });
  const temporal = () => ship('Temporal Ship', '9', { cost: '1', keywords: 'temporal.' });
  const cheap = () => ship('Cheap Ship', '9', { cost: '2' });
  const missions = () =>
    slotsOf([
      { mission: mission('Space', 's', '1') },
      { mission: mission('Planet', 'p', '2') },
      { mission: mission('Far Planet', 'p', '4') },
      { mission: mission('Far Space', 's', '4') },
    ]);

  it('makes a move of a ship of cost 3 or more, or a Temporal ship, to or from a space mission require 5 when it requires 4 or less', () => {
    const m = missions();
    expect(moveSpanTotal(m, 0, 1, costly(), core())).toBe(5);
    expect(moveSpanTotal(m, 1, 0, costly(), core())).toBe(5);
    expect(moveSpanTotal(m, 0, 1, temporal(), core())).toBe(5);
  });

  it('leaves a total over 4, a move between planet missions, and a cheap ship that is not Temporal', () => {
    const m = missions();
    expect(moveSpanTotal(m, 1, 3, costly(), core())).toBe(6);
    expect(moveSpanTotal(m, 1, 2, costly(), core())).toBe(6);
    expect(moveSpanTotal(slotsOf([{ mission: mission('A', 'p', '1') }, { mission: mission('B', 'h', '1') }]), 0, 1, costly(), core())).toBe(2);
    expect(moveSpanTotal(m, 0, 1, cheap(), core())).toBe(3);
  });

  // Rulebook v4, Glossary › "modifications", p. 18: "2) Replace: Any effects that use some form of the verbs "to
  // replace" or "to become" occur. 3) Modify: Any effects that add, increase, or reduce an aspect of a card by a
  // specific amount occur." Shadows of the Night reads the total before Hurried Departure takes its 3 off (#1945).
  it('reads the total before Hurried Departure takes its 3 off, in either core order', () => {
    const m = missions();
    expect(moveSpanTotal(m, 3, 1, costly(), [event('Hurried Departure')])).toBe(3);
    expect(moveSpanTotal(m, 3, 1, costly(), [...core(), event('Hurried Departure')])).toBe(3);
    expect(moveSpanTotal(m, 3, 1, costly(), [event('Hurried Departure'), ...core()])).toBe(3);
  });

  it('sets 5 and then takes the reduction off it, when both apply to the same move', () => {
    const region = { keywords: 'region: invented expanse.' };
    const m = slotsOf([
      { mission: card('Region Space', 'mission', { span: '4', quadrant: 'a', missiontype: 's', ...region }) },
      { mission: card('Region Planet', 'mission', { span: '2', quadrant: 'a', missiontype: 'p', ...region }) },
    ]);
    expect(moveSpanTotal(m, 0, 1, costly(), core())).toBe(5);
    expect(moveSpanTotal(m, 0, 1, costly(), [event('Hurried Departure')])).toBe(1);
    expect(moveSpanTotal(m, 0, 1, costly(), [...core(), event('Hurried Departure')])).toBe(2);
    expect(moveSpanTotal(m, 0, 1, costly(), [event('Hurried Departure'), ...core()])).toBe(2);
  });

  it('changes nothing with the setting off, nor out of the core', () => {
    const m = missions();
    expect(moveSpanTotal(m, 0, 1, costly(), core(), false)).toBe(3);
    expect(moveSpanTotal(m, 0, 1, costly())).toBe(3);
  });

  it('charges 5 to rangeUsed for the move', () => {
    const s = costly();
    const t = tableOf(
      [
        { mission: mission('Space', 's', '1'), ships: [s] },
        { mission: mission('Planet', 'p', '2') },
      ],
      { core: core() }
    );
    const moved = gameReducer(initialGameState(t), { type: 'move', id: s.id, to: { zone: 'shipRow', missionIndex: 1 }, cardText: true });
    expect(moved.table.rangeUsed).toEqual({ [s.id]: 5 });
  });
});

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();

const rowsOf = (title: string) => data.filter((row) => cardTitleOf(row.originalName) === title);
const instance = (row: any): CardInstance => ({ id: 'x', card: row, face: 'up' });

describe('the cards of set 67 against the card data (#1827)', () => {
  it('reads the real text of Soliton Wave and Shadows of the Night', () => {
    expect(rowsOf('Soliton Wave')[0].gametext).toContain('each ship in play is range +1.');
    expect(rowsOf('Shadows of the Night')[0].gametext).toContain('the range required becomes 5.');
  });

  it.each(['Soliton Wave', 'Shadows of the Night'])('maps every version of %s to its range model and to no attribute model', (title) => {
    const rows = rowsOf(title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(rangeSpanModelOf(instance(row))?.title).toBe(title);
      expect(attributeModelOf(instance(row))).toBeUndefined();
    }
  });

  it('gives the real Soliton Wave its +1 and the real Shadows of the Night its 5', () => {
    const wave = instance(rowsOf('Soliton Wave')[0]);
    const a = ship('Alpha Ship', '7');
    expect(shipRangeOnTable(tableOf([{ mission: mission('Here', 's'), ships: [a] }], { core: [wave] }), a)).toBe(8);
    const shadows = instance(rowsOf('Shadows of the Night')[0]);
    const relativity = instance(rowsOf('U.S.S. Relativity Federation Timeship')[0]);
    expect(moveSpanTotal(spaceToPlanet(), 0, 1, relativity, [shadows])).toBe(5);
  });

  // Klothos reads an opponent's ship, Glavin combat; Storil's choice and Purple Data's Head's skills
  // need new kinds (follow-ups of #1827).
  it.each(['I.K.S. Klothos Division Flagship', 'Glavin', 'Storil Courageous Captain', "Purple Data's Head"])(
    'keeps %s out of both registries',
    (title) => {
      const rows = rowsOf(title);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(rangeSpanModelOf(instance(row))).toBeUndefined();
        expect(attributeModelOf(instance(row))).toBeUndefined();
      }
    }
  );
});

function spaceToPlanet() {
  return slotsOf([{ mission: mission('Space', 's', '1') }, { mission: mission('Planet', 'p', '2') }]);
}

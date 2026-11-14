import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTRIBUTE_REGISTRY,
  attributeModelOf,
  personnelAttributesOnTable,
  shipAttributesOnTable,
} from '../../../app/decks/practice/attributeModels';

// The attribute models of #1664: U.S.S. Enterprise-J, Orlitus Cluster Astronomical Survey and Dark
// Dissension. The rows follow the card data: lowercased fields, and `originalName` as printed. Every
// personnel and ship here is invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, points: string, placedOn: CardInstance[] = []) => ({
  ...card(name, 'mission', { points, mission: 's' }),
  placedOn,
});
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', ...extra });
const ship = (name: string, extra: Record<string, string> = {}, crew: CardInstance[] = []) => ({
  ...card(name, 'ship', { weapons: '7', shields: '6', ...extra }),
  crew,
});
const enterpriseJ = (suffix = '') => card(`U.S.S. Enterprise-J${suffix}`, 'event');
const orlitus = (suffix = '') => card(`Orlitus Cluster Astronomical Survey${suffix}`, 'mission', { points: '30' });
const darkDissension = () => card('Dark Dissension', 'event');

const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
    ...slots[i],
  }));

const PRINTED = { integrity: 5, cunning: 6, strength: 4 };
const PLUS_ONE = { integrity: 6, cunning: 7, strength: 5 };

describe('U.S.S. Enterprise-J (#1664)', () => {
  it('gives attributes +1 to each personnel at a mission worth 40 or more, in the away team and aboard', () => {
    const away = personnel('Away');
    const aboard = personnel('Aboard');
    const elsewhere = personnel('Elsewhere');
    const missions = slotsOf([
      { mission: mission('Forty', '40', [enterpriseJ()]), awayTeam: [away], ships: [ship('Ship', {}, [aboard])] },
      { mission: mission('Other', '40'), awayTeam: [elsewhere] },
    ]);
    expect(personnelAttributesOnTable(missions, [], away)).toEqual(PLUS_ONE);
    expect(personnelAttributesOnTable(missions, [], aboard)).toEqual(PLUS_ONE);
    expect(personnelAttributesOnTable(missions, [], elsewhere)).toEqual(PRINTED);
  });

  it('gives nothing on a mission worth less than 40', () => {
    const away = personnel('Away');
    const missions = slotsOf([{ mission: mission('Thirty-five', '35', [enterpriseJ()]), awayTeam: [away] }]);
    expect(personnelAttributesOnTable(missions, [], away)).toEqual(PRINTED);
  });

  it('changes no ship', () => {
    const s = ship('Ship');
    const missions = slotsOf([{ mission: mission('Forty', '40', [enterpriseJ()]), ships: [s] }]);
    expect(shipAttributesOnTable(missions, [], s)).toEqual({ weapons: 7, shields: 6 });
  });
});

describe('Orlitus Cluster Astronomical Survey (#1664)', () => {
  it('gives attributes +1 to each personnel here with a cost of 1 or less, aboard and in the away team', () => {
    const cheapAboard = personnel('Cheap Aboard', { cost: '1' });
    const freeAway = personnel('Free Away', { cost: '0' });
    const dear = personnel('Dear', { cost: '2' });
    const noCost = personnel('No Cost', { cost: '' });
    const cheapElsewhere = personnel('Cheap Elsewhere', { cost: '1' });
    const missions = slotsOf([
      { mission: orlitus(), awayTeam: [freeAway, noCost], ships: [ship('Ship', {}, [cheapAboard, dear])] },
      { mission: mission('Other', '35'), awayTeam: [cheapElsewhere] },
    ]);
    expect(personnelAttributesOnTable(missions, [], cheapAboard)).toEqual(PLUS_ONE);
    expect(personnelAttributesOnTable(missions, [], freeAway)).toEqual(PLUS_ONE);
    expect(personnelAttributesOnTable(missions, [], dear)).toEqual(PRINTED);
    expect(personnelAttributesOnTable(missions, [], noCost)).toEqual(PRINTED);
    expect(personnelAttributesOnTable(missions, [], cheapElsewhere)).toEqual(PRINTED);
  });
});

describe('Dark Dissension (#1664)', () => {
  const tn = personnel('Tn', { icons: '[cmd][tn]' });
  const tng = personnel('Tng', { icons: '[tng]' });
  const plain = personnel('Plain');
  const tnShip = ship('Tn Ship', { icons: '[tn]' });
  const weakShip = ship('Weak Ship', { icons: '[tn]', shields: '0' });
  const tngShip = ship('Tng Ship', { icons: '[tng]' });
  const missions = slotsOf([
    { mission: mission('Here', '35'), awayTeam: [tn, tng, plain], ships: [tnShip, weakShip, tngShip] },
  ]);

  it('gives a [TN] personnel Integrity -1 and Cunning +1, and no other personnel anything', () => {
    const core = [darkDissension()];
    expect(personnelAttributesOnTable(missions, core, tn)).toEqual({ integrity: 4, cunning: 7, strength: 4 });
    expect(personnelAttributesOnTable(missions, core, tng)).toEqual(PRINTED);
    expect(personnelAttributesOnTable(missions, core, plain)).toEqual(PRINTED);
  });

  it('gives a [TN] ship Weapons +1 and Shields -1, never below 0', () => {
    const core = [darkDissension()];
    expect(shipAttributesOnTable(missions, core, tnShip)).toEqual({ weapons: 8, shields: 5 });
    expect(shipAttributesOnTable(missions, core, weakShip)).toEqual({ weapons: 8, shields: 0 });
    expect(shipAttributesOnTable(missions, core, tngShip)).toEqual({ weapons: 7, shields: 6 });
  });

  it('counts every copy in the core', () => {
    expect(personnelAttributesOnTable(missions, [darkDissension(), darkDissension()], tn)).toEqual({
      integrity: 3,
      cunning: 8,
      strength: 4,
    });
  });

  it('gives nothing out of the core, and nothing to a [TN] personnel the player does not command', () => {
    expect(personnelAttributesOnTable(missions, [], tn)).toEqual(PRINTED);
    const inHand = personnel('In Hand', { icons: '[tn]' });
    expect(personnelAttributesOnTable(missions, [darkDissension()], inHand)).toEqual(PRINTED);
  });
});

describe('the option "Apply card text to attributes" off (#1664, #1668)', () => {
  it('reads every personnel and ship at its printed values', () => {
    const away = personnel('Away', { cost: '1', icons: '[tn]' });
    const s = ship('Ship', { icons: '[tn]' });
    const missions = slotsOf([
      { mission: mission('Forty', '40', [enterpriseJ()]), awayTeam: [away] },
      { mission: orlitus(), ships: [s] },
    ]);
    const core = [darkDissension()];
    expect(personnelAttributesOnTable(missions, core, away)).toEqual({ integrity: 5, cunning: 8, strength: 5 });
    expect(personnelAttributesOnTable(missions, core, away, false)).toEqual(PRINTED);
    expect(shipAttributesOnTable(missions, core, s, false)).toEqual({ weapons: 7, shields: 6 });
  });
});

describe('the registry of attribute models (#1664)', () => {
  it.each([
    ['U.S.S. Enterprise-J', enterpriseJ()],
    ['U.S.S. Enterprise-J', enterpriseJ(' *A')],
    ['U.S.S. Enterprise-J', enterpriseJ(' *VP')],
    ['Orlitus Cluster Astronomical Survey', orlitus()],
    ['Orlitus Cluster Astronomical Survey', orlitus(' (FOW)')],
    ['Dark Dissension', darkDissension()],
  ])('maps every version to its model (%s)', (title, c) => {
    expect(attributeModelOf(c)?.title).toBe(title);
  });

  it('holds one model per title', () => {
    expect(ATTRIBUTE_REGISTRY.size).toBe(3);
    expect(attributeModelOf(personnel('Nobody'))).toBeUndefined();
  });
});

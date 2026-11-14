import { readFileSync } from 'fs';
import { join } from 'path';
import { CardInstance, MISSION_SLOTS, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTRIBUTE_REGISTRY,
  AttributeTable,
  attributeModelOf,
  personnelAttributesOnTable,
} from '../../../app/decks/practice/attributeModels';
import { botPersonnelOf } from '../../../lib/dilemmaBot/simulator';
import { cardTitleOf } from '../../../lib/cardTitle';

// The attribute models of #1667: the 11 cards held by three or more shipped decks, through the hooks
// of a personnel's own attributes, its group and a ship's crew. The rows follow the card data:
// lowercased fields, and `originalName` as printed. Every personnel here but the titles under test is
// invented.
let next = 0;
const card = (originalName: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id: `card-${++next}`,
  card: { name: originalName.toLowerCase(), originalName, type, imagefile: 'x', ...extra },
  face: 'up',
});

const mission = (name: string, extra: Record<string, string> = {}) => card(name, 'mission', { points: '35', mission: 'p', ...extra });
const personnel = (name: string, extra: Record<string, string> = {}) =>
  card(name, 'personnel', { integrity: '5', cunning: '6', strength: '4', cost: '2', ...extra });
const ship = (name: string, crew: CardInstance[] = []) => ({ ...card(name, 'ship', { weapons: '7', shields: '6' }), crew });

const slotsOf = (slots: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: null,
    ships: [],
    awayTeam: [],
    underMission: [],
    ...slots[i],
  }));

const tableOf = (missions: MissionSlot[], hand: CardInstance[] = []): AttributeTable => ({
  missions,
  core: [],
  hand,
  discard: [],
  score: 0,
});

const PRINTED = { integrity: 5, cunning: 6, strength: 4 };
const PLUS_ONE = { integrity: 6, cunning: 7, strength: 5 };
const of = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p);
const off = (table: AttributeTable, p: CardInstance) => personnelAttributesOnTable(table, p, false);

describe('Nador Curious Commander (#1667)', () => {
  const nador = () => personnel('Nador Curious Commander', { icons: '[cmd][au]' });
  const completed = (pts: string) => ({ mission: mission('Done', { points: pts }), completed: true });

  it('gives each [AU] personnel present attributes +1, himself too, while a completed mission is worth 40 or more', () => {
    const n = nador();
    const au = personnel('Mirror', { icons: '[au]' });
    const plain = personnel('Plain', { icons: '[stf]' });
    const elsewhere = personnel('Elsewhere', { icons: '[au]' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [n, au, plain] }, completed('40'), { mission: mission('There'), awayTeam: [elsewhere] }]));
    expect(of(table, au)).toEqual(PLUS_ONE);
    expect(of(table, n)).toEqual({ integrity: 6, cunning: 7, strength: 5 });
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, elsewhere)).toEqual(PRINTED);
    expect(off(table, au)).toEqual(PRINTED);
  });

  it('gives nothing while the completed mission is worth 39', () => {
    const au = personnel('Mirror', { icons: '[au]' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [nador(), au] }, completed('39')]));
    expect(of(table, au)).toEqual(PRINTED);
  });
});

describe('Computation Drone (#1667)', () => {
  const drone = () => personnel('Computation Drone', { species: 'borg', affiliation: 'borg' });

  it('gives each other Borg present Cunning +1, not itself; a second Drone gives the first +1', () => {
    const a = drone();
    const borg = personnel('Borg', { species: 'borg' });
    const human = personnel('Human', { species: 'human' });
    const otherCrew = personnel('Other crew', { species: 'borg' });
    const inHand = personnel('In hand', { species: 'borg' });
    const table = tableOf(
      slotsOf([{ mission: mission('Here'), ships: [ship('Cube', [a, borg, human]), ship('Sphere', [otherCrew])] }]),
      [inHand]
    );
    expect(of(table, borg)).toEqual({ ...PRINTED, cunning: 7 });
    expect(of(table, a)).toEqual(PRINTED);
    expect(of(table, human)).toEqual(PRINTED);
    expect(of(table, otherCrew)).toEqual(PRINTED);
    expect(of(table, inHand)).toEqual(PRINTED);

    const b = drone();
    const two = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [a, b] }]));
    expect(of(two, a)).toEqual({ ...PRINTED, cunning: 7 });
  });

  it('still gives Cunning +1 while stopped', () => {
    const borg = personnel('Borg', { species: 'borg' });
    const table = tableOf(slotsOf([{ mission: mission('Here'), awayTeam: [{ ...drone(), stopped: true }, borg] }]));
    expect(of(table, borg)).toEqual({ ...PRINTED, cunning: 7 });
  });
});

describe("Queen's Borg Sphere Contingency Vessel (#1667)", () => {
  it('gives the personnel aboard attributes +1 at a [Bor] mission, not the away team below it', () => {
    const aboard = personnel('Aboard');
    const away = personnel('Away');
    const sphere = ship("Queen's Borg Sphere Contingency Vessel *VP", [aboard]);
    const table = tableOf(slotsOf([{ mission: mission('Unimatrix', { affiliation: '[bor]' }), ships: [sphere], awayTeam: [away] }]));
    expect(of(table, aboard)).toEqual(PLUS_ONE);
    expect(of(table, away)).toEqual(PRINTED);
  });

  it('gives nothing at another mission', () => {
    const aboard = personnel('Aboard');
    const table = tableOf(slotsOf([{ mission: mission('Elsewhere', { affiliation: '[fed]' }), ships: [ship("Queen's Borg Sphere Contingency Vessel", [aboard])] }]));
    expect(of(table, aboard)).toEqual(PRINTED);
  });
});

describe('Doran (#1667)', () => {
  const doran = (suffix = '') => personnel(`Doran${suffix}`, { affiliation: 'non-aligned', integrity: '3', cunning: '5', strength: '5' });
  const car = () => personnel('Gul', { affiliation: 'cardassian' });
  const DORAN = { integrity: 3, cunning: 5, strength: 5 };

  it('is attributes +1 while you command three other [Car] personnel, anywhere', () => {
    const d = doran(' (IDR)');
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [d, car()] }, { mission: mission('B'), ships: [ship('Galor', [car(), car()])] }]));
    expect(of(table, d)).toEqual({ integrity: 4, cunning: 6, strength: 6 });
    expect(off(table, d)).toEqual(DORAN);
  });

  it('gives nothing at two [Car] personnel, nor with a second Doran, nor counting the brig or the hand', () => {
    const d = doran();
    const two = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [d, car(), car()] }]), [car()]);
    expect(of(two, d)).toEqual(DORAN);
    const twoDorans = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [d, doran(), car(), car()] }]));
    expect(of(twoDorans, d)).toEqual(DORAN);
  });
});

describe('Benjamin Sisko Enlightened Supervisor (#1667)', () => {
  const sisko = () => personnel('Benjamin Sisko Enlightened Supervisor', { affiliation: 'federation' });

  it('gives each [Fed] personnel present attributes +1, himself too, while a [Baj] personnel is present', () => {
    const s = sisko();
    const fed = personnel('Fed', { affiliation: 'federation' });
    const baj = personnel('Baj', { affiliation: 'bajoran' });
    const fedElsewhere = personnel('Fed elsewhere', { affiliation: 'federation' });
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [s, fed, baj], ships: [ship('Runabout', [fedElsewhere])] }]));
    expect(of(table, fed)).toEqual(PLUS_ONE);
    expect(of(table, s)).toEqual(PLUS_ONE);
    expect(of(table, baj)).toEqual(PRINTED);
    expect(of(table, fedElsewhere)).toEqual(PRINTED);
  });

  it('gives nothing with no [Baj] personnel present', () => {
    const fed = personnel('Fed', { affiliation: 'federation' });
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [sisko(), fed] }]));
    expect(of(table, fed)).toEqual(PRINTED);
  });
});

describe('Bridon (#1667)', () => {
  it('gives each [Vid] personnel present attributes +1, himself too, while you command no completed mission', () => {
    const b = personnel('Bridon', { affiliation: 'vidiian' });
    const vid = personnel('Vid', { affiliation: 'vidiian' });
    const other = personnel('Other', { affiliation: 'kazon' });
    const missions = slotsOf([{ mission: mission('A'), awayTeam: [b, vid, other] }, { mission: mission('B') }]);
    expect(of(tableOf(missions), vid)).toEqual(PLUS_ONE);
    expect(of(tableOf(missions), b)).toEqual(PLUS_ONE);
    expect(of(tableOf(missions), other)).toEqual(PRINTED);

    missions[1] = { ...missions[1], completed: true };
    expect(of(tableOf(missions), vid)).toEqual(PRINTED);
  });
});

describe('Brennan Scott (#1667)', () => {
  it('is attributes -1 for each card in your hand, never below 0', () => {
    const b = personnel('Brennan Scott', { integrity: '8', cunning: '8', strength: '8' });
    const missions = slotsOf([{ mission: mission('A'), awayTeam: [b] }]);
    const hand = (n: number) => Array.from({ length: n }, () => card('Event', 'event'));
    expect(of(tableOf(missions, hand(2)), b)).toEqual({ integrity: 6, cunning: 6, strength: 6 });
    expect(of(tableOf(missions, hand(9)), b)).toEqual({ integrity: 0, cunning: 0, strength: 0 });
    expect(of(tableOf(missions), b)).toEqual({ integrity: 8, cunning: 8, strength: 8 });
    expect(off(tableOf(missions, hand(2)), b)).toEqual({ integrity: 8, cunning: 8, strength: 8 });
  });

  it('is unchanged in the hand', () => {
    const b = personnel('Brennan Scott', { integrity: '8', cunning: '8', strength: '8' });
    expect(of(tableOf(slotsOf([]), [b, card('Event', 'event')]), b)).toEqual({ integrity: 8, cunning: 8, strength: 8 });
  });
});

describe('Drenol (#1667)', () => {
  it('is Cunning +1 and Strength +1 for each incomplete non-headquarters mission you command', () => {
    const d = personnel('Drenol', { integrity: '5', cunning: '3', strength: '3' });
    const table = tableOf(
      slotsOf([
        { mission: mission('A'), awayTeam: [d] },
        { mission: mission('B', { mission: 's' }) },
        { mission: mission('HQ', { mission: 'h' }) },
        { mission: mission('Done'), completed: true },
      ])
    );
    expect(of(table, d)).toEqual({ integrity: 5, cunning: 5, strength: 5 });
  });

  it('gives nothing with every non-headquarters mission completed', () => {
    const d = personnel('Drenol', { integrity: '5', cunning: '3', strength: '3' });
    const table = tableOf(slotsOf([{ mission: mission('HQ', { mission: 'h' }), awayTeam: [d] }, { mission: mission('Done'), completed: true }]));
    expect(of(table, d)).toEqual({ integrity: 5, cunning: 3, strength: 3 });
  });
});

describe('Jadzia Dax Communications Staffer (#1667)', () => {
  const jadzia = () => personnel('Jadzia Dax Communications Staffer', { icons: '[stf][ds9]' });
  const pa = (stopped = false) => ({ ...personnel('Past', { icons: '[pa]' }), ...(stopped ? { stopped: true } : {}) });

  it('is attributes +1 while present with three [Pa] personnel, a stopped one counting', () => {
    const j = jadzia();
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [j, pa(), pa(), pa(true)] }]));
    expect(of(table, j)).toEqual(PLUS_ONE);
  });

  it('gives nothing with two [Pa] personnel present, or a third in another crew', () => {
    const j = jadzia();
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [j, pa(), pa()], ships: [ship('Ship', [pa()])] }]));
    expect(of(table, j)).toEqual(PRINTED);
  });
});

describe('Organia Secure Strategic Base (#1667)', () => {
  it('gives each [Pa] personnel at this mission attributes +1, aboard a ship there too', () => {
    const away = personnel('Away', { icons: '[pa]' });
    const aboard = personnel('Aboard', { icons: '[pa]' });
    const plain = personnel('Plain', { icons: '[stf]' });
    const elsewhere = personnel('Elsewhere', { icons: '[pa]' });
    const table = tableOf(
      slotsOf([
        { mission: mission('Organia Secure Strategic Base *VP'), awayTeam: [away, plain], ships: [ship('Ship', [aboard])] },
        { mission: mission('Other'), awayTeam: [elsewhere] },
      ])
    );
    expect(of(table, away)).toEqual(PLUS_ONE);
    expect(of(table, aboard)).toEqual(PLUS_ONE);
    expect(of(table, plain)).toEqual(PRINTED);
    expect(of(table, elsewhere)).toEqual(PRINTED);
  });
});

describe('William T. Riker Battleship First Officer (#1667)', () => {
  const riker = () => personnel('William T. Riker Battleship First Officer', { icons: '[cmd][tng][au]', cost: '4' });

  it('is attributes +2 while another [TNG] personnel with a cost of 4 or more is present', () => {
    const r = riker();
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [r, personnel('Captain', { icons: '[tng]', cost: '4' })] }]));
    expect(of(table, r)).toEqual({ integrity: 7, cunning: 8, strength: 6 });
  });

  it('gives nothing alone, or with a [TNG] personnel of cost 3', () => {
    const alone = riker();
    expect(of(tableOf(slotsOf([{ mission: mission('A'), awayTeam: [alone] }])), alone)).toEqual(PRINTED);
    const r = riker();
    const table = tableOf(slotsOf([{ mission: mission('A'), awayTeam: [r, personnel('Ensign', { icons: '[tng]', cost: '3' })] }]));
    expect(of(table, r)).toEqual(PRINTED);
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

describe('the registry of attribute models (#1667)', () => {
  const TITLES = [
    'Nador Curious Commander',
    'Computation Drone',
    "Queen's Borg Sphere Contingency Vessel",
    'Doran',
    'Benjamin Sisko Enlightened Supervisor',
    'Bridon',
    'Brennan Scott',
    'Drenol',
    'Jadzia Dax Communications Staffer',
    'Organia Secure Strategic Base',
    'William T. Riker Battleship First Officer',
  ];

  it.each(TITLES)('maps every version of %s in the card data to its model', (title) => {
    const rows = data.filter((row) => cardTitleOf(row.originalName) === title);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(attributeModelOf({ id: 'x', card: row, face: 'up' })?.title).toBe(title);
  });
});

describe('the dilemma bot counts each attribute clause once (#1667)', () => {
  const facts = { completedMissions: [], discardPile: [], coreEvents: 0, commanded: [], attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] };
  const registryPersonnel = data.filter((row) => row.type === 'personnel' && ATTRIBUTE_REGISTRY.has(cardTitleOf(row.originalName).toLowerCase()));

  it('gives no registry title an attribute change from its parsed gains', () => {
    expect(registryPersonnel.length).toBeGreaterThan(0);
    for (const row of registryPersonnel) {
      const bot = botPersonnelOf(row, undefined, facts);
      expect(bot.attrs).toEqual([Number(row.integrity) || 0, Number(row.cunning) || 0, Number(row.strength) || 0]);
      for (const gain of bot.partnerGains ?? []) expect(gain.attrs).toEqual([0, 0, 0]);
    }
  });

  it("keeps Jadzia Dax's skill and drops her attributes only while the table reads them", () => {
    const row = registryPersonnel.find((r) => r.originalName === 'Jadzia Dax Communications Staffer');
    expect(botPersonnelOf(row, undefined, { ...facts, attributeTitles: undefined }).partnerGains?.[0].attrs).toEqual([1, 1, 1]);
    const gain = botPersonnelOf(row, undefined, facts).partnerGains?.[0];
    expect(gain?.attrs).toEqual([0, 0, 0]);
    expect(gain?.skills.some((n) => n > 0)).toBe(true);
  });
});

import { costModelOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts, CostMission, CostShip } from '../../lib/costModels/model';
import { CostDestination, moveCharge } from '../../lib/playCost';
import { partnerTraitsOf, TraitsRow } from '../../lib/dilemmaBot/simulator';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState, MissionSlot } from '../../app/decks/practice/tableReducer';

// The cost models of the cards whose cost depends on where they are played (#1702), with invented
// personnel, ships and missions.

const person = (row: Partial<TraitsRow>): CommandedTraits => partnerTraitsOf({ name: 'an invented personnel', ...row });
const ship = (id: string, row: Partial<CostShip> = {}): CostShip => ({ id, title: 'Invented Ship', affiliation: '', icons: [], ...row });
const mission = (row: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name: 'An Invented Mission',
  requirements: '',
  points: 30,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  ...row,
});
const facts = (missions: CostMission[], core: string[] = []): CostFacts => ({
  commanded: missions.flatMap((m) => m.personnel ?? []),
  core,
  hand: [],
  missions,
});
const times = (n: number, p: CommandedTraits): CommandedTraits[] => Array.from({ length: n }, () => p);

const card = (name: string, cost: number, type = 'personnel', extra: Record<string, string> = {}) => ({
  name: name.toLowerCase(),
  originalName: name,
  type,
  cost: String(cost),
  ...extra,
});
const charge = (c: ReturnType<typeof card>, f: CostFacts, to: CostDestination, place: 'awayTeam' | 'crew' | 'shipRow' = 'crew') =>
  moveCharge('playAndDraw', 'hand', place, c, f, 'c0', to);

const TITLES = [
  'Ari',
  'Scimitar Reman Warbird',
  'U.S.S. Enterprise-E Flagship of the Federation',
  'Kamok',
  "Kar'meth",
  'Nirok',
  "M'tokra",
  'William T. Riker Surprised Witness',
  "Worf Governor of H'atoria",
  'Captain on the Bridge',
];

describe('the cost models of the place of a play (#1702)', () => {
  it('holds an ownCost model for each title, the (BP) Enterprise-E too', () => {
    for (const title of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('U.S.S. Enterprise-E Flagship of the Federation (BP)')?.title).toBe('U.S.S. Enterprise-E Flagship of the Federation');
  });

  it('charges Ari −1 with a Gul or Legate at this mission, and not at another', () => {
    const ari = card('Ari', 2);
    const gul = person({ keywords: 'Gul.' });
    const legate = person({ keywords: 'Legate.' });
    const f = facts([mission({ personnel: [gul] }), mission({ personnel: [legate] }), mission({ personnel: [person({ keywords: 'Dissident.' })] })]);
    expect(charge(ari, f, { missionIndex: 0 }, 'awayTeam')).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Ari', reason: 'a Gul or Legate at this mission' },
    });
    expect(charge(ari, f, { missionIndex: 1 }, 'awayTeam')?.cost).toBe(1);
    expect(charge(ari, f, { missionIndex: 2 }, 'awayTeam')).toEqual({ kind: 'play', cost: 2 });
    expect(charge(ari, f, {}, 'awayTeam')).toEqual({ kind: 'play', cost: 2 });
  });

  it('charges Scimitar −1 for each Reman at this mission', () => {
    const scimitar = card('Scimitar Reman Warbird', 6, 'ship');
    const reman = person({ species: 'Reman' });
    const f = (n: number) => facts([mission({ personnel: [...times(n, reman), person({ species: 'Human' })] }), mission({ personnel: times(3, reman) })]);
    expect(charge(scimitar, f(0), { missionIndex: 0 }, 'shipRow')).toEqual({ kind: 'play', cost: 6 });
    expect(charge(scimitar, f(1), { missionIndex: 0 }, 'shipRow')).toEqual({
      kind: 'play',
      cost: 5,
      source: { title: 'Scimitar', reason: '1 Reman at this mission' },
    });
    expect(charge(scimitar, f(3), { missionIndex: 0 }, 'shipRow')).toMatchObject({ source: { reason: '3 Remans at this mission' } });
    expect(charge(scimitar, f(3), { missionIndex: 0 }, 'shipRow')?.cost).toBe(3);
  });

  it('charges the Enterprise-E −1 for each [TNG] Leadership personnel at this mission', () => {
    const enterprise = card('U.S.S. Enterprise-E Flagship of the Federation (BP)', 5, 'ship');
    const leader = person({ icons: '[TNG]', skills: 'Leadership' });
    const f = (n: number) =>
      facts([mission({ personnel: [...times(n, leader), person({ skills: 'Leadership' }), person({ icons: '[TNG]', skills: 'Science' })] }), mission({ personnel: [leader] })]);
    expect(charge(enterprise, f(0), { missionIndex: 0 }, 'shipRow')).toEqual({ kind: 'play', cost: 5 });
    expect(charge(enterprise, f(1), { missionIndex: 0 }, 'shipRow')).toEqual({
      kind: 'play',
      cost: 4,
      source: { title: 'U.S.S. Enterprise-E', reason: '1 [TNG] Leadership personnel at this mission' },
    });
    expect(charge(enterprise, f(3), { missionIndex: 0 }, 'shipRow')?.cost).toBe(2);
  });

  it('charges Kamok and the others −1 aboard a [Kli] ship outside the Alpha Quadrant', () => {
    const kli = ship('s1', { affiliation: 'klingon' });
    const fed = ship('s2', { affiliation: 'federation' });
    const f = facts([mission({ quadrant: 'g', ships: [kli, fed] }), mission({ quadrant: 'a', ships: [ship('s3', { affiliation: 'klingon' })] }), mission({ quadrant: '' , ships: [ship('s4', { affiliation: 'klingon' })] })]);
    for (const title of ['Kamok', "Kar'meth", 'Nirok', "M'tokra"]) {
      const c = card(title, 2);
      expect(charge(c, f, { missionIndex: 0, shipId: 's1' })).toEqual({
        kind: 'play',
        cost: 1,
        source: { title, reason: 'aboard a [Kli] ship outside the Alpha Quadrant' },
      });
      expect(charge(c, f, { missionIndex: 0, shipId: 's2' })).toEqual({ kind: 'play', cost: 2 });
      expect(charge(c, f, { missionIndex: 1, shipId: 's3' })).toEqual({ kind: 'play', cost: 2 });
      expect(charge(c, f, { missionIndex: 2, shipId: 's4' })).toEqual({ kind: 'play', cost: 2 });
      expect(charge(c, f, { missionIndex: 0 }, 'awayTeam')).toEqual({ kind: 'play', cost: 2 });
    }
  });

  it('offers Riker −2 aboard U.S.S. Voyager, and nothing aboard another ship', () => {
    const riker = card('William T. Riker Surprised Witness', 3);
    const f = facts([
      mission({
        ships: [ship('s1', { title: 'U.S.S. Voyager Home Away From Home' }), ship('s2', { title: 'Delta Flyer Innovative Vessel' })],
      }),
    ]);
    expect(charge(riker, f, { missionIndex: 0, shipId: 's1' })).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'William T. Riker', reason: 'aboard U.S.S. Voyager', choice: { label: 'Choose an opponent: −2', cost: 1 } },
    });
    expect(charge(riker, f, { missionIndex: 0, shipId: 's2' })).toEqual({ kind: 'play', cost: 3 });
    expect(charge(riker, f, { missionIndex: 0 }, 'awayTeam')).toEqual({ kind: 'play', cost: 3 });
  });

  it('charges Worf +2 aboard a [TNG] ship, and his printed cost elsewhere', () => {
    const worf = card("Worf Governor of H'atoria", 3);
    const f = facts([mission({ ships: [ship('s1', { icons: ['[tng]'] }), ship('s2', { icons: ['[voy]'] })] })]);
    expect(charge(worf, f, { missionIndex: 0, shipId: 's1' })).toEqual({
      kind: 'play',
      cost: 5,
      source: { title: 'Worf', reason: 'aboard a [TNG] ship' },
    });
    expect(charge(worf, f, { missionIndex: 0, shipId: 's2' })).toEqual({ kind: 'play', cost: 3 });
    expect(charge(worf, f, { missionIndex: 0 }, 'awayTeam')).toEqual({ kind: 'play', cost: 3 });
  });

  it('charges a Commander −1 aboard his ship while Captain on the Bridge is in the core', () => {
    const commander = card('An Invented Commander', 4, 'personnel', { keywords: 'Admiral. Commander: uss Invented.' });
    const ships = [ship('s1', { title: 'U.S.S. Invented Prototype' }), ship('s2', { title: 'Another Ship' })];
    const withCaptain = facts([mission({ ships })], ['Captain on the Bridge']);
    expect(charge(commander, withCaptain, { missionIndex: 0, shipId: 's1' })).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Captain on the Bridge', reason: 'commands U.S.S. Invented Prototype' },
    });
    expect(charge(commander, withCaptain, { missionIndex: 0, shipId: 's2' })).toEqual({ kind: 'play', cost: 4 });
    expect(charge(commander, withCaptain, { missionIndex: 0 }, 'awayTeam')).toEqual({ kind: 'play', cost: 4 });
    expect(charge(commander, facts([mission({ ships })]), { missionIndex: 0, shipId: 's1' })).toEqual({ kind: 'play', cost: 4 });
  });

  it('charges the Commander of an E.C.S. ship −1 aboard it (#1724)', () => {
    const commander = card('An Invented Captain', 3, 'personnel', { keywords: 'Commander: E.C.S. Horizon. Dissident.' });
    const ships = [ship('s1', { title: 'E.C.S. Horizon' })];
    expect(charge(commander, facts([mission({ ships })], ['Captain on the Bridge']), { missionIndex: 0, shipId: 's1' })).toEqual({
      kind: 'play',
      cost: 2,
      source: { title: 'Captain on the Bridge', reason: 'commands E.C.S. Horizon' },
    });
  });

  it("stacks Captain on the Bridge with the card's own model and a pending discount", () => {
    const worfCommander = card("Worf Governor of H'atoria", 3, 'personnel', { keywords: 'Commander: Invented Bird.' });
    const f: CostFacts = {
      ...facts([mission({ ships: [ship('s1', { title: 'Invented Bird', icons: ['[tng]'] })] })], ['Captain on the Bridge']),
      pending: [{ title: 'Sarish Rez', label: 'next personnel', amount: 2, origin: { entry: 0 }, applies: () => true }],
    };
    expect(charge(worfCommander, f, { missionIndex: 0, shipId: 's1' })).toEqual({
      kind: 'play',
      cost: 2,
      source: {
        title: 'Worf, Captain on the Bridge',
        reason: 'Worf: aboard a [TNG] ship; Captain on the Bridge: commands Invented Bird, and Sarish Rez: −2 on the next personnel',
        discount: { entry: 0 },
      },
    });
  });
});

describe('costFactsOf by mission slot (#1702)', () => {
  const instance = (id: string, name: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
    id,
    card: { name: name.toLowerCase(), originalName: name, type, ...extra },
    face: 'up',
  });
  it('lists the personnel and the ships of each slot, never the brig', () => {
    const empty: MissionSlot = { mission: null, ships: [], awayTeam: [], underMission: [] };
    const missions: MissionSlot[] = initialTableState.missions.map(() => empty);
    missions[1] = {
      ...empty,
      awayTeam: [instance('p1', 'Away', 'personnel', { species: 'Reman' }), instance('e1', 'Gear', 'equipment')],
      ships: [{ ...instance('s1', 'Invented Bird *VP', 'ship', { affiliation: 'Klingon', icons: '[TNG]' }), crew: [instance('p2', 'Aboard', 'personnel')] }],
    };
    const f = costFactsOf({ ...initialTableState, missions, brig: [instance('b1', 'Captive', 'personnel')] });
    expect(f.missions?.[1].personnel?.map((p) => p.name)).toEqual(['away', 'aboard']);
    expect(f.missions?.[1].ships).toEqual([{ id: 's1', title: 'Invented Bird', affiliation: 'klingon', icons: ['[tng]'] }]);
    expect(f.missions?.[0].personnel).toEqual([]);
    expect(f.commanded.map((p) => p.name)).toEqual(['away', 'aboard']);
  });
});

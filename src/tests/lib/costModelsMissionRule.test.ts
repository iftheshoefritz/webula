import { costModelOf, missionCostsOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts, CostMission, CostTurnPlay } from '../../lib/costModels/model';
import { CostDestination, moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableState } from '../../app/decks/practice/tableReducer';

// The missions that price the play of another card (#1752), with invented cards.

const mission = (name: string, extra: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name,
  requirements: '',
  points: 35,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  ...extra,
});
const facts = (missions: CostMission[], extra: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], missions, ...extra });
const card = (type: string, cost: number, extra: Record<string, string> = {}) => ({
  name: 'an invented card',
  originalName: 'An Invented Card',
  type,
  cost: String(cost),
  unique: 'N',
  ...extra,
});
const charge = (c: ReturnType<typeof card>, f: CostFacts, to: 'core' | 'awayTeam' | 'shipRow' | 'on' = 'awayTeam', dest: CostDestination = { missionIndex: 0 }) =>
  moveCharge('playAndDraw', 'hand', to, c, f, 'c0', dest)!;
const played = (type: string, extra: Partial<CostTurnPlay> = {}): CostTurnPlay => ({ type, unique: false, icons: [], ...extra });
const person = (affiliation: string, stopped = false): CommandedTraits => ({
  name: 'someone',
  affiliation,
  species: [],
  keywords: [],
  icons: [],
  skills: [],
  stopped,
});

const TITLES = [
  'Braslota System Advanced Battle Simulation',
  'Levinius V Advanced Combat Training',
  'Duronom Deliver Prisoners',
  'Riese System Resolve Trade Dispute',
  'Devidia II Access Temporal Conduit',
  "B'hava'el Prevent Systemic Annihilation",
  'Deep Space Station K-7 Monitor Federation Commerce',
  'Kelsid II Establish Settlement',
  'Exo III Seek Lost Scientist',
  'Parliament Attend Diplomatic Conference',
  'Romulus Patient Stronghold',
  'Quatal Prime Quiet Mining Colony',
  'Saturn Continue Invasion',
  'Cardassia Prime Bastion of Resistance',
];

describe('the missions that price a play (#1752)', () => {
  it('holds a missionRule model for each title, a (MAH) version too', () => {
    for (const title of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'missionRule' });
    expect(costModelOf('Romulus Patient Stronghold (MAH)')?.title).toBe('Romulus Patient Stronghold');
  });

  describe('a keyword event, while the mission is complete', () => {
    const cases: [string, string, string][] = [
      ['Braslota System Advanced Battle Simulation', 'Braslota System', 'Maneuver.'],
      ['Levinius V Advanced Combat Training', 'Levinius V', 'Assault.'],
      ['Duronom Deliver Prisoners', 'Duronom', 'Capture.'],
      ['Duronom Deliver Prisoners', 'Duronom', 'Punishment.'],
      ['Riese System Resolve Trade Dispute', 'Riese System', 'Commodity.'],
      ['Devidia II Access Temporal Conduit', 'Devidia II', 'Temporal.'],
      ["B'hava'el Prevent Systemic Annihilation", "B'hava'el", 'Paranoia.'],
    ];
    it.each(cases)('%s makes a %s event cost −1', (title, label, keywords) => {
      const done = facts([mission(title, { completed: true })]);
      expect(charge(card('event', 3, { keywords }), done, 'core', {})).toEqual({
        kind: 'play',
        cost: 2,
        source: { title: label, reason: expect.stringContaining('mission completed') },
      });
      // Not complete, another keyword, another type: no change.
      expect(charge(card('event', 3, { keywords }), facts([mission(title)]), 'core', {})).toEqual({ kind: 'play', cost: 3 });
      expect(charge(card('event', 3, { keywords: 'Treaty.' }), done, 'core', {})).toEqual({ kind: 'play', cost: 3 });
      expect(charge(card('interrupt', 3, { keywords }), done, 'core', {})).toEqual({ kind: 'play', cost: 3 });
    });

    it('never goes below 0, and stacks with a core rule', () => {
      const done = facts([mission('Devidia II Access Temporal Conduit', { completed: true })]);
      expect(charge(card('event', 0, { keywords: 'Temporal.' }), done, 'core', {}).cost).toBe(0);
      const both = { ...done, core: ['Spiteful Strategy'] };
      expect(charge(card('event', 3, { keywords: 'Temporal.' }), both, 'core', {})).toEqual(
        expect.objectContaining({ cost: 3, source: expect.objectContaining({ title: 'Spiteful Strategy, Devidia II' }) })
      );
    });

    it('asks a title once, though two slots hold it', () => {
      const m = mission('Riese System Resolve Trade Dispute', { completed: true });
      expect(missionCostsOf({ type: 'event', printed: 3, keywords: ['commodity'] }, facts([m, m]))).toHaveLength(1);
    });
  });

  it('Deep Space Station K-7 makes an Infiltrator personnel cost −1 while complete', () => {
    const title = 'Deep Space Station K-7 Monitor Federation Commerce';
    const spy = card('personnel', 3, { keywords: 'Infiltrator.' });
    expect(charge(spy, facts([mission(title, { completed: true })])).cost).toBe(2);
    expect(charge(spy, facts([mission(title)])).cost).toBe(3);
    expect(charge(card('personnel', 3), facts([mission(title, { completed: true })])).cost).toBe(3);
  });

  describe('Kelsid II', () => {
    const kelsid = mission('Kelsid II Establish Settlement', { completed: true, quadrant: 'd' });
    const alpha = mission('An Invented Mission', { quadrant: 'a' });

    it('makes the first personnel of the turn played at a [DQ] mission cost −1', () => {
      expect(charge(card('personnel', 3), facts([kelsid, alpha]))).toEqual({
        kind: 'play',
        cost: 2,
        source: { title: 'Kelsid II', reason: 'first personnel at a [DQ] mission this turn' },
      });
      expect(charge(card('personnel', 3), facts([kelsid, alpha]), 'awayTeam', { missionIndex: 1 }).cost).toBe(3);
      expect(charge(card('personnel', 3), facts([{ ...kelsid, completed: false }, alpha])).cost).toBe(3);
    });

    it('gives nothing after a personnel landed at a [DQ] mission this turn, and an old play does not block it', () => {
      expect(charge(card('personnel', 3), facts([kelsid], { plays: [played('personnel', { quadrant: 'd' })] })).cost).toBe(3);
      expect(charge(card('personnel', 3), facts([kelsid], { plays: [played('personnel', { quadrant: 'a' }), played('personnel')] })).cost).toBe(2);
    });
  });

  describe('Exo III', () => {
    const exo = mission('Exo III Seek Lost Scientist', { completed: true });
    const android = card('personnel', 4, { species: 'Android' });

    it('makes the first Android of the turn cost 1', () => {
      expect(charge(android, facts([exo]))).toEqual({ kind: 'play', cost: 1, source: { title: 'Exo III', reason: 'first Android this turn' } });
      expect(charge(android, facts([exo], { plays: [played('personnel', { species: ['android'] })] })).cost).toBe(4);
      expect(charge(android, facts([{ ...exo, completed: false }])).cost).toBe(4);
      expect(charge(card('personnel', 4, { species: 'Human' }), facts([exo])).cost).toBe(4);
    });
  });

  describe('Parliament', () => {
    const parliament = (personnel: CommandedTraits[]) => mission('Parliament Attend Diplomatic Conference', { personnel });
    const diplomat = card('personnel', 3, { skills: '2 Diplomacy Honor' });
    const three = [person('Federation'), person('Klingon'), person('Romulan')];

    it('makes the first Diplomacy personnel cost −2 while three affiliations stand on the planet', () => {
      expect(charge(diplomat, facts([parliament(three)]), 'awayTeam', { missionIndex: 3 })).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: 'Parliament', reason: 'first Diplomacy personnel this turn, 3 affiliations at Parliament' },
      });
      expect(charge(card('personnel', 3, { skills: 'Honor' }), facts([parliament(three)])).cost).toBe(3);
      expect(charge(diplomat, facts([parliament(three)], { plays: [played('personnel', { skills: ['diplomacy'] })] })).cost).toBe(3);
    });

    it('needs three different affiliations among the unstopped personnel', () => {
      expect(charge(diplomat, facts([parliament([person('Federation'), person('Federation'), person('Klingon')])])).cost).toBe(3);
      expect(charge(diplomat, facts([parliament([person('Federation'), person('Klingon'), person('Romulan', true)])])).cost).toBe(3);
    });
  });

  it("Romulus Patient Stronghold makes a D'deridex-class ship cost −1", () => {
    const romulus = facts([mission('Romulus Patient Stronghold', { type: 'h' })]);
    expect(charge(card('ship', 6, { class: "D'Deridex Class" }), romulus, 'shipRow')).toEqual({
      kind: 'play',
      cost: 5,
      source: { title: 'Romulus', reason: "D'deridex-class ship" },
    });
    expect(charge(card('ship', 6, { class: 'D’deridex Class' }), romulus, 'shipRow').cost).toBe(5);
    expect(charge(card('ship', 6, { class: 'Warbird' }), romulus, 'shipRow').cost).toBe(6);
  });

  describe('Quatal Prime', () => {
    const dmz = (name: string) => mission(name, { regions: ['demilitarized zone'] });
    const quatal = dmz('Quatal Prime Quiet Mining Colony');

    it('makes an event placed on a mission card cost −1 while every mission is in the Demilitarized Zone', () => {
      expect(charge(card('event', 2), facts([quatal, dmz('Another Invented Mission')]), 'on', { onMissionIndex: 1 })).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: 'Quatal Prime', reason: 'event on a mission, every mission in the Demilitarized Zone' },
      });
      expect(charge(card('event', 2), facts([quatal, mission('Outside')]), 'on', { onMissionIndex: 0 }).cost).toBe(2);
      expect(charge(card('event', 2), facts([quatal]), 'core', {}).cost).toBe(2);
    });
  });

  it('Saturn makes Population 9 Billion - All Borg cost 1 while complete', () => {
    const borg = { ...card('event', 5), name: 'population 9 billion - all borg *', originalName: 'Population 9 Billion - All Borg *' };
    expect(charge(borg, facts([mission('Saturn Continue Invasion', { completed: true })]), 'core', {})).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Saturn', reason: 'mission completed' },
    });
    expect(charge(borg, facts([mission('Saturn Continue Invasion')]), 'core', {}).cost).toBe(5);
  });

  it('Cardassia Prime Bastion of Resistance, flipped, makes a [Car] or [NA] Dissident played there cost +1', () => {
    const bastion = (flipped: boolean) => facts([mission('Cardassia Prime Bastion of Resistance', { type: 'h', flipped })]);
    const dissident = (affiliation: string) => card('personnel', 2, { keywords: 'Dissident.', affiliation });
    expect(charge(dissident('Cardassian'), bastion(true))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Cardassia Prime', reason: 'Dissident played at Cardassia Prime' },
    });
    expect(charge(dissident('Non-Aligned'), bastion(true)).cost).toBe(3);
    expect(charge(dissident('Bajoran'), bastion(true)).cost).toBe(2);
    expect(charge(dissident('Cardassian'), bastion(false)).cost).toBe(2);
    expect(charge(dissident('Cardassian'), bastion(true), 'awayTeam', { missionIndex: 1 }).cost).toBe(2);
  });
});

describe('Vidiia Locus of Infection (#1750)', () => {
  const vidiia = mission('Vidiia Locus of Infection', { type: 'h' });
  const vid = card('personnel', 3, { affiliation: 'Vidiian' });
  const commanding = (n: number): CommandedTraits[] => Array.from({ length: n }, () => person('vidiian'));

  it('makes the first [Vid] personnel of the turn cost −2 while the player commands fewer than seven', () => {
    expect(charge(vid, facts([vidiia], { commanded: commanding(6) }))).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Vidiia', reason: 'first [Vid] personnel this turn, 6 personnel commanded' },
    });
    expect(charge(card('personnel', 1, { affiliation: 'Vidiian' }), facts([vidiia])).cost).toBe(0);
  });

  it('gives nothing at seven or more, without Vidiia, to another affiliation, or after a [Vid] personnel this turn', () => {
    expect(charge(vid, facts([vidiia], { commanded: commanding(7) })).cost).toBe(3);
    expect(charge(vid, facts([mission('Another Invented Mission')])).cost).toBe(3);
    expect(charge(card('personnel', 3, { affiliation: 'Klingon' }), facts([vidiia])).cost).toBe(3);
    expect(charge(vid, facts([vidiia], { plays: [played('personnel', { affiliation: 'vidiian' })] })).cost).toBe(3);
    // Another affiliation's play, or one recorded before #1750 with no affiliation, does not use it up.
    expect(charge(vid, facts([vidiia], { plays: [played('personnel', { affiliation: 'klingon' }), played('personnel')] })).cost).toBe(1);
  });

  it('counts the unstopped personnel of the away teams and crews before the play, never the brig', () => {
    const personnel = (n: number, stopped = false): CardInstance[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `p${stopped ? 's' : ''}${i}`,
        card: { name: 'an invented personnel', originalName: 'An Invented Personnel', type: 'personnel', affiliation: 'Vidiian' },
        face: 'up',
        stopped,
      }) as CardInstance);
    const table = (awayTeam: CardInstance[], brig: CardInstance[] = []): TableState => ({
      ...initialTableState,
      brig,
      missions: Array.from({ length: MISSION_SLOTS }, (_, i): MissionSlot => ({
        mission:
          i === 0
            ? ({ id: 'm0', card: { name: 'vidiia locus of infection', originalName: 'Vidiia Locus of Infection', type: 'mission', missiontype: 'H' }, face: 'up' } as CardInstance)
            : null,
        ships: [],
        awayTeam: i === 0 ? awayTeam : [],
        underMission: [],
      })),
    });
    // 8 personnel, 2 of them stopped: 6 for the test.
    expect(charge(vid, costFactsOf(table([...personnel(6), ...personnel(2, true)])))).toMatchObject({ cost: 1 });
    expect(charge(vid, costFactsOf(table(personnel(7)))).cost).toBe(3);
    expect(charge(vid, costFactsOf(table(personnel(6), personnel(5)))).cost).toBe(1);
  });
});

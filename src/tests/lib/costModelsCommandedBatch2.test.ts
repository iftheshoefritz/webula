import { costModelOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts, CostMission } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf, TraitsRow } from '../../lib/dilemmaBot/simulator';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot } from '../../app/decks/practice/tableReducer';

// Batch 2 of the cards that cost less while the player commands certain cards (#1749), with invented
// personnel and events.

const person = (row: Partial<TraitsRow>): CommandedTraits => partnerTraitsOf({ name: 'an invented personnel', ...row });
const facts = (commanded: CommandedTraits[], extra: Partial<CostFacts> = {}): CostFacts => ({ commanded, core: [], hand: [], ...extra });
const event = (...keywords: string[]) => ({ title: 'An Invented Event', keywords });
const play = (name: string, cost: number, type = 'personnel') => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });
const charge = (name: string, cost: number, f: CostFacts, type = 'personnel') => moveCharge('playAndDraw', 'hand', 'awayTeam', play(name, cost, type), f)!;
const mission = (regions: string[] = [], extra: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name: 'An Invented Mission',
  requirements: '',
  points: 30,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  regions,
  ...extra,
});

const TITLES = [
  'Bareil Antos Petty Thief',
  'Deyos Ruthless Administrator',
  'Gint The First Grand Nagus',
  'Grilka Glorious Lady',
  'Gowron Celebrated Leader',
  'Hogan',
  'Tasha Yar Requesting a Transfer',
  'Jorem',
  'Mullen',
  'Nerot',
  "Subek'somac Alpha Attack Ship",
  'Tristan Adams Deranged Psychiatrist',
];

describe('the cards cheaper while you command certain cards, batch 2 (#1749)', () => {
  it('holds an ownCost model for each title, a *VP version too', () => {
    for (const title of TITLES) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Gint The First Grand Nagus *VP')?.title).toBe('Gint The First Grand Nagus');
  });

  it.each([
    ['Bareil Antos Petty Thief', 4, { skills: 'Anthropology' }, 2, 'Bareil Antos', 'you command an Anthropology personnel'],
    ['Deyos Ruthless Administrator', 4, { species: 'Vorta' }, 3, 'Deyos', 'you command a Vorta'],
    ['Gint The First Grand Nagus', 6, { skills: 'Acquisition' }, 3, 'Gint', 'you command an Acquisition personnel'],
    ['Grilka Glorious Lady', 4, { skills: '2 Honor' }, 3, 'Grilka', 'you command an Honor personnel'],
  ] as const)('%s costs less while you command the personnel', (title, cost, row, reduced, label, reason) => {
    expect(charge(title, cost, facts([person(row)]))).toEqual({ kind: 'play', cost: reduced, source: { title: label, reason } });
    expect(charge(title, cost, facts([person({ skills: 'Navigation' })]))).toEqual({ kind: 'play', cost });
  });

  it('a stopped personnel meets no condition: it is not in the commanded facts', () => {
    const vorta = { id: 'v1', card: { name: 'a vorta', originalName: 'A Vorta', type: 'personnel', species: 'Vorta' }, face: 'up' } as CardInstance;
    const table = (stopped: boolean) => ({
      ...initialTableState,
      missions: Array.from({ length: MISSION_SLOTS }, (_, i): MissionSlot => ({
        mission: null,
        ships: [],
        awayTeam: i === 0 ? [{ ...vorta, stopped }] : [],
        underMission: [],
      })),
    });
    expect(charge('Deyos Ruthless Administrator', 4, costFactsOf(table(true))).cost).toBe(4);
    expect(charge('Deyos Ruthless Administrator', 4, costFactsOf(table(false))).cost).toBe(3);
  });

  it('Subek\'somac costs −1 for each Alpha Jem\'Hadar', () => {
    const alpha = person({ keywords: 'Alpha.', species: "Jem'Hadar" });
    const gamma = person({ keywords: 'Gamma.', species: "Jem'Hadar" });
    expect(charge("Subek'somac Alpha Attack Ship", 7, facts([alpha, alpha, gamma]), 'ship')).toEqual({
      kind: 'play',
      cost: 5,
      source: { title: "Subek'somac", reason: "you command 2 Alpha Jem'Hadar" },
    });
    expect(charge("Subek'somac Alpha Attack Ship", 7, facts([gamma]), 'ship').cost).toBe(7);
  });

  it('Gowron costs −1 with three events, and the keyword counts never go below 0', () => {
    expect(charge('Gowron Celebrated Leader', 4, facts([], { events: [event(), event('assault'), event()] }))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Gowron', reason: 'you command 3 events' },
    });
    expect(charge('Gowron Celebrated Leader', 4, facts([], { events: [event(), event()] })).cost).toBe(4);
    const three = facts([], { events: [event('assault'), event('assault', 'maneuver'), event('assault')] });
    expect(charge('Jorem', 2, three)).toEqual({ kind: 'play', cost: 0, source: { title: 'Jorem', reason: 'you command 3 Assault events' } });
    expect(charge('Mullen', 2, three)).toEqual({ kind: 'play', cost: 1, source: { title: 'Mullen', reason: 'you command 1 Maneuver event' } });
    expect(charge('Nerot', 2, three)).toEqual({ kind: 'play', cost: 2 });
  });

  it('Tasha Yar costs −1 with a [Pa] personnel or a [Pa] ship', () => {
    expect(charge('Tasha Yar Requesting a Transfer', 4, facts([person({ icons: '[Pa][TNG]' })])).cost).toBe(3);
    const ship = { id: 's1', title: 'An Invented Ship', affiliation: 'federation', icons: ['[pa]'] };
    expect(charge('Tasha Yar Requesting a Transfer', 4, facts([], { missions: [mission([], { ships: [ship] })] })).cost).toBe(3);
    expect(charge('Tasha Yar Requesting a Transfer', 4, facts([person({ icons: '[TNG]' })])).cost).toBe(4);
  });

  it('Hogan costs −1 with three or more Demilitarized Zone missions', () => {
    const dmz = mission(['demilitarized zone']);
    expect(charge('Hogan', 2, facts([], { missions: [dmz, dmz, mission()] })).cost).toBe(2);
    expect(charge('Hogan', 2, facts([], { missions: [dmz, dmz, dmz] }))).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Hogan', reason: 'you command 3 Demilitarized Zone missions' },
    });
  });

  it('Tristan Adams costs −4, clamped, with a completed mission requiring Anthropology or Treachery', () => {
    const requiring = (completed: boolean) => mission([], { completed, requirements: 'treachery, cunning>30' });
    expect(charge('Tristan Adams Deranged Psychiatrist', 2, facts([], { missions: [requiring(true)] })).cost).toBe(0);
    expect(charge('Tristan Adams Deranged Psychiatrist', 2, facts([], { missions: [requiring(false)] })).cost).toBe(2);
  });

  it('lists the events in the core and on the mission cards and ships, and nothing of the brig, a core card or a dilemma', () => {
    const card = (id: string, type: string, keywords = '') =>
      ({ id, card: { name: id, originalName: id, type, keywords }, face: 'up' }) as CardInstance;
    const table = {
      ...initialTableState,
      core: [{ ...card('e1', 'event', 'Assault.'), placedOn: [card('e9', 'event')] }],
      brig: [card('e8', 'event')],
      missions: Array.from({ length: MISSION_SLOTS }, (_, i): MissionSlot => ({
        mission: i === 0 ? { ...card('m0', 'mission'), placedOn: [card('e2', 'event', 'Maneuver. Assault. Assault.'), card('d1', 'dilemma')] } : null,
        ships: i === 0 ? [{ ...card('s1', 'ship'), placedOn: [card('e3', 'event')] }] : [],
        awayTeam: [],
        underMission: [],
      })),
    };
    const f = costFactsOf(table);
    expect(f.events).toEqual([
      { title: 'e1', keywords: ['assault'] },
      { title: 'e2', keywords: ['maneuver', 'assault'] },
      { title: 'e3', keywords: [] },
    ]);
    expect(charge('Gowron Celebrated Leader', 4, f).cost).toBe(3);
  });
});

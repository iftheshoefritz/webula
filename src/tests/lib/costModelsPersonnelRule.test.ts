import { costModelOf, personnelCostsOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostFacts, CostMission } from '../../lib/costModels/model';
import { CostDestination, moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState, MISSION_SLOTS, MissionSlot, TableState } from '../../app/decks/practice/tableReducer';

// The personnel that price the play of another card while they are on the table (#1756), with invented
// cards beside the title the model is for.

const ANTHWARA = 'Anthwara Leader of the Tribal Council';

const mission = (name: string, personnel: CommandedTraits[] = [], extra: Partial<CostMission> = {}): CostMission => ({
  completed: false,
  name,
  requirements: '',
  points: 35,
  type: 'p',
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
  personnel,
  ...extra,
});
const person = (title: string, stopped = false): CommandedTraits => ({
  name: title.toLowerCase(),
  title,
  affiliation: 'non-aligned',
  species: [],
  keywords: [],
  icons: [],
  skills: [],
  stopped,
});
const forTheCause = { title: 'For the Cause', keywords: [] };
const facts = (missions: CostMission[], extra: Partial<CostFacts> = {}): CostFacts => ({
  commanded: [],
  core: ['For the Cause'],
  hand: [],
  missions,
  events: [forTheCause],
  ...extra,
});
const event = (cost: number) => ({ name: 'an invented event', originalName: 'An Invented Event', type: 'event', cost: String(cost), unique: 'N' });
const charge = (c: ReturnType<typeof event>, f: CostFacts, to: 'core' | 'on' = 'on', dest: CostDestination = { onMissionIndex: 1 }) =>
  moveCharge('playAndDraw', 'hand', to, c, f, 'c0', dest)!;

const dmz = { regions: ['demilitarized zone'] };

describe('Anthwara (#1756)', () => {
  it('holds a personnelRule model', () => {
    expect(costModelOf(ANTHWARA)).toMatchObject({ title: ANTHWARA, family: 'personnelRule' });
  });

  it('makes an event placed on a mission card cost −1, with no button, the source naming Anthwara', () => {
    const f = facts([mission('Invented Mission A', [person(ANTHWARA)]), mission('Invented Mission B')]);
    expect(charge(event(3), f)).toEqual({
      kind: 'play',
      cost: 2,
      source: { title: 'Anthwara', reason: 'event on a mission, you command For the Cause' },
    });
  });

  it('makes it cost −2 on a Region: Demilitarized Zone mission', () => {
    const f = facts([mission('Invented Mission A', [person(ANTHWARA)]), mission('Invented Mission B', [], dmz)]);
    expect(charge(event(3), f)).toMatchObject({ cost: 1, source: { title: 'Anthwara' } });
  });

  it('never takes the cost below 0', () => {
    const f = facts([mission('Invented Mission A', [person(ANTHWARA)], dmz)]);
    expect(charge(event(1), f, 'on', { onMissionIndex: 0 }).cost).toBe(0);
  });

  it('gives nothing while stopped, absent, without For the Cause, or for an event not placed on a mission', () => {
    const missions = [mission('Invented Mission A', [person(ANTHWARA)]), mission('Invented Mission B')];
    expect(charge(event(3), facts([mission('Invented Mission A', [person(ANTHWARA, true)]), mission('Invented Mission B')])).cost).toBe(3);
    expect(charge(event(3), facts([mission('Invented Mission A', [person('Someone Else')]), mission('Invented Mission B')])).cost).toBe(3);
    expect(charge(event(3), facts(missions, { core: [], events: [] })).cost).toBe(3);
    expect(charge(event(3), facts(missions, { events: [{ title: 'Another Invented Event', keywords: [] }] })).cost).toBe(3);
    expect(charge(event(3), facts(missions), 'core', {}).cost).toBe(3);
  });

  it('asks a title once, whatever the copies', () => {
    const f = facts([mission('Invented Mission A', [person(ANTHWARA), person(ANTHWARA)]), mission('Invented Mission B', [person(ANTHWARA)])]);
    expect(personnelCostsOf({ type: 'event', printed: 3, onMissionIndex: 1 } as never, f)).toHaveLength(1);
    expect(charge(event(3), f).cost).toBe(2);
  });

  it('reads the table: an unstopped Anthwara in an away team or a crew, never the brig, and For the Cause on the table', () => {
    const anthwara = (id: string, stopped = false) =>
      ({ id, card: { name: 'anthwara leader of the tribal council', originalName: ANTHWARA, type: 'personnel', unique: 'Y' }, face: 'up', stopped }) as CardInstance;
    const cause = { id: 'ftc', card: { name: 'for the cause', originalName: 'For the Cause', type: 'event' }, face: 'up' } as CardInstance;
    const table = (awayTeam: CardInstance[], extra: Partial<TableState> = {}): TableState => ({
      ...initialTableState,
      core: [cause],
      missions: Array.from({ length: MISSION_SLOTS }, (_, i): MissionSlot => ({
        mission: {
          id: `m${i}`,
          card: { name: `invented mission ${i}`, originalName: `Invented Mission ${i}`, type: 'mission', missiontype: 'P', keywords: i === 1 ? 'Region: Demilitarized Zone.' : '' },
          face: 'up',
        } as CardInstance,
        ships: [],
        awayTeam: i === 0 ? awayTeam : [],
        underMission: [],
      })),
      ...extra,
    });
    expect(charge(event(3), costFactsOf(table([anthwara('a1')])), 'on', { onMissionIndex: 2 }).cost).toBe(2);
    expect(charge(event(3), costFactsOf(table([anthwara('a1')])), 'on', { onMissionIndex: 1 }).cost).toBe(1);
    expect(charge(event(3), costFactsOf(table([anthwara('a1', true)])), 'on', { onMissionIndex: 2 }).cost).toBe(3);
    expect(charge(event(3), costFactsOf(table([], { brig: [anthwara('a1')] })), 'on', { onMissionIndex: 2 }).cost).toBe(3);
    expect(charge(event(3), costFactsOf(table([anthwara('a1')], { core: [] })), 'on', { onMissionIndex: 2 }).cost).toBe(3);
  });
});

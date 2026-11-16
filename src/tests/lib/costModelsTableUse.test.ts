import { costModelOf, costUsesOf } from '../../lib/costModels/registry';
import type { CommandedTraits, CostFacts, CostMission, CostPlay } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';

// The cards on the table whose use changes a play's cost (#1713): Delivery Boy, Nathan Samuels, Guinan.

const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...overrides });

const coreCard = (id: string, title: string) => ({ id, title, type: 'event', keywords: [], cost: 0 });

const mission = (personnel: CommandedTraits[]): CostMission => ({
  completed: false,
  name: 'Earth',
  requirements: '',
  points: 0,
  type: 'h',
  icons: [],
  quadrant: 'alpha',
  dilemmasUnder: 0,
  personnel,
});

const personnel = (id: string, title: string, stopped = false): CommandedTraits => ({
  ...partnerTraitsOf({ name: title.toLowerCase(), affiliation: 'starfleet', species: 'Human' }),
  id,
  title,
  stopped,
});

const event = (keywords: string[]): CostPlay => ({ type: 'event', printed: 2, keywords });

describe('the models of the cards on the table that offer a use (#1713)', () => {
  it('has a model for each title, of the standing-rule family', () => {
    for (const name of ['Delivery Boy', 'Nathan Samuels Earth Minister', 'Guinan Battleship Bartender', 'Delivery Boy *VP']) {
      expect(costModelOf(name)?.family).toBe('standingRule');
    }
    expect(costModelOf('Guinan Listener')).toBeUndefined();
  });

  it('offers Delivery Boy in the core for a Q or a Temporal event, one use per copy', () => {
    const core = facts({ core: ['Delivery Boy', 'Delivery Boy'], coreCards: [coreCard('d1', 'Delivery Boy'), coreCard('d2', 'Delivery Boy')] });
    expect(costUsesOf(event(['temporal']), core)).toEqual([
      { id: 'd1', title: 'Delivery Boy', label: 'Destroy Delivery Boy: −3', amount: 3, effect: 'destroy' },
      { id: 'd2', title: 'Delivery Boy', label: 'Destroy Delivery Boy: −3', amount: 3, effect: 'destroy' },
    ]);
    expect(costUsesOf(event(['q']), core)).toHaveLength(2);
    expect(costUsesOf(event(['treaty']), core)).toEqual([]);
    expect(costUsesOf({ type: 'personnel', printed: 2, keywords: ['temporal'] }, core)).toEqual([]);
    expect(costUsesOf(event(['temporal']), facts())).toEqual([]);
    // The card being played never serves itself.
    expect(costUsesOf({ ...event(['temporal']), id: 'd1' }, core).map((u) => u.id)).toEqual(['d2']);
  });

  const play = (missionIndex: number | undefined, overrides: Partial<CostPlay> = {}): CostPlay => ({
    type: 'personnel',
    printed: 3,
    affiliation: 'starfleet',
    species: ['vulcan'],
    icons: [],
    missionIndex,
    ...overrides,
  });

  it('offers Nathan Samuels for a non-Human [SF] personnel at his mission only, while he is unstopped', () => {
    const nathan = personnel('n1', 'Nathan Samuels Earth Minister');
    const at = (p: CommandedTraits) => facts({ missions: [mission([p]), mission([])] });
    expect(costUsesOf(play(0), at(nathan))).toEqual([
      { id: 'n1', title: 'Nathan Samuels', label: 'Stop Nathan Samuels: −2', amount: 2, effect: 'stop' },
    ]);
    expect(costUsesOf(play(1), at(nathan))).toEqual([]);
    expect(costUsesOf(play(undefined), at(nathan))).toEqual([]);
    expect(costUsesOf(play(0), at({ ...nathan, stopped: true }))).toEqual([]);
    expect(costUsesOf(play(0, { species: ['human'] }), at(nathan))).toEqual([]);
    expect(costUsesOf(play(0, { affiliation: 'federation' }), at(nathan))).toEqual([]);
    expect(costUsesOf(play(0, { type: 'equipment' }), at(nathan))).toEqual([]);
  });

  it('offers Guinan for a card with both [AU] and [TNG] at her mission only', () => {
    const guinan = personnel('g1', 'Guinan Battleship Bartender');
    const table = facts({ missions: [mission([guinan]), mission([])] });
    const both = play(0, { type: 'equipment', icons: ['[tng]', '[au]'] });
    expect(costUsesOf(both, table)).toEqual([{ id: 'g1', title: 'Guinan', label: 'Stop Guinan: −2', amount: 2, effect: 'stop' }]);
    expect(costUsesOf({ ...both, missionIndex: 1 }, table)).toEqual([]);
    expect(costUsesOf({ ...both, icons: ['[au]'] }, table)).toEqual([]);
    expect(costUsesOf({ ...both, icons: ['[tng]'] }, table)).toEqual([]);
  });

  it('puts the uses on the charge of a play from the hand, and leaves its cost alone', () => {
    const machinations = { name: 'Machinations', originalName: 'Machinations', type: 'Event', cost: '2', keywords: 'Temporal.' };
    const core = facts({ core: ['Delivery Boy'], coreCards: [coreCard('d1', 'Delivery Boy')] });
    expect(moveCharge('playAndDraw', 'hand', 'core', machinations, core, 'c1')).toEqual({
      kind: 'play',
      cost: 2,
      uses: [{ id: 'd1', title: 'Delivery Boy', label: 'Destroy Delivery Boy: −3', amount: 3, effect: 'destroy' }],
    });
    expect(moveCharge('playAndDraw', 'discard', 'core', machinations, core, 'c1')).toBeNull();
    expect(moveCharge('orders', 'hand', 'core', machinations, core, 'c1')).toBeNull();
  });
});

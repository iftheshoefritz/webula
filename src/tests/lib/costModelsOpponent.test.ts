import { costModelOf } from '../../lib/costModels/registry';
import { countedCost, CostFacts, isCountedChoice } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';

// The cost models whose cost depends on the opponent, or on cards the table does not see (#1695), with
// invented facts. Each gives the printed cost and a choice, whatever the table holds.

const facts: CostFacts = { commanded: [], core: [], hand: [] };
const play = (name: string, type: string, cost: number) => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });
const charge = (name: string, type: string, cost: number) => moveCharge('playAndDraw', 'hand', 'core', play(name, type, cost), facts);

// Title, label, type, printed cost, step, the clamped max, and the count's label.
const COUNTED: [string, string, string, number, number, number, string][] = [
  ['Tacking Into the Wind', 'Tacking Into the Wind', 'event', 4, 2, 2, 'Completed missions of the opponent'],
  ['Alliance Galor', 'Alliance Galor', 'ship', 5, 1, 3, 'Humans discarded'],
  ['Rollins Trusted Subordinate', 'Rollins', 'personnel', 3, 1, 3, 'Cards the opponent drew'],
  ['Julian Bashir Rebel Captain', 'Julian Bashir', 'personnel', 6, 3, 2, 'Headquarters of the opponent'],
  ['Aaron Conor Born Leader', 'Aaron Conor', 'personnel', 3, 1, 3, 'Headquarters of the opponent'],
  ['Ptol', 'Ptol', 'personnel', 5, 1, 4, 'Dual dilemmas revealed'],
];

// Title, label, type, printed cost, the cost of the choice, and its label.
const SINGLE: [string, string, string, number, number, string][] = [
  ['Quark Vastly Outnumbered', 'Quark', 'personnel', 2, 0, 'Opponent commands a Maneuver event: −2'],
  ['Gollek', 'Gollek', 'personnel', 2, 1, 'Event in the opponent’s discard pile: −1'],
  ['Change of Venue', 'Change of Venue', 'event', 5, 1, 'Your score is lower: −4'],
];

describe('the cost models that depend on the opponent (#1695)', () => {
  it('holds an ownCost model for each title, the *VP copies too', () => {
    for (const [title] of [...COUNTED, ...SINGLE]) expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Tacking Into the Wind *VP')?.title).toBe('Tacking Into the Wind');
    expect(costModelOf('Julian Bashir Rebel Captain *VP')?.title).toBe('Julian Bashir Rebel Captain');
  });

  describe.each(COUNTED)('%s', (title, label, type, printed, step, max, what) => {
    it('charges the printed cost with a counted choice, its max clamped where the cost reaches 0', () => {
      const result = charge(title, type, printed);
      expect(result).toEqual({
        kind: 'play',
        cost: printed,
        source: { title: label, reason: expect.any(String), choice: { label: what, step, max, base: printed } },
      });
    });

    it('costs the printed cost at a count of 0, less a step for each count, never below 0', () => {
      const result = charge(title, type, printed);
      const choice = result?.kind === 'play' ? result.source?.choice : undefined;
      expect(isCountedChoice(choice)).toBe(true);
      if (!isCountedChoice(choice)) return;
      expect(countedCost(choice, 0)).toBe(printed);
      expect(countedCost(choice, 1)).toBe(Math.max(0, printed - step));
      expect(countedCost(choice, max)).toBe(Math.max(0, printed - step * max));
      // Each count up to the max lowers the cost.
      expect(countedCost(choice, max - 1)).toBeGreaterThan(0);
    });
  });

  describe.each(SINGLE)('%s', (title, label, type, printed, cost, what) => {
    it('charges the printed cost, with the choice of the lower cost', () => {
      expect(charge(title, type, printed)).toEqual({
        kind: 'play',
        cost: printed,
        source: { title: label, reason: expect.any(String), choice: { label: what, cost } },
      });
    });
  });

  it('floors a single choice at 0', () => {
    const result = charge('Change of Venue', 'event', 3);
    expect(result).toEqual(expect.objectContaining({ source: expect.objectContaining({ choice: { label: 'Your score is lower: −4', cost: 0 } }) }));
  });

  it('gives no choice for a counted model of printed cost 0 that a step could not lower', () => {
    expect(charge('Ptol', 'personnel', 0)).toEqual(
      expect.objectContaining({ cost: 0, source: expect.objectContaining({ choice: { label: 'Dual dilemmas revealed', step: 1, max: 0, base: 0 } }) })
    );
  });
});

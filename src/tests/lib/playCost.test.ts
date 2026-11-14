import { CostPlace, CostSegment, drawCharge, moveCharge, printedCost } from '../../lib/playCost';

const SEGMENTS: CostSegment[] = ['playAndDraw', 'orders', 'discard'];
const ship = { type: 'ship', cost: '3' };
const interrupt = { type: 'interrupt', cost: '0' };
const dilemma = { type: 'dilemma', cost: '2' };

describe('moveCharge (#1606)', () => {
  const plays: CostPlace[] = ['shipRow', 'crew', 'awayTeam', 'core', 'on'];
  const notPlays: CostPlace[] = ['brig', 'discard', 'drawDeck', 'dilemmaPile', 'missions', 'underMission', 'hand', 'dilemmaStack'];

  it.each(plays)('a card from the hand to %s is a play at its printed cost, in play and draw only', (to) => {
    expect(moveCharge('playAndDraw', 'hand', to, ship)).toEqual({ kind: 'play', cost: 3 });
    expect(moveCharge('orders', 'hand', to, ship)).toBeNull();
    expect(moveCharge('discard', 'hand', to, ship)).toBeNull();
  });

  it('an interrupt is a play at 0', () => {
    expect(moveCharge('playAndDraw', 'hand', 'core', interrupt)).toEqual({ kind: 'play', cost: 0 });
  });

  it('an empty or missing cost is 0', () => {
    expect(moveCharge('playAndDraw', 'hand', 'core', { type: 'event', cost: '' })).toEqual({ kind: 'play', cost: 0 });
    expect(printedCost(undefined)).toBe(0);
  });

  it.each(notPlays)('a card from the hand to %s costs nothing in any segment', (to) => {
    for (const segment of SEGMENTS) expect(moveCharge(segment, 'hand', to, ship)).toBeNull();
  });

  it.each<CostPlace>(['drawDeck', 'discard', 'shipRow', 'crew', 'awayTeam', 'core', 'on', 'brig', 'dilemmaPile'])(
    'a card from %s to the table costs nothing in any segment',
    (from) => {
      for (const segment of SEGMENTS) for (const to of plays) expect(moveCharge(segment, from, to, ship)).toBeNull();
    }
  );

  it('a dilemma costs nothing, from anywhere to anywhere', () => {
    for (const segment of SEGMENTS)
      for (const to of [...plays, ...notPlays]) {
        expect(moveCharge(segment, 'hand', to, dilemma)).toBeNull();
        expect(moveCharge(segment, 'dilemmaHand', to, dilemma)).toBeNull();
      }
  });
});

describe('drawCharge (#1606)', () => {
  it('a draw from the draw deck into the hand costs 1 in play and draw only', () => {
    expect(drawCharge('playAndDraw', 'drawDeck', 'hand')).toEqual({ kind: 'draw', cost: 1 });
    expect(drawCharge('orders', 'drawDeck', 'hand')).toBeNull();
    expect(drawCharge('discard', 'drawDeck', 'hand')).toBeNull();
  });

  it("the dilemma pile's draw costs nothing", () => {
    for (const segment of SEGMENTS) expect(drawCharge(segment, 'dilemmaPile', 'dilemmaHand')).toBeNull();
  });
});

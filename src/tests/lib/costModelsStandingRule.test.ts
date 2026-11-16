import { costModelOf } from '../../lib/costModels/registry';
import { CostFacts, CostTurnPlay } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';

// The standing rules of the core (#1703), with invented cards.

const facts = (core: string[], extra: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core, hand: [], ...extra });
const card = (type: string, cost: number, extra: Record<string, string> = {}) => ({
  name: 'an invented card',
  originalName: 'An Invented Card',
  type,
  cost: String(cost),
  ...extra,
});
const unique = (cost: number, icons = '[Cmd]') => card('personnel', cost, { unique: 'Y', icons });
const plain = (cost: number, icons = '[Cmd]') => card('personnel', cost, { unique: 'N', icons });
const played = (type: string, isUnique: boolean, icons: string[] = []): CostTurnPlay => ({ type, unique: isUnique, icons });
const charge = (c: ReturnType<typeof card>, f: CostFacts, to: 'core' | 'awayTeam' = 'awayTeam') =>
  moveCharge('playAndDraw', 'hand', to, c, f, 'c0', { missionIndex: 0 })!;

describe('the standing rules of the core (#1703)', () => {
  it('holds a standingRule model for each title, the *VP versions too', () => {
    for (const title of ['Disadvantage Into Advantage', 'Spiteful Strategy', 'Energize'])
      expect(costModelOf(title)).toMatchObject({ title, family: 'standingRule' });
    expect(costModelOf('Disadvantage Into Advantage *VP')?.title).toBe('Disadvantage Into Advantage');
    expect(costModelOf('Energize *VP')?.title).toBe('Energize');
  });

  describe('Disadvantage Into Advantage', () => {
    const core = ['Disadvantage Into Advantage'];

    it('makes the first unique personnel of the turn cost −2', () => {
      expect(charge(unique(3), facts(core))).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: 'Disadvantage Into Advantage', reason: 'first unique personnel this turn' },
      });
    });

    it('leaves a non-unique personnel, another card type, and a play with no rule in the core alone', () => {
      expect(charge(plain(3), facts(core))).toEqual({ kind: 'play', cost: 3 });
      expect(charge(card('event', 2, { unique: 'Y' }), facts(core), 'core')).toEqual({ kind: 'play', cost: 2 });
      expect(charge(unique(3), facts([]))).toEqual({ kind: 'play', cost: 3 });
    });

    it('gives nothing once a unique personnel was played this turn, and an earlier play of another kind does not block it', () => {
      expect(charge(unique(3), facts(core, { plays: [played('personnel', true)] }))).toEqual({ kind: 'play', cost: 3 });
      expect(charge(unique(3), facts(core, { plays: [played('personnel', false), played('event', true)] })).cost).toBe(1);
      // A play the log recorded no traits of passes no test.
      expect(charge(unique(3), facts(core, { plays: [played('', false)] })).cost).toBe(1);
    });

    it('takes −2 for each copy in the core, never below 0', () => {
      expect(charge(unique(5), facts([...core, ...core]))).toEqual(
        expect.objectContaining({ cost: 1, source: expect.objectContaining({ reason: 'first unique personnel this turn (2 copies)' }) })
      );
      expect(charge(unique(1), facts(core)).cost).toBe(0);
    });
  });

  describe('Spiteful Strategy', () => {
    it('makes every event cost +1, and leaves another type alone', () => {
      expect(charge(card('event', 2), facts(['Spiteful Strategy']), 'core')).toEqual({
        kind: 'play',
        cost: 3,
        source: { title: 'Spiteful Strategy', reason: '+1 on an event' },
      });
      expect(charge(card('event', 2), facts(['Spiteful Strategy'], { plays: [played('event', false)] }), 'core').cost).toBe(3);
      expect(charge(plain(2), facts(['Spiteful Strategy'])).cost).toBe(2);
      expect(charge(card('interrupt', 0), facts(['Spiteful Strategy']), 'core').cost).toBe(0);
    });

    it('does not raise its own play, and each copy adds +1', () => {
      const spiteful = { ...card('event', 0), name: 'spiteful strategy', originalName: 'Spiteful Strategy' };
      expect(charge(spiteful, facts([]), 'core')).toEqual({ kind: 'play', cost: 0 });
      expect(charge(spiteful, facts(['Spiteful Strategy']), 'core').cost).toBe(1);
      expect(charge(card('event', 2), facts(['Spiteful Strategy', 'Spiteful Strategy']), 'core').cost).toBe(4);
    });

    it('stacks with another rule and with a pending discount', () => {
      const both = facts(['Spiteful Strategy', 'Disadvantage Into Advantage']);
      expect(charge(card('event', 2), both, 'core').cost).toBe(3);
      const pending = [{ title: 'Invented', label: 'next event', amount: 2, origin: { entry: 0 }, applies: (p: { type: string }) => p.type === 'event' }];
      expect(charge(card('event', 2), facts(['Spiteful Strategy'], { pending }), 'core')).toEqual(
        expect.objectContaining({ cost: 1, source: expect.objectContaining({ title: 'Spiteful Strategy', discount: { entry: 0 } }) })
      );
    });
  });

  describe('Energize', () => {
    const withPlaced = (n: number, extra: Partial<CostFacts> = {}) => facts(['Spiteful Strategy', 'Energize'], { corePlaced: [0, n], ...extra });

    it('makes the first non-[TNG] personnel cost −2 for each card on it', () => {
      expect(charge(plain(3), withPlaced(0))).toEqual({ kind: 'play', cost: 3 });
      expect(charge(plain(3), withPlaced(1))).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: 'Energize', reason: 'first non-[TNG] personnel this turn, 1 card on it' },
      });
      expect(charge(plain(9), withPlaced(3))).toEqual(
        expect.objectContaining({ cost: 3, source: expect.objectContaining({ reason: 'first non-[TNG] personnel this turn, 3 cards on it' }) })
      );
      expect(charge(plain(3), withPlaced(3)).cost).toBe(0);
    });

    it('leaves a [TNG] personnel and a card of another type alone', () => {
      expect(charge(plain(3, '[Cmd][TNG]'), withPlaced(2)).cost).toBe(3);
      expect(charge(card('ship', 3), withPlaced(2), 'awayTeam').cost).toBe(3);
    });

    it('gives nothing once a non-[TNG] personnel was played this turn, even when Energize had no card then', () => {
      expect(charge(plain(3), withPlaced(2, { plays: [played('personnel', false, ['[cmd]'])] })).cost).toBe(3);
      expect(charge(plain(3), withPlaced(2, { plays: [played('personnel', true, ['[tng]']), played('ship', false)] })).cost).toBe(0);
    });
  });
});

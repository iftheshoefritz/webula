import { COST_REGISTRY, costModelOf, costRegistryOf, limitGrantsOf, pendingDiscountOf, pendingDiscountText } from '../../lib/costModels/registry';
import { CostFacts, CostModel } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';

const borg = partnerTraitsOf({ name: 'annexation drone', species: 'Borg', affiliation: 'borg' });
const human = partnerTraitsOf({ name: 'jadzia dax', species: 'Trill', affiliation: 'federation' });
const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...overrides });

const nanoprobes = { name: 'borg nanoprobes', originalName: 'Borg Nanoprobes', type: 'equipment', cost: '5' };
const goran = { name: 'goran', originalName: 'Goran', type: 'personnel', cost: '2' };
const tricorder = { id: 'c1', title: 'Tricorder', type: 'equipment' };

describe('the cost registry (#1654)', () => {
  it('holds one model per title, each with its family', () => {
    for (const [title, model] of COST_REGISTRY) {
      expect(model.title).toBe(title);
      expect(['ownCost', 'limit', 'pendingDiscount']).toContain(model.family);
    }
    expect([...COST_REGISTRY.keys()]).toEqual(expect.arrayContaining(['Borg Nanoprobes', 'Goran']));
  });

  it('throws on two models of one title', () => {
    const model: CostModel = { title: 'Goran', family: 'ownCost', playCost: () => null };
    expect(() => costRegistryOf([model, model])).toThrow('two models of "Goran"');
  });

  it('resolves a name with its version suffix through cardTitleOf', () => {
    expect(costModelOf('Borg Nanoprobes *VP')?.title).toBe('Borg Nanoprobes');
    expect(costModelOf('Goran (IDR)')?.title).toBe('Goran');
    expect(costModelOf('Tricorder')).toBeUndefined();
  });
});

describe('moveCharge with the facts of the cost models (#1654)', () => {
  it('charges Borg Nanoprobes 3 while the player commands a Borg, and 5 with no source without', () => {
    expect(moveCharge('playAndDraw', 'hand', 'crew', nanoprobes, facts({ commanded: [human, borg] }))).toEqual({
      kind: 'play',
      cost: 3,
      source: { title: 'Borg Nanoprobes', reason: 'you command a Borg' },
    });
    expect(moveCharge('playAndDraw', 'hand', 'crew', nanoprobes, facts({ commanded: [human] }))).toEqual({ kind: 'play', cost: 5 });
  });

  it('offers Goran his choice only while the hand holds another equipment or event', () => {
    const withTricorder = moveCharge('playAndDraw', 'hand', 'awayTeam', goran, facts({ hand: [tricorder] }), 'g1');
    expect(withTricorder).toEqual({
      kind: 'play',
      cost: 2,
      source: { title: 'Goran', reason: 'you may discard an equipment or event', choice: { label: 'Discard a card: −2', cost: 0 } },
    });
    const self = { id: 'g1', title: 'Goran', type: 'personnel' };
    const personnel = { id: 'c2', title: 'Data', type: 'personnel' };
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', goran, facts({ hand: [self, personnel] }), 'g1')).toEqual({ kind: 'play', cost: 2 });
    const event = { id: 'c3', title: 'Surprise Party', type: 'event' };
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', goran, facts({ hand: [self, event] }), 'g1')?.kind).toBe('play');
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', goran, facts({ hand: [self, event] }), 'g1')).toHaveProperty('source.choice');
  });

  it('charges a card with no model its printed cost, with no source', () => {
    const ship = { name: 'enterprise', originalName: 'Enterprise', type: 'ship', cost: '4' };
    expect(moveCharge('playAndDraw', 'hand', 'shipRow', ship, facts({ commanded: [borg] }))).toEqual({ kind: 'play', cost: 4 });
  });
});

describe('the limit models (#1655)', () => {
  it("grants Surprise Party's +1 only while it is in the core, once for any copies", () => {
    expect(limitGrantsOf(facts())).toEqual([]);
    expect(limitGrantsOf(facts({ core: ['Surprise Party', 'Surprise Party'] }))).toEqual([
      { title: 'Surprise Party', amount: 1, reason: 'in your core' },
    ]);
    expect(limitGrantsOf(facts({ hand: [{ id: 'e1', title: 'Surprise Party', type: 'event' }] }))).toEqual([]);
  });

  it('offers Tricia Jenkins her +5 at her printed cost', () => {
    const tricia = { name: 'tricia jenkins relaxed pilot', originalName: 'Tricia Jenkins Relaxed Pilot', type: 'personnel', cost: '2' };
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', tricia, facts())).toEqual({
      kind: 'play',
      cost: 2,
      source: { title: 'Tricia Jenkins', reason: 'you may spend 5 more counters this turn', choice: { label: 'Raise the limit: +5', limit: 5 } },
    });
  });
});

describe('the pending discount models (#1656)', () => {
  const origin = { entry: 0, move: 0, card: 0 };
  const jadzia = { name: 'jadzia dax', originalName: 'Jadzia Dax Problem Solver', type: 'personnel', cost: '3', affiliation: 'federation', icons: '[stf][ds9]' };

  it('makes the discount of Sarish Rez, with its text', () => {
    const discount = pendingDiscountOf('Sarish Rez Ministerial Adjutant', origin)!;
    expect(discount).toEqual(expect.objectContaining({ title: 'Sarish Rez', amount: 2, origin }));
    expect(pendingDiscountText(discount)).toBe('Sarish Rez: next [Fed][DS9] personnel \u22122');
    expect(pendingDiscountOf('Goran', origin)).toBeNull();
  });

  it('takes the discount off a [Fed][DS9] personnel only, never below 0', () => {
    const pending = [pendingDiscountOf('Sarish Rez Ministerial Adjutant', origin)!];
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', jadzia, facts({ pending }))).toEqual(
      expect.objectContaining({ cost: 1, source: expect.objectContaining({ title: 'Sarish Rez', discount: origin }) })
    );
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', { ...jadzia, cost: '1' }, facts({ pending }))?.cost).toBe(0);
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', { ...jadzia, icons: '[stf]' }, facts({ pending }))).toEqual({ kind: 'play', cost: 3 });
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', { ...jadzia, affiliation: 'bajoran' }, facts({ pending }))).toEqual({ kind: 'play', cost: 3 });
    expect(moveCharge('playAndDraw', 'hand', 'core', { ...jadzia, type: 'event' }, facts({ pending }))).toEqual({ kind: 'play', cost: 3 });
  });
});

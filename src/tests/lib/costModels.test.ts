import { COST_REGISTRY, costModelOf, costRegistryOf } from '../../lib/costModels/registry';
import { CostFacts, CostModel } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';

const borg = partnerTraitsOf({ name: 'annexation drone', species: 'Borg', affiliation: 'borg' });
const human = partnerTraitsOf({ name: 'jadzia dax', species: 'Trill', affiliation: 'federation' });
const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], downloaded: [], ...overrides });

const nanoprobes = { name: 'borg nanoprobes', originalName: 'Borg Nanoprobes', type: 'equipment', cost: '5' };
const goran = { name: 'goran', originalName: 'Goran', type: 'personnel', cost: '2' };
const tricorder = { id: 'c1', title: 'Tricorder', type: 'equipment' };

describe('the cost registry (#1654)', () => {
  it('holds one model per title, each with its family', () => {
    for (const [title, model] of COST_REGISTRY) {
      expect(model.title).toBe(title);
      expect(model.family).toBe('ownCost');
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

  it('charges a downloaded card 0, before its model', () => {
    expect(moveCharge('playAndDraw', 'hand', 'crew', nanoprobes, facts({ commanded: [borg], downloaded: ['Borg Nanoprobes'] }))).toEqual({
      kind: 'play',
      cost: 0,
      source: { title: 'Downloaded', reason: 'downloaded this turn' },
    });
  });

  it('charges a card with no model its printed cost, with no source', () => {
    const ship = { name: 'enterprise', originalName: 'Enterprise', type: 'ship', cost: '4' };
    expect(moveCharge('playAndDraw', 'hand', 'shipRow', ship, facts({ commanded: [borg] }))).toEqual({ kind: 'play', cost: 4 });
  });
});

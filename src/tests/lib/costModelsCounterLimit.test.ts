import { cappedLimit, costModelOf, limitCapsOf, limitGrantsOf, turnChoicesOf } from '../../lib/costModels/registry';
import { CommandedTraits, CostCoreCard, CostFacts, CostMission } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';

// The cards that change the turn's counter limit, batch 11 (#1704), with invented facts.

const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...overrides });
const personnel = (name: string, species = 'Human', unique = true, affiliation = 'federation'): CommandedTraits => ({
  ...partnerTraitsOf({ name, species, affiliation }),
  unique,
});
const mission = (name: string, type: string, quadrant: string): CostMission => ({
  completed: false,
  name,
  requirements: '',
  points: 30,
  type,
  icons: [],
  quadrant,
  dilemmasUnder: 0,
});
const empty = mission('', '', '');
const rule = (title: string, cost: number): CostCoreCard => ({ title, type: 'event', keywords: ['rule'], cost });
const printed = (title: string, cost: number, type = 'event') => ({ type, printed: cost, id: 'x1', title });

describe('the counter limit models, batch 11 (#1704)', () => {
  it.each([
    'Code of the Ushaan',
    'At What Cost?',
    'At What Cost? (IDR)',
    'At What Cost? (R2)',
    'At What Cost? *VP',
    'Gaila Arms Dealer',
    'Gaila Arms Dealer *VP',
    'Par Lenor Lascivious Emissary',
    'Par Lenor Lascivious Emissary *VP',
    'U.S.S. Defiant Repurposed Warship',
    'U.S.S. Defiant Repurposed Warship *VP',
    'Unimatrix Zero',
    'Unimatrix Zero *VP',
  ])('models %s in the limit family', (name) => {
    expect(costModelOf(name)?.family).toBe('limit');
  });

  it('caps the limit at 7 while Code of the Ushaan is in the core', () => {
    expect(limitCapsOf(facts({ core: ['Code of the Ushaan'] }))).toEqual([{ title: 'Code of the Ushaan', amount: 7, reason: 'in your core' }]);
    expect(limitCapsOf(facts({ hand: [{ id: 'u1', title: 'Code of the Ushaan', type: 'event' }] }))).toEqual([]);
    expect(cappedLimit(13, limitCapsOf(facts({ core: ['Code of the Ushaan'] })))).toBe(7);
    expect(cappedLimit(5, limitCapsOf(facts({ core: ['Code of the Ushaan'] })))).toBe(5);
    expect(cappedLimit(13, [])).toBe(13);
  });

  it('offers At What Cost? its +7 at its printed cost', () => {
    const model = costModelOf('At What Cost?')!;
    expect(model.playCost!(printed('At What Cost?', 0), facts())).toEqual({
      cost: 0,
      reason: 'you may lose 5 points to spend 7 more counters this turn',
      choice: { label: 'Raise the limit: +7', limit: 7 },
    });
  });

  it("offers U.S.S. Defiant's +5 only while every non-headquarters mission is a [GQ] mission", () => {
    const model = costModelOf('U.S.S. Defiant Repurposed Warship')!;
    const play = printed('U.S.S. Defiant Repurposed Warship', 7, 'ship');
    const gamma = facts({ missions: [mission('Home', 'h', 'a'), mission('Gamma One', 'p', 'g'), mission('Gamma Two', 's', 'g'), empty] });
    expect(model.playCost!(play, gamma)).toEqual({
      cost: 7,
      reason: 'each of your non-headquarters missions is a [GQ] mission',
      choice: { label: 'Raise the limit: +5', limit: 5 },
    });
    const alpha = facts({ missions: [mission('Gamma One', 'p', 'g'), mission('Alpha', 'p', 'a')] });
    expect(model.playCost!(play, alpha)).toBeNull();
    // With no non-headquarters mission the text holds.
    expect(model.playCost!(play, facts({ missions: [mission('Home', 'h', 'a')] }))).not.toBeNull();
  });

  it('makes Unimatrix Zero cost −1 per unique Borg commanded, each name once, and grants +1 in the core', () => {
    const model = costModelOf('Unimatrix Zero')!;
    const play = printed('Unimatrix Zero', 6);
    const borg = [personnel('seven of nine', 'Borg'), personnel('seven of nine', 'Borg'), personnel('hugh', 'Borg'), personnel('drone', 'Borg', false)];
    expect(model.playCost!(play, facts({ commanded: [...borg, personnel('data', 'Android')] }))).toEqual({
      cost: 4,
      reason: 'you command 2 unique Borg',
    });
    expect(model.playCost!(play, facts({ commanded: [personnel('drone', 'Borg', false)] }))).toBeNull();
    // The cost never goes below 0.
    const many = Array.from({ length: 8 }, (_, i) => personnel(`borg ${i}`, 'Borg'));
    const unimatrix = { name: 'unimatrix zero', originalName: 'Unimatrix Zero', type: 'event', cost: '6' };
    expect(moveCharge('playAndDraw', 'hand', 'core', unimatrix, facts({ commanded: many }))).toEqual(expect.objectContaining({ cost: 0 }));
    expect(limitGrantsOf(facts({ core: ['Unimatrix Zero', 'Unimatrix Zero'] }))).toEqual([
      { title: 'Unimatrix Zero', amount: 1, reason: 'in your core' },
    ]);
    expect(limitGrantsOf(facts())).toEqual([]);
  });

  it("offers Gaila's +4 while she is commanded and Ferenginar is a mission", () => {
    const gaila = personnel('gaila arms dealer', 'Ferengi');
    const ferenginar = mission('Ferenginar Financial Hub', 'h', 'a');
    expect(turnChoicesOf(facts({ commanded: [gaila], missions: [{ ...ferenginar, personnel: [gaila] }] }))).toEqual([
      { title: 'Gaila', label: 'Equipment from Ferenginar: +4', limit: 4 },
    ]);
    expect(turnChoicesOf(facts({ commanded: [gaila], missions: [{ ...mission('Earth', 'h', 'a'), personnel: [gaila] }] }))).toEqual([]);
    expect(turnChoicesOf(facts({ missions: [ferenginar] }))).toEqual([]);
  });

  it('offers Par Lenor one choice per Rule event of the core, at its cost, none at cost 0', () => {
    const parLenor = personnel('par lenor lascivious emissary', 'Ferengi');
    const coreCards = [rule('Rule of Acquisition #144', 3), rule('Rule of Acquisition #6', 0), { title: 'Surprise Party', type: 'event', keywords: [], cost: 2 }];
    expect(turnChoicesOf(facts({ commanded: [parLenor], coreCards, missions: [{ ...empty, personnel: [parLenor] }] }))).toEqual([
      { title: 'Par Lenor', label: 'Destroy Rule of Acquisition #144: +3', limit: 3 },
    ]);
    expect(turnChoicesOf(facts({ coreCards }))).toEqual([]);
  });
});

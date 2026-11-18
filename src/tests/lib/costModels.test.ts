import { COST_REGISTRY, costModelOf, costRegistryOf, limitGrantsOf, pendingDiscountOf, pendingDiscountText } from '../../lib/costModels/registry';
import { CostFacts, CostModel, differentAffiliations, isPersonnelChoice } from '../../lib/costModels/model';
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
      expect(['ownCost', 'limit', 'pendingDiscount', 'standingRule', 'missionRule']).toContain(model.family);
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

  it('offers Common Purpose its choice of personnel at its printed cost (#1712)', () => {
    expect(costModelOf('Common Purpose')?.family).toBe('limit');
    expect(costModelOf('Common Purpose *VP')?.family).toBe('limit');
    const purpose = { name: 'common purpose', originalName: 'Common Purpose', type: 'event', cost: '1' };
    expect(moveCharge('playAndDraw', 'hand', 'core', purpose, facts())).toEqual({
      kind: 'play',
      cost: 1,
      source: {
        title: 'Common Purpose',
        reason: 'stop personnel: +1 counter per affiliation',
        choice: { label: 'Stop personnel…', personnel: 'stopAffiliations' },
      },
    });
  });

  it('counts the different affiliations (#1712)', () => {
    expect(differentAffiliations(['Federation', 'Bajoran'])).toBe(2);
    expect(differentAffiliations(['Federation', 'Federation'])).toBe(1);
    expect(differentAffiliations(['Federation', 'Starfleet'])).toBe(2);
    expect(differentAffiliations([])).toBe(0);
    expect(isPersonnelChoice({ label: 'x', personnel: 'other' })).toBe(false);
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

describe('the next card of a kind is cheaper, batch 6 (#1699)', () => {
  const origin = { entry: 0, move: 0, card: 0 };
  const personnel = (extra: Record<string, string> = {}) => ({ name: 'invented', originalName: 'Invented', type: 'personnel', cost: '4', ...extra });
  const discount = (title: string) => pendingDiscountOf(title, origin)!;
  const applies = (title: string, card: Record<string, string>) => {
    const charge = moveCharge('playAndDraw', 'hand', card.type === 'event' ? 'core' : 'awayTeam', card, facts({ pending: [discount(title)] }));
    return charge?.kind === 'play' && charge.source?.discount === origin;
  };

  it.each([
    ['Icheb Second Officer', 'Icheb', 'next Temporal event', 2],
    ['Elizabeth Lense Valedictorian', 'Elizabeth Lense', 'next [Baj][DS9] personnel', 2],
    ['Shelley', 'Shelley', 'next [AU][TNG] or [Pa][TNG] personnel', 3],
    ['Data Proud Father', 'Data', 'next Android', 2],
    ['Leonard H. McCoy Experienced Advisor', 'McCoy', 'next [TOS] personnel', 3],
  ])('models %s as a pending discount', (title, label, text, amount) => {
    expect(costModelOf(title)?.family).toBe('pendingDiscount');
    expect(discount(title)).toEqual(expect.objectContaining({ title: label, label: text, amount, origin }));
  });

  it("gives Icheb's discount to a Temporal event only, read from the Keywords column", () => {
    const event = { name: 'invented', type: 'event', cost: '3', keywords: 'Temporal. Treaty.' };
    expect(moveCharge('playAndDraw', 'hand', 'core', event, facts({ pending: [discount('Icheb Second Officer')] }))).toEqual(
      expect.objectContaining({ cost: 1, source: expect.objectContaining({ title: 'Icheb', discount: origin }) })
    );
    expect(applies('Icheb Second Officer', { ...event, type: 'interrupt' })).toBe(false);
    expect(applies('Icheb Second Officer', { ...event, keywords: 'Treaty.' })).toBe(false);
  });

  it("gives Elizabeth Lense's discount to a [Baj][DS9] personnel only", () => {
    expect(applies('Elizabeth Lense Valedictorian', personnel({ affiliation: 'Bajoran', icons: '[Stf][DS9]' }))).toBe(true);
    expect(applies('Elizabeth Lense Valedictorian', personnel({ affiliation: 'Bajoran', icons: '[Stf][TNG]' }))).toBe(false);
    expect(applies('Elizabeth Lense Valedictorian', personnel({ affiliation: 'Federation', icons: '[Stf][DS9]' }))).toBe(false);
  });

  it("gives Shelley's discount to an [AU][TNG] or a [Pa][TNG] personnel only", () => {
    expect(applies('Shelley', personnel({ icons: '[Stf][TNG][AU]' }))).toBe(true);
    expect(applies('Shelley', personnel({ icons: '[Cmd][TNG][Pa]' }))).toBe(true);
    expect(applies('Shelley', personnel({ icons: '[Stf][AU]' }))).toBe(false);
    expect(applies('Shelley', personnel({ icons: '[Stf][TNG]' }))).toBe(false);
  });

  it("gives Data's discount to an Android, read from the Species column", () => {
    expect(applies('Data Proud Father', personnel({ species: 'Android/Borg' }))).toBe(true);
    expect(applies('Data Proud Father', personnel({ species: 'Human' }))).toBe(false);
  });

  it("gives McCoy's discount to a [TOS] personnel only, and offers his −2 choice at his printed cost", () => {
    expect(applies('Leonard H. McCoy Experienced Advisor', personnel({ icons: '[Stf][TOS]' }))).toBe(true);
    expect(applies('Leonard H. McCoy Experienced Advisor', { name: 'invented', type: 'ship', cost: '4', icons: '[TOS]' })).toBe(false);
    const mccoy = { name: 'leonard h. mccoy', originalName: 'Leonard H. McCoy Experienced Advisor', type: 'personnel', cost: '4', icons: '[Stf][TOS][Pa]' };
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', mccoy, facts())).toEqual({
      kind: 'play',
      cost: 4,
      source: { title: 'McCoy', reason: 'you may ignore his next ability', choice: { label: 'Ignore his next ability: −2', cost: 2 } },
    });
  });

  it("stacks a pending discount onto a model's own cost and its choice, each never below 0", () => {
    const mccoy = { name: 'leonard h. mccoy', originalName: 'Leonard H. McCoy Experienced Advisor', type: 'personnel', cost: '4', icons: '[Stf][TOS][Pa]' };
    const pending = [discount('Leonard H. McCoy Experienced Advisor')];
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', mccoy, facts({ pending }))).toEqual({
      kind: 'play',
      cost: 1,
      source: {
        title: 'McCoy',
        reason: 'you may ignore his next ability, and McCoy: −3 on the next [TOS] personnel',
        choice: { label: 'Ignore his next ability: −2', cost: 0 },
        discount: origin,
      },
    });
    const sarish = [pendingDiscountOf('Sarish Rez Ministerial Adjutant', origin)!];
    const fedGoran = { ...goran, affiliation: 'federation', icons: '[stf][ds9]' };
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', fedGoran, facts({ hand: [tricorder], pending: sarish }), 'g1')).toEqual(
      expect.objectContaining({
        cost: 0,
        source: expect.objectContaining({ title: 'Goran', choice: { label: 'Discard a card: −2', cost: 0 }, discount: origin }),
      })
    );
    // A discount that does not apply leaves the model's answer alone.
    expect(moveCharge('playAndDraw', 'hand', 'awayTeam', goran, facts({ hand: [tricorder], pending: sarish }), 'g1')).not.toHaveProperty('source.discount');
  });
});

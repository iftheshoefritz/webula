import { costModelOf, limitGrantsOf } from '../../lib/costModels/registry';
import { CostFacts } from '../../lib/costModels/model';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { tableLimitGrants } from '../../app/decks/practice/gameLog';
import { CardInstance, initialTableState, MissionSlot, TableState } from '../../app/decks/practice/tableReducer';

// Gint, The First Grand Nagus (#1768): "While you command four cards that have a cost of four or more, you
// may spend an additional counter each turn." Gint is real; the other cards are invented.

const GINT = 'Gint The First Grand Nagus';
const grant = { title: 'Gint', amount: 1, reason: 'you command 4 cards of cost 4 or more' };

const facts = (overrides: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...overrides });
const gint = { ...partnerTraitsOf({ name: GINT.toLowerCase(), species: 'Ferengi', affiliation: 'ferengi' }), unique: true };

const instance = (id: string, name: string, cost: number, type = 'personnel', stopped = false): CardInstance => ({
  id,
  face: 'up',
  card: { name: name.toLowerCase(), originalName: name, type, cost: String(cost), affiliation: 'ferengi' },
  ...(stopped ? { stopped: true } : {}),
});
const gintCard = (stopped = false, name = GINT) => instance('g', name, 6, 'personnel', stopped);

const empty: MissionSlot = { mission: null, ships: [], awayTeam: [], underMission: [] };

/** A table with `awayTeam` at mission 0, `ship` with `crew` at mission 1, and `core` and `brig`. */
const tableOf = (
  awayTeam: CardInstance[],
  { crew = [], ship = 3, core = [], brig = [] }: { crew?: CardInstance[]; ship?: number; core?: CardInstance[]; brig?: CardInstance[] } = {}
): TableState => {
  const missions: MissionSlot[] = initialTableState.missions.map(() => empty);
  missions[0] = { ...empty, awayTeam };
  missions[1] = { ...empty, ships: [{ ...instance('s1', 'Invented Ship', ship, 'ship'), crew }] };
  return { ...initialTableState, missions, core, brig };
};

describe("Gint's counter grant (#1768)", () => {
  it.each([GINT, `${GINT} *VP`])('keeps %s one model, with its play cost and the grant', (name) => {
    const model = costModelOf(name)!;
    expect(model.label).toBe('Gint');
    expect(model.playCost).toBeDefined();
    expect(model.limitGrant).toBeDefined();
  });

  it('grants +1 while Gint is commanded and four commanded cards cost 4 or more, him counting', () => {
    expect(limitGrantsOf(facts({ commanded: [gint], commandedCosts: [6, 4, 5, 4] }))).toEqual([grant]);
    expect(limitGrantsOf(facts({ commanded: [gint], commandedCosts: [6, 4, 5, 3, 0] }))).toEqual([]);
    expect(limitGrantsOf(facts({ commandedCosts: [6, 4, 5, 4] }))).toEqual([]);
  });

  it('counts unstopped personnel, equipment, ships and the events of the core from the table', () => {
    const table = tableOf([gintCard(), instance('e', 'Invented Gadget', 4, 'equipment')], {
      ship: 5,
      core: [instance('c', 'Invented Event', 4, 'event')],
    });
    expect(costFactsOf(table).commandedCosts).toEqual([6, 4, 5, 4]);
    expect(tableLimitGrants(table)).toEqual([grant]);
  });

  it('grants for the *VP printing too', () => {
    const table = tableOf([gintCard(false, `${GINT} *VP`), instance('p', 'Invented Officer', 4)], { ship: 4, crew: [instance('q', 'Invented Pilot', 5)] });
    expect(tableLimitGrants(table)).toEqual([grant]);
  });

  it('grants nothing with three such cards, or with a cost-3 card as the fourth', () => {
    expect(tableLimitGrants(tableOf([gintCard(), instance('p', 'Invented Officer', 4)], { ship: 5 }))).toEqual([]);
    expect(tableLimitGrants(tableOf([gintCard(), instance('p', 'Invented Officer', 4), instance('q', 'Invented Ensign', 3)], { ship: 5 }))).toEqual([]);
  });

  it('grants nothing while Gint is stopped, in the brig or absent', () => {
    const others = [instance('p', 'Invented Officer', 4), instance('q', 'Invented Pilot', 5), instance('r', 'Invented Medic', 4)];
    expect(tableLimitGrants(tableOf([gintCard(), ...others]))).toEqual([grant]);
    expect(tableLimitGrants(tableOf([gintCard(true), ...others], { ship: 4 }))).toEqual([]);
    expect(tableLimitGrants(tableOf(others, { ship: 4, brig: [gintCard()] }))).toEqual([]);
    expect(tableLimitGrants(tableOf(others, { ship: 4 }))).toEqual([]);
  });

  it('leaves a stopped personnel and a card in the brig out of the four', () => {
    const base = [gintCard(), instance('p', 'Invented Officer', 4)];
    expect(tableLimitGrants(tableOf([...base, instance('s', 'Invented Sleeper', 6, 'personnel', true)], { ship: 5 }))).toEqual([]);
    expect(tableLimitGrants(tableOf(base, { ship: 5, brig: [instance('b', 'Invented Captive', 6)] }))).toEqual([]);
  });
});

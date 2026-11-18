import { turnChoicesOf } from '../../lib/costModels/registry';
import { CostDestination, moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState, MissionSlot, TableState } from '../../app/decks/practice/tableReducer';

// A stopped personnel is still commanded, but meets no "if you command", "while you command" or "for
// each … you command" condition (#1751). Invented personnel and missions, on a table of `costFactsOf`.

const card = (name: string, cost: number, type = 'personnel') => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });

const instance = (id: string, name: string, row: Record<string, string> = {}, stopped = false): CardInstance => ({
  id,
  face: 'up',
  card: { name: name.toLowerCase(), originalName: name, type: 'personnel', affiliation: 'federation', ...row },
  ...(stopped ? { stopped: true } : {}),
});
const missionCard = (name: string): CardInstance => ({ id: `m-${name}`, face: 'up', card: { name: name.toLowerCase(), originalName: name, type: 'mission' } });

const empty: MissionSlot = { mission: null, ships: [], awayTeam: [], underMission: [] };

/** A table with `awayTeam` at mission 0 and `crew` aboard a ship at mission 1, each slot's mission named. */
const tableOf = (awayTeam: CardInstance[], crew: CardInstance[] = [], names: [string, string] = ['An Invented Mission', 'Another Invented Mission']): TableState => {
  const missions: MissionSlot[] = initialTableState.missions.map(() => empty);
  missions[0] = { ...empty, mission: missionCard(names[0]), awayTeam };
  missions[1] = {
    ...empty,
    mission: missionCard(names[1]),
    ships: [{ id: 's1', face: 'up', card: { name: 'invented ship', originalName: 'Invented Ship', type: 'ship' }, crew }],
  };
  return { ...initialTableState, missions };
};

const costOf = (name: string, printed: number, table: TableState, type = 'personnel', to: CostDestination = {}) =>
  moveCharge('playAndDraw', 'hand', type === 'event' ? 'core' : 'awayTeam', card(name, printed, type), costFactsOf(table), 'c0', to)?.cost;

describe('costFactsOf leaves stopped personnel out of commanded (#1751)', () => {
  it('lists only the unstopped personnel of the away teams and crews, never the brig, and keeps every one by mission', () => {
    const table = {
      ...tableOf([instance('a', 'Awake'), instance('b', 'Asleep', {}, true)], [instance('c', 'Aboard Asleep', {}, true), instance('d', 'Aboard')]),
      brig: [instance('e', 'Captive')],
    };
    const f = costFactsOf(table);
    expect(f.commanded.map((p) => p.name)).toEqual(['awake', 'aboard']);
    expect(f.missions?.[0].personnel?.map((p) => [p.name, p.stopped])).toEqual([
      ['awake', false],
      ['asleep', true],
    ]);
    expect(f.missions?.[1].personnel?.map((p) => [p.name, p.stopped])).toEqual([
      ['aboard asleep', true],
      ['aboard', false],
    ]);
  });
});

describe('the "you command" conditions ignore a stopped personnel (#1751)', () => {
  it('ifCommand: Elim Garak pays the printed cost while the only Treachery personnel is stopped', () => {
    const traitor = (stopped: boolean) => instance('t', 'Traitor', { skills: 'Treachery' }, stopped);
    expect(costOf('Elim Garak Crafty Underling', 4, tableOf([traitor(true)]))).toBe(4);
    expect(costOf('Elim Garak Crafty Underling', 4, tableOf([traitor(false)]))).toBe(3);
  });

  it('forEach: Seska counts only the unstopped Treachery personnel', () => {
    const traitor = (id: string, stopped: boolean) => instance(id, 'Traitor', { skills: 'Treachery' }, stopped);
    expect(costOf('Seska Pragmatic Agent', 6, tableOf([traitor('t1', true)], [traitor('t2', true)]))).toBe(6);
    expect(costOf('Seska Pragmatic Agent', 6, tableOf([traitor('t1', false)], [traitor('t2', true)]))).toBe(5);
  });

  it('two [Pa] Klingons: Korax needs both unstopped', () => {
    const pa = (id: string, stopped = false) => instance(id, `Klingon ${id}`, { species: 'Klingon', icons: '[Cmd][Pa]', affiliation: 'klingon' }, stopped);
    expect(costOf('Korax Instigator', 2, tableOf([pa('a'), pa('b', true)]))).toBe(2);
    expect(costOf('Korax Instigator', 2, tableOf([pa('a'), pa('b')]))).toBe(1);
  });

  it('Kahless: Khar pays the printed cost while Kahless is stopped', () => {
    expect(costOf('Khar', 2, tableOf([instance('k', 'Kahless', {}, true)]))).toBe(2);
    expect(costOf('Khar', 2, tableOf([instance('k', 'Kahless')]))).toBe(1);
  });

  it('Khan: Rodriguez pays the printed cost while Khan is stopped', () => {
    const khan = (stopped: boolean) => instance('k', 'Khan Noonien Singh Invented Subtitle', { species: 'Human' }, stopped);
    expect(costOf('Rodriguez', 4, tableOf([], [khan(true)]))).toBe(4);
    expect(costOf('Rodriguez', 4, tableOf([], [khan(false)]))).toBe(2);
  });

  it('Khan at Ceti Alpha V: Marla McGivers pays the printed cost while Khan is stopped', () => {
    const khan = (stopped: boolean) => instance('k', 'Khan Noonien Singh Invented Subtitle', { species: 'Human' }, stopped);
    const names: [string, string] = ['An Invented Mission', 'Ceti Alpha V Forge Settlement'];
    expect(costOf('Marla McGivers Superior Woman', 3, tableOf([khan(true)], [], names), 'personnel', { missionIndex: 1 })).toBe(3);
    expect(costOf('Marla McGivers Superior Woman', 3, tableOf([khan(false)], [], names), 'personnel', { missionIndex: 1 })).toBe(2);
  });

  it('Borg Nanoprobes pays the printed cost while the only Borg is stopped', () => {
    const borg = (stopped: boolean) => instance('b', 'Invented Drone', { species: 'Borg' }, stopped);
    expect(costOf('Borg Nanoprobes', 5, tableOf([], [borg(true)]), 'equipment')).toBe(5);
    expect(costOf('Borg Nanoprobes', 5, tableOf([], [borg(false)]), 'equipment')).toBe(3);
  });

  it('Unimatrix Zero counts only the unstopped unique Borg', () => {
    const borg = (id: string, stopped: boolean) => instance(id, `Invented Borg ${id}`, { species: 'Borg', unique: 'y' }, stopped);
    expect(costOf('Unimatrix Zero', 6, tableOf([borg('a', true), borg('b', true)]), 'event')).toBe(6);
    expect(costOf('Unimatrix Zero', 6, tableOf([borg('a', false), borg('b', true)]), 'event')).toBe(5);
  });
});

describe('the models that count a stopped personnel on purpose (#1751)', () => {
  it('Gaila offers her start-of-turn choice while she is stopped', () => {
    const names: [string, string] = ['Ferenginar Financial Hub', 'An Invented Mission'];
    for (const stopped of [false, true]) {
      expect(turnChoicesOf(costFactsOf(tableOf([instance('g', 'Gaila Arms Dealer', { species: 'Ferengi' }, stopped)], [], names)))).toEqual([
        { title: 'Gaila', label: 'Equipment from Ferenginar: +4', limit: 4 },
      ]);
    }
  });

  it('Scimitar counts a stopped Reman at this mission', () => {
    const table = tableOf([instance('r', 'Invented Reman', { species: 'Reman' }, true)]);
    const charge = moveCharge('playAndDraw', 'hand', 'shipRow', card('Scimitar Reman Warbird', 6, 'ship'), costFactsOf(table), 'c0', { missionIndex: 0 });
    expect(charge?.cost).toBe(5);
  });
});

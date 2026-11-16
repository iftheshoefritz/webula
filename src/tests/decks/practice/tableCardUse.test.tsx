import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  costUseAvailable,
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  isLogEntry,
  logEntryText,
  turnCharges,
  withShuffleOrders,
  type LogCharge,
} from '../../../app/decks/practice/gameLog';
import { ChargeChip } from '../../../app/decks/practice/TurnCounters';
import { initialTableState, CardInstance, MissionSlot, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';

// A card on the table whose use changes a play's cost (#1713): one entry, one undo, once a copy a play.

const instance = (id: string, name: string, type: string, extra: Record<string, unknown> = {}): CardInstance => ({
  id,
  card: { name, originalName: name, type, ...extra },
  face: 'up',
});

const slots = (overrides: Partial<MissionSlot>[] = []): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides[i] }));

const table = (overrides: Partial<TableState> = {}): TableState => ({ ...initialTableState, missions: slots(), ...overrides });

const play = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);

const machinations = instance('e1', 'Machinations', 'event', { cost: '2', keywords: 'Temporal.' });
const plain = instance('e2', 'Plain Event', 'event', { cost: '2', keywords: 'Treaty.' });
const boy = instance('d1', 'Delivery Boy', 'event', { cost: '0', keywords: 'Q. Temporal.' });
const boy2 = instance('d2', 'Delivery Boy', 'event', { cost: '0', keywords: 'Q. Temporal.' });

describe('Delivery Boy in the core (#1713)', () => {
  const start = (core = [boy]) => initialGameState(table({ hand: [machinations, plain], core }));
  const played = () => play(start(), { type: 'move', id: 'e1', to: 'core' });

  it('offers its use for a Temporal event, and nothing for another event', () => {
    const [charge] = turnCharges(played().log, 1);
    expect(charge.cost).toBe(2);
    expect(charge.uses).toEqual([{ id: 'd1', title: 'Delivery Boy', label: 'Destroy Delivery Boy: −3', amount: 3, effect: 'destroy', used: false }]);
    const other = play(start(), { type: 'move', id: 'e2', to: 'core' });
    expect(turnCharges(other.log, 1)[0].uses).toBeUndefined();
  });

  it('charges −3, moves Delivery Boy to the discard pile, in one entry that one undo takes back', () => {
    const before = played();
    const [charge] = turnCharges(before.log, 1);
    const used = play(before, { type: 'useCard', target: charge.target, id: 'd1' });
    expect(used.log).toHaveLength(2);
    expect(logEntryText(used.log[1])).toBe('Destroyed Delivery Boy: charged Machinations 0 counters (was 2)');
    expect(used.table.core.map((c) => c.id)).toEqual(['e1']);
    expect(used.table.discard.map((c) => c.id)).toEqual(['d1']);
    const after = turnCharges(used.log, 1)[0];
    expect(after.cost).toBe(0);
    expect(after.uses?.[0].used).toBe(true);
    // Once a copy a play.
    expect(play(used, { type: 'useCard', target: charge.target, id: 'd1' })).toBe(used);
    // A reload keeps it.
    const saved = JSON.parse(JSON.stringify(used.log));
    expect(saved.every(isLogEntry)).toBe(true);
    expect(turnCharges(saved, 1)[0].uses?.[0].used).toBe(true);
    const undone = play(used, { type: 'undo' });
    expect(undone.table).toBe(before.table);
    expect(turnCharges(undone.log, 1)[0]).toEqual(expect.objectContaining({ cost: 2, uses: [expect.objectContaining({ used: false })] }));
  });

  it('gives −6 for two copies, and ignores a copy that left the core', () => {
    const before = play(start([boy, boy2]), { type: 'move', id: 'e1', to: 'core' });
    const [charge] = turnCharges(before.log, 1);
    expect(charge.uses?.map((u) => u.id)).toEqual(['d1', 'd2']);
    const moved = play(before, { type: 'move', id: 'd2', to: 'hand' });
    expect(costUseAvailable(moved.table, charge.uses![1])).toBe(false);
    expect(play(moved, { type: 'useCard', target: charge.target, id: 'd2' })).toBe(moved);
    const both = play(before, { type: 'useCard', target: charge.target, id: 'd1' }, { type: 'useCard', target: charge.target, id: 'd2' });
    expect(turnCharges(both.log, 1)[0].cost).toBe(0);
  });
});

describe('Nathan Samuels and Guinan at the destination mission (#1713)', () => {
  const nathan = instance('n1', 'Nathan Samuels Earth Minister', 'personnel', { affiliation: 'Starfleet', species: 'Human', cost: '3' });
  const guinan = instance('g1', 'Guinan Battleship Bartender', 'personnel', { affiliation: 'Federation', icons: '[TNG][AU]', cost: '4' });
  const vulcan = instance('p1', 'Invented Vulcan', 'personnel', { affiliation: 'Starfleet', species: 'Vulcan', cost: '3' });
  const human = instance('p2', 'Invented Human', 'personnel', { affiliation: 'Starfleet', species: 'Human', cost: '3' });
  const auTng = instance('q1', 'Invented Gadget', 'equipment', { icons: '[AU][TNG]', cost: '3' });
  const earth = instance('m1', 'Earth', 'mission');
  const vulcanMission = instance('m2', 'Vulcan', 'mission');
  const awayTeam = (missionIndex: number) => ({ zone: 'missionPile', missionIndex, pile: 'awayTeam' }) as const;
  const start = (stopped = false) =>
    initialGameState(
      table({
        hand: [vulcan, human, auTng],
        missions: slots([{ mission: earth, awayTeam: [{ ...nathan, stopped }, guinan] }, { mission: vulcanMission }]),
      })
    );

  it('offers Nathan for a non-Human [SF] personnel played at his mission, and stops him for −2', () => {
    const before = play(start(), { type: 'move', id: 'p1', to: awayTeam(0) });
    const [charge] = turnCharges(before.log, 1);
    expect(charge.uses?.map((u) => u.label)).toEqual(['Stop Nathan Samuels: −2']);
    const used = play(before, { type: 'useCard', target: charge.target, id: 'n1' });
    expect(used.log).toHaveLength(2);
    expect(logEntryText(used.log[1])).toBe('Stopped Nathan Samuels Earth Minister: charged Invented Vulcan 1 counter (was 3)');
    expect(used.table.missions[0].awayTeam.find((c) => c.id === 'n1')?.stopped).toBe(true);
    expect(play(used, { type: 'undo' }).table).toBe(before.table);
  });

  it('offers nothing at another mission, while stopped, or for a Human', () => {
    expect(turnCharges(play(start(), { type: 'move', id: 'p1', to: awayTeam(1) }).log, 1)[0].uses).toBeUndefined();
    expect(turnCharges(play(start(true), { type: 'move', id: 'p1', to: awayTeam(0) }).log, 1)[0].uses).toBeUndefined();
    expect(turnCharges(play(start(), { type: 'move', id: 'p2', to: awayTeam(0) }).log, 1)[0].uses).toBeUndefined();
  });

  it('ignores Nathan stopped by hand after the play', () => {
    const before = play(start(), { type: 'move', id: 'p1', to: awayTeam(0) }, { type: 'setStopped', ids: ['n1'], stopped: true });
    const [charge] = turnCharges(before.log, 1);
    expect(play(before, { type: 'useCard', target: charge.target, id: 'n1' })).toBe(before);
  });

  it('offers Guinan for an [AU][TNG] card at her mission, and stops her for −2', () => {
    const before = play(start(), { type: 'move', id: 'q1', to: awayTeam(0) });
    const [charge] = turnCharges(before.log, 1);
    expect(charge.uses?.map((u) => u.id)).toEqual(['g1']);
    const used = play(before, { type: 'useCard', target: charge.target, id: 'g1' });
    expect(turnCharges(used.log, 1)[0].cost).toBe(1);
    expect(turnCharges(play(start(), { type: 'move', id: 'q1', to: awayTeam(1) }).log, 1)[0].uses).toBeUndefined();
  });
});

describe("a use stacks with the played card's own choice (#1713)", () => {
  // Rollins: a counted choice; Goran: a choice of a cost. Invented cards in the hand only feed Goran.
  const goran = instance('c1', 'Goran', 'personnel', { cost: '2', affiliation: 'Starfleet', species: 'Bajoran' });
  const tricorder = instance('t1', 'Tricorder', 'equipment', { cost: '1' });
  const nathan = instance('n1', 'Nathan Samuels Earth Minister', 'personnel', { affiliation: 'Starfleet', species: 'Human', cost: '3' });
  const earth = instance('m1', 'Earth', 'mission');
  const start = () => initialGameState(table({ hand: [goran, tricorder], missions: slots([{ mission: earth, awayTeam: [nathan] }]) }));
  const awayTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;

  it('gives the same cost in either order, never below 0', () => {
    const before = play(start(), { type: 'move', id: 'c1', to: awayTeam });
    const [charge] = turnCharges(before.log, 1);
    expect(charge.source?.choice).toEqual(expect.objectContaining({ cost: 0 }));
    expect(charge.uses?.map((u) => u.id)).toEqual(['n1']);
    const choice = { type: 'correctCharge' as const, target: charge.target, cost: 0, source: 'Goran' };
    const use = { type: 'useCard' as const, target: charge.target, id: 'n1' };
    const a = play(before, choice, use);
    const b = play(before, use, choice);
    expect(turnCharges(a.log, 1)[0].cost).toBe(0);
    expect(turnCharges(b.log, 1)[0].cost).toBe(0);
    expect(turnCharges(b.log, 1)[0].choiceTaken).toBe(true);
    expect(turnCharges(a.log, 1)[0].uses?.[0].used).toBe(true);
  });
});

describe('ChargeRow shows the use beside the choice (#1713)', () => {
  const target = { entry: 0, move: 0, card: 0 };
  const charge = (used = false): LogCharge => ({
    target,
    card: 'Goran',
    draw: false,
    cost: 2,
    source: { title: 'Goran', reason: 'you may discard an equipment or event', choice: { label: 'Discard a card: −2', cost: 0 } },
    uses: [{ id: 'n1', title: 'Nathan Samuels', label: 'Stop Nathan Samuels: −2', amount: 2, effect: 'stop', used }],
  });

  it('renders both buttons, and the use calls its handler until it is used', () => {
    const onUse = jest.fn();
    const { rerender } = render(
      <ChargeChip charges={[charge()]} onCorrect={jest.fn()} onRaiseLimit={jest.fn()} uses={{ onUse, available: () => true }} />
    );
    expect(screen.getByTestId('charge-choice')).toHaveTextContent('Discard a card: −2');
    fireEvent.click(screen.getByTestId('charge-use'));
    expect(onUse).toHaveBeenCalledWith(target, 'n1');
    rerender(<ChargeChip charges={[charge(true)]} onCorrect={jest.fn()} onRaiseLimit={jest.fn()} uses={{ onUse, available: () => true }} />);
    expect(screen.getByTestId('charge-use')).toBeDisabled();
    expect(screen.getByTestId('charge-use')).toHaveTextContent('(used)');
    rerender(<ChargeChip charges={[charge()]} onCorrect={jest.fn()} onRaiseLimit={jest.fn()} uses={{ onUse, available: () => false }} />);
    expect(screen.getByTestId('charge-use')).toBeDisabled();
  });
});

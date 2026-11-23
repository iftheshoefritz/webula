import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  resolveStageOf,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { personnelCandidateGroups } from '../../../app/decks/practice/personnelChoice';
import { resolveModelOf } from '../../../lib/resolveModels';
import { bottomFromHand, draw, drawPersonnelCost } from '../../../lib/effectSteps';

// Issue #1739: the resolve models of These Are The Voyages and Miracle Working: a free draw, then cards
// of the hand to the bottom of the draw deck, each step one entry and one undo. With invented cards.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, cost: number, extra: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: String(cost), affiliation: 'federation' }, extra);
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1', gametext: 'draw.' });

const TATV = event('tatv', 'These Are The Voyages');
const MIRACLE = event('miracle', 'Miracle Working');

function table(deckSize = 10, resolving: CardInstance = TATV): TableState {
  return {
    ...initialTableState,
    hand: [card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' })],
    drawDeck: Array.from({ length: deckSize }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: i === 0 ? [person('data', 'Data', 4), person('worf', 'Worf', 3, { stopped: true })] : [],
      underMission: [],
    })),
    brig: [person('prisoner', 'Prisoner', 5)],
    resolving,
  };
}

// The game with the event already played into the resolving zone, as the page dispatches it.
function resolvingGame(t: TableState): GameState {
  const { resolving } = t;
  const before = { ...t, resolving: null, hand: [...t.hand, resolving!] };
  const play = withShuffleOrders(before, { type: 'move', id: resolving!.id, to: 'resolving' }, []);
  return gameReducer(initialGameState(before), play);
}

const spent = (state: GameState) => turnCounters(state.log, state.table.turn).spent;

describe('the resolve models (#1739)', () => {
  it('holds These Are The Voyages and Miracle Working by title', () => {
    expect(resolveModelOf('These Are The Voyages')?.steps).toEqual([drawPersonnelCost(), bottomFromHand(3)]);
    expect(resolveModelOf('Miracle Working')?.steps).toEqual([draw(4), bottomFromHand(3)]);
    expect(resolveModelOf('At What Cost?')).toBeUndefined();
  });

  it('lists stopped personnel with includeStopped, and never the brig', () => {
    const ids = (t: TableState, includeStopped: boolean) =>
      personnelCandidateGroups(t, { includeStopped }).flatMap((g) => g.cards.map((c) => c.id));
    expect(ids(table(), true)).toEqual(['data', 'worf']);
    expect(ids(table(), false)).toEqual(['data']);
  });
});

describe('the draw step of These Are The Voyages (#1739)', () => {
  it('starts at the draw step', () => {
    expect(resolveStageOf(resolvingGame(table()))?.lead.kind).toBe('draw');
  });

  it('draws the printed cost of the chosen personnel, free, in one entry that one undo takes back', () => {
    const start = resolvingGame(table());
    const before = spent(start);
    const drew = gameReducer(start, { type: 'effectStep', personnelId: 'data' });
    expect(drew.table.hand.map((c) => c.id)).toEqual(['h1', 'd1', 'd2', 'd3', 'd4']);
    expect(drew.log).toHaveLength(start.log.length + 1);
    expect(logEntryText(drew.log[drew.log.length - 1])).toBe('Drew 4 cards (These Are The Voyages, Data cost 4)');
    expect(spent(drew)).toBe(before);
    expect(resolveStageOf(drew)?.lead.kind).toBe('bottomFromHand');
    const undone = gameReducer(drew, { type: 'undo' });
    expect(undone.table).toBe(start.table);
    expect(resolveStageOf(undone)?.lead.kind).toBe('draw');
  });

  it('lets a stopped personnel set the draw', () => {
    const drew = gameReducer(resolvingGame(table()), { type: 'effectStep', personnelId: 'worf' });
    expect(drew.table.hand).toHaveLength(4);
  });

  it('refuses a personnel of the brig, an unknown one and a second draw', () => {
    const start = resolvingGame(table());
    expect(gameReducer(start, { type: 'effectStep', personnelId: 'prisoner' })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep' })).toBe(start);
    const drew = gameReducer(start, { type: 'effectStep', personnelId: 'data' });
    expect(gameReducer(drew, { type: 'effectStep', personnelId: 'data' })).toBe(drew);
  });

  it('draws what a short deck holds, and an empty deck logs 0 and moves on', () => {
    const short = gameReducer(resolvingGame(table(2)), { type: 'effectStep', personnelId: 'data' });
    expect(logEntryText(short.log[short.log.length - 1])).toBe('Drew 2 cards (These Are The Voyages, Data cost 4)');
    const empty = gameReducer(resolvingGame(table(0)), { type: 'effectStep', personnelId: 'data' });
    expect(logEntryText(empty.log[empty.log.length - 1])).toBe('Drew 0 cards (These Are The Voyages, Data cost 4)');
    expect(resolveStageOf(empty)?.lead.kind).toBe('bottomFromHand');
  });
});

describe('the bottom step (#1739)', () => {
  const drawn = () => gameReducer(resolvingGame(table()), { type: 'effectStep', personnelId: 'data' });

  it('puts the chosen cards on the bottom in order and the event in the discard pile, in one entry', () => {
    const start = drawn();
    const placed = gameReducer(start, { type: 'effectStep', ids: ['d2', 'h1', 'd4'] });
    expect(placed.table.drawDeck.slice(-3).map((c) => c.id)).toEqual(['d2', 'h1', 'd4']);
    expect(placed.table.hand.map((c) => c.id)).toEqual(['d1', 'd3']);
    expect(placed.table.discard.map((c) => c.id)).toEqual(['tatv']);
    expect(placed.table.resolving).toBeNull();
    expect(placed.log).toHaveLength(start.log.length + 1);
    expect(logEntryText(placed.log[placed.log.length - 1])).toBe(
      'Put 3 cards on the bottom of the draw deck, and These Are The Voyages went to the discard pile'
    );
    expect(spent(placed)).toBe(spent(start));
    const undone = gameReducer(placed, { type: 'undo' });
    expect(undone.table).toBe(start.table);
    expect(resolveStageOf(undone)?.lead.kind).toBe('bottomFromHand');
  });

  it('takes exactly min(3, hand) different cards of the hand', () => {
    const start = drawn();
    expect(gameReducer(start, { type: 'effectStep', ids: ['d1', 'd2'] })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep', ids: ['d1', 'd1', 'd2'] })).toBe(start);
    expect(gameReducer(start, { type: 'effectStep', ids: ['d1', 'd2', 'd9'] })).toBe(start);
    // Before the draw the step is the draw, so nothing goes to the bottom.
    const before = resolvingGame(table());
    expect(gameReducer(before, { type: 'effectStep', ids: ['h1'] })).toBe(before);
  });

  it('takes the whole hand when it holds fewer than three', () => {
    const empty = gameReducer(resolvingGame(table(0)), { type: 'effectStep', personnelId: 'data' });
    const placed = gameReducer(empty, { type: 'effectStep', ids: ['h1'] });
    expect(placed.table.drawDeck.map((c) => c.id)).toEqual(['h1']);
    expect(logEntryText(placed.log[placed.log.length - 1])).toBe(
      'Put 1 card on the bottom of the draw deck, and These Are The Voyages went to the discard pile'
    );
  });
});

describe('Miracle Working (#1739)', () => {
  it('draws four with no choice of personnel', () => {
    const drew = gameReducer(resolvingGame(table(10, MIRACLE)), { type: 'effectStep' });
    expect(drew.table.hand).toHaveLength(5);
    expect(logEntryText(drew.log[drew.log.length - 1])).toBe('Drew 4 cards (Miracle Working)');
  });
});

describe('the step and the log (#1739)', () => {
  it('reads the draw of an earlier copy as no draw of this one', () => {
    const first = gameReducer(resolvingGame(table()), { type: 'effectStep', personnelId: 'data' });
    const done = gameReducer(first, { type: 'effectStep', ids: ['d1', 'd2', 'd3'] });
    // A second copy goes into the resolving zone.
    const copy = event('tatv2', 'These Are The Voyages');
    const withCopy = { ...done, table: { ...done.table, hand: [...done.table.hand, copy] } };
    const played = gameReducer(withCopy, withShuffleOrders(withCopy.table, { type: 'move', id: 'tatv2', to: 'resolving' }, withCopy.log));
    expect(resolveStageOf(played)?.lead.kind).toBe('draw');
  });

  it('has no step for an event with no model, or nothing resolving', () => {
    expect(resolveStageOf(resolvingGame(table(10, event('x', 'At What Cost?'))))).toBeNull();
    expect(resolveStageOf(initialGameState(initialTableState))).toBeNull();
  });

  it('keeps both entries through a save', () => {
    const drew = gameReducer(resolvingGame(table()), { type: 'effectStep', personnelId: 'data' });
    const placed = gameReducer(drew, { type: 'effectStep', ids: ['d1', 'd2', 'd3'] });
    for (const entry of JSON.parse(JSON.stringify(placed.log.slice(-2)))) expect(isLogEntry(entry)).toBe(true);
  });
});

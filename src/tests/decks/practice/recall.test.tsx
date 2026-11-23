import React from 'react';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS, tableReducer } from '../../../app/decks/practice/tableReducer';
import {
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  resolvedRemoveFromGameAction,
  resolvingRecalled,
  turnCharges,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { playTargetEligible } from '../../../app/decks/practice/playTargetRules';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { hasRecall, moveCharge, recallOf, recallRefused } from '../../../lib/playCost';
import { costModelOf } from '../../../lib/costModels/registry';

// Issue #1764: Recall N lets an event play from the discard pile at its cost + N, then leave the game.
// The keyword's events are invented here; Vidiian Organ Bank, whose Recall its text grants while the player
// commands two completed missions, and Miracle Working, whose resolve model ends the play, keep their titles
// because the models are keyed by title.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const event = (id: string, name: string, cost: number, keywords = '') =>
  card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: String(cost), keywords, gametext: 'draw a card.' });
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });

const ECHO = event('echo', 'Echo of Return', 1, 'recall: 1.');
const DEEP = event('deep', 'Deep Echo', 3, 'recall: 2.');
const PLAIN = event('plain', 'Plain Event', 1);
const BANK = event('bank', 'Vidiian Organ Bank', 0);
const MIRACLE = event('mw', 'Miracle Working', 1, 'recall: 1.');

function table({ discard = [ECHO, DEEP, PLAIN, BANK, MIRACLE], completed = 0, hand = [deckCard('h1'), deckCard('h2'), deckCard('h3')] } = {}): TableState {
  return {
    ...initialTableState,
    hand,
    discard,
    drawDeck: Array.from({ length: 8 }, (_, i) => deckCard(`d${i}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: 'p' }),
      ships: [],
      awayTeam: [],
      underMission: [],
      ...(i < completed ? { completed: true } : {}),
    })),
  };
}

const play = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
const toResolving = (id: string): GameAction => ({ type: 'move', id, to: 'resolving' });

describe('the price (#1764)', () => {
  const charge = (c: CardInstance, to: 'resolving' | 'core', t = table()) => moveCharge('playAndDraw', 'discard', to, c.card, costFactsOf(t), c.id);

  it('charges a Recall event its cost + N from the discard pile into the resolving zone, naming the Recall', () => {
    expect(charge(ECHO, 'resolving')).toEqual({
      kind: 'play',
      cost: 2,
      source: { title: 'Echo of Return', reason: 'Recall 1, played from your discard pile' },
    });
    expect(charge(DEEP, 'resolving')).toMatchObject({ cost: 5, source: { reason: 'Recall 2, played from your discard pile' } });
  });

  it('is no play anywhere else, for a card with no Recall, or outside play and draw', () => {
    expect(charge(ECHO, 'core')).toBeNull();
    expect(charge(PLAIN, 'resolving')).toBeNull();
    expect(moveCharge('orders', 'discard', 'resolving', ECHO.card, costFactsOf(table()), 'echo')).toBeNull();
  });

  it("gives Vidiian Organ Bank Recall 1 only with two completed missions, and refuses its play without", () => {
    expect(costModelOf('Vidiian Organ Bank')?.recall).toBeDefined();
    expect(hasRecall(BANK.card)).toBe(true);
    expect(hasRecall(PLAIN.card)).toBe(false);
    const one = table({ completed: 1 });
    const two = table({ completed: 2 });
    expect(recallOf(BANK.card, costFactsOf(one))).toBeNull();
    expect(recallRefused('discard', 'resolving', BANK.card, costFactsOf(one))).toBe(true);
    expect(charge(BANK, 'resolving', one)).toBeNull();
    expect(recallRefused('discard', 'resolving', BANK.card, costFactsOf(two))).toBe(false);
    expect(charge(BANK, 'resolving', two)).toMatchObject({ cost: 1, source: { title: 'Vidiian Organ Bank' } });
    // Only the play is refused: a move elsewhere, or of a keyword card, never is.
    expect(recallRefused('discard', 'core', BANK.card, costFactsOf(one))).toBe(false);
    expect(recallRefused('discard', 'resolving', ECHO.card, costFactsOf(one))).toBe(false);
    expect(recallRefused('discard', 'resolving', PLAIN.card, costFactsOf(one))).toBe(false);
  });
});

describe('the play (#1764)', () => {
  it('is one entry and one undo, logged as a play from the discard pile', () => {
    const start = initialGameState(table());
    const after = play(start, toResolving('echo'));
    expect(after.table.resolving?.id).toBe('echo');
    expect(after.log).toHaveLength(1);
    expect(logEntryText(after.log[0])).toContain('(cost 2, Echo of Return: Recall 1, played from your discard pile)');
    expect(turnCounters(after.log, 1).spent).toBe(2);
    expect(resolvingRecalled(after)).toBe(true);
    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(start.table);
    expect(undone.log).toEqual([]);
  });

  it('leaves a move of a card with no Recall, a move elsewhere, and a removed card uncharged', () => {
    expect(turnCharges(play(initialGameState(table()), toResolving('plain')).log, 1)).toEqual([]);
    expect(turnCharges(play(initialGameState(table()), { type: 'move', id: 'echo', to: 'core' }).log, 1)).toEqual([]);
    const removed = table({ discard: [{ ...ECHO, removedFromGame: true }] });
    const moved = play(initialGameState(removed), toResolving('echo'));
    expect(turnCharges(moved.log, 1)).toEqual([]);
    expect(resolvingRecalled(moved)).toBe(false);
  });

  it('an event played from the hand is not recalled', () => {
    const fromHand = play(initialGameState(table({ discard: [], hand: [ECHO] })), toResolving('echo'));
    expect(turnCharges(fromHand.log, 1)[0]).toMatchObject({ cost: 1 });
    expect(resolvingRecalled(fromHand)).toBe(false);
    const cancelled = play(fromHand, { type: 'cancelResolving' });
    expect(cancelled.table.hand.map((c) => c.id)).toEqual(['echo']);
  });
});

describe('the way out of a recalled event (#1764)', () => {
  const recalled = () => play(initialGameState(table()), toResolving('echo'));

  it('Remove from game leaves it at the end of the discard pile, marked removed', () => {
    const after = play(recalled(), resolvedRemoveFromGameAction('echo'));
    expect(after.table.discard.map((c) => c.id)).toEqual(['deep', 'plain', 'bank', 'mw', 'echo']);
    expect(after.table.discard[4].removedFromGame).toBe(true);
    expect(logEntryText(after.log[1])).toBe('Resolved Echo of Return, and removed it from the game');
  });

  it('Cancel puts it back at the end of the discard pile, uncharged, and gives the counters back', () => {
    const before = recalled();
    const after = play(before, { type: 'cancelResolving' });
    expect(after.table.resolving).toBeNull();
    expect(after.table.hand.map((c) => c.id)).toEqual(['h1', 'h2', 'h3']);
    expect(after.table.discard.map((c) => c.id)).toEqual(['deep', 'plain', 'bank', 'mw', 'echo']);
    expect(after.table.discard[4].removedFromGame).toBeUndefined();
    expect(logEntryText(after.log[1])).toBe('Cancelled playing Echo of Return, and it went back to the discard pile');
    expect(isLogEntry(JSON.parse(JSON.stringify(after.log[1])))).toBe(true);
    expect(turnCounters(after.log, 1).spent).toBe(0);
    // Played again, it is recalled again.
    expect(resolvingRecalled(play(after, toResolving('echo')))).toBe(true);
    expect(gameReducer(after, { type: 'undo' }).table).toBe(before.table);
  });

  it('a recalled Miracle Working ends its resolve model removed from the game, in its one last entry', () => {
    const drawn = play(initialGameState(table()), toResolving('mw'), { type: 'effectStep' });
    expect(resolvingRecalled(drawn)).toBe(true);
    const ids = drawn.table.hand.slice(0, 3).map((c) => c.id);
    const after = play(drawn, { type: 'effectStep', ids });
    const mw = after.table.discard.find((c) => c.id === 'mw');
    expect(mw?.removedFromGame).toBe(true);
    expect(after.table.discard[after.table.discard.length - 1].id).toBe('mw');
    expect(after.log).toHaveLength(drawn.log.length + 1);
    expect(logEntryText(after.log[after.log.length - 1])).toBe(
      'Put 3 cards on the bottom of the draw deck, and Miracle Working was removed from the game'
    );
    expect(gameReducer(after, { type: 'undo' }).table).toBe(drawn.table);
  });

  it('a Miracle Working played from the hand still ends in the discard pile', () => {
    const drawn = play(initialGameState(table({ discard: [], hand: [MIRACLE, deckCard('h1'), deckCard('h2'), deckCard('h3')] })), toResolving('mw'), { type: 'effectStep' });
    const after = play(drawn, { type: 'effectStep', ids: drawn.table.hand.slice(0, 3).map((c) => c.id) });
    expect(after.table.discard.find((c) => c.id === 'mw')?.removedFromGame).toBeUndefined();
    expect(logEntryText(after.log[after.log.length - 1])).toContain('Miracle Working went to the discard pile');
  });

  it('reads the same after a save and a reload', () => {
    const state = recalled();
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(resolvingRecalled(restored)).toBe(true);
  });
});

describe('the Play target from the discard pile (#1764)', () => {
  const eligible = (c: CardInstance, fromDiscard = true) =>
    playTargetEligible({ resolveEvents: true, table: table(), group: [c], fromHand: false, fromDiscard });

  it('shows for a card that can have Recall, Vidiian Organ Bank with no completed mission too', () => {
    expect(eligible(ECHO)).toBe(true);
    expect(eligible(BANK)).toBe(true);
  });

  it('never for a card with no Recall, a card removed from the game, or a drag from elsewhere', () => {
    expect(eligible(PLAIN)).toBe(false);
    expect(eligible({ ...ECHO, removedFromGame: true })).toBe(false);
    expect(eligible(ECHO, false)).toBe(false);
  });
});

describe('the panel of a recalled event (#1764)', () => {
  it('offers Remove from game and no Discard', () => {
    render(
      <DndContext>
        <ResolvingPanel instance={ECHO} hidden={false} escapeActive={false} onRemoveFromGame={jest.fn()} onCancel={jest.fn()} onViewTable={jest.fn()} />
      </DndContext>
    );
    expect(screen.getByTestId('resolving-remove-from-game')).toBeInTheDocument();
    expect(screen.queryByTestId('resolving-discard')).toBeNull();
  });
});

describe('the fixture deal (#1764)', () => {
  it('puts `extraDiscard` into the discard pile, face up', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, { type: 'equipment', name: `c${i}`, originalName: `C${i}` }));
    const dealt = tableReducer(initialTableState, { type: 'resetWithPiles', cards, missions: [], dilemmas: [], extraDiscard: [{ ...ECHO, face: 'down' }] });
    expect(dealt.discard.map((c) => [c.id, c.face])).toEqual([['echo', 'up']]);
  });
});

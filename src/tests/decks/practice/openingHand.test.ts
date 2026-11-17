// The opening hand of a new game (#1736): "Draw 7" draws the top 7 of the draw deck at no cost.
import {
  tableReducer,
  initialTableState,
  CardInstance,
  OPENING_HAND,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText, turnCounters } from '../../../app/decks/practice/gameLog';

const instance = (id: string): CardInstance => ({
  id,
  card: { name: `card ${id}`, originalName: `Card ${id}`, type: 'personnel' },
  face: 'down',
});

const cards = (n: number) => Array.from({ length: n }, (_, i) => instance(`c${i}`));

const newGame = (n: number): TableState =>
  tableReducer(initialTableState, { type: 'reset', cards: cards(n), missions: [], dilemmas: [] });

describe('tableReducer: the opening hand (#1736)', () => {
  it('a new game waits for its opening hand; a fixture that deals a hand does not', () => {
    expect(newGame(10).openingHand).toBe('pending');
    const piles = tableReducer(initialTableState, { type: 'resetWithPiles', cards: cards(10), missions: [], dilemmas: [] });
    expect('openingHand' in piles).toBe(false);
  });

  it('moves the top 7 of the draw deck to the end of the hand, face up, and clears the flag', () => {
    const before = { ...newGame(10), hand: [{ ...instance('h0'), face: 'up' as const }] };
    const after = tableReducer(before, { type: 'drawOpeningHand' });
    expect(OPENING_HAND).toBe(7);
    expect(after.hand.map((c) => c.id)).toEqual(['h0', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(after.hand.every((c) => c.face === 'up')).toBe(true);
    expect(after.drawDeck.map((c) => c.id)).toEqual(['c7', 'c8', 'c9']);
    expect('openingHand' in after).toBe(false);
  });

  it('draws what a short draw deck holds, and nothing from an empty one', () => {
    expect(tableReducer(newGame(3), { type: 'drawOpeningHand' }).hand).toHaveLength(3);
    const empty = newGame(0);
    expect(tableReducer(empty, { type: 'drawOpeningHand' })).toBe(empty);
  });

  it('keeps the flag through a hand draw, and the next turn clears it', () => {
    const drew = tableReducer(newGame(10), { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    expect(drew.openingHand).toBe('pending');
    expect('openingHand' in tableReducer(drew, { type: 'nextTurn' })).toBe(false);
  });
});

describe('gameReducer: the opening hand (#1736)', () => {
  it('makes one free entry, and one undo brings the empty hand and the flag back', () => {
    const start = initialGameState(newGame(10));
    const drawn = gameReducer(start, { type: 'drawOpeningHand' });
    expect(drawn.log).toHaveLength(1);
    expect(drawn.log[0]).toMatchObject({ kind: 'openingHand', count: 7 });
    expect(logEntryText(drawn.log[0])).toBe('Drew the opening hand (7 cards)');
    expect(turnCounters(drawn.log, 1).spent).toBe(0);

    const undone = gameReducer(drawn, { type: 'undo' });
    expect(undone.log).toHaveLength(0);
    expect(undone.table.hand).toHaveLength(0);
    expect(undone.table.openingHand).toBe('pending');
    expect(gameReducer(undone, { type: 'redo' }).table.hand).toHaveLength(7);
  });

  it('names the real count of a short deck, and logs nothing for an empty one', () => {
    const short = gameReducer(initialGameState(newGame(1)), { type: 'drawOpeningHand' });
    expect(logEntryText(short.log[0])).toBe('Drew the opening hand (1 card)');
    expect(gameReducer(initialGameState(newGame(0)), { type: 'drawOpeningHand' }).log).toHaveLength(0);
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { GameState, gameReducer, initialGameState, isLogEntry, logEntryText, resolveStageOf, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { ResolvingPanel, ResolveStep } from '../../../app/decks/practice/ResolvingPanel';
import { resolveModelOf } from '../../../lib/resolveModels';
import { discardFromHand, draw } from '../../../lib/effectSteps';

// Issue #1745: the events that discard a card from hand to draw two cards (Downfallen Civilization: three
// while no mission is completed) resolve in one step: one entry and one undo. With invented cards.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1', gametext: 'draw.' });
const TRICORDER = card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' });
const PHASER = card('h2', { type: 'equipment', name: 'phaser', originalName: 'Phaser', cost: '1' });

const ATONEMENT = event('ev', 'Days of Atonement');
const DOWNFALLEN = event('ev', 'Downfallen Civilization');

function table(resolving: CardInstance, { deck = 10, hand = [TRICORDER, PHASER], completed = false } = {}): TableState {
  return {
    ...initialTableState,
    hand,
    drawDeck: Array.from({ length: deck }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: [],
      underMission: [],
      ...(i === 0 && completed ? { completed: true } : {}),
    })),
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

describe('the discard-to-draw models (#1745)', () => {
  it.each([
    ['Days of Atonement', 2, undefined],
    ["Order of the Bat'leth", 2, undefined],
    ["That's the Last Time", 2, undefined],
    ['Downfallen Civilization', 2, 3],
  ])('%s discards a card to draw %i', (title, draw_, drawWithoutCompleted) => {
    expect(resolveModelOf(title)).toEqual({ title, steps: [discardFromHand(1), draw(draw_, drawWithoutCompleted ? { withoutCompleted: drawWithoutCompleted } : {})] });
  });

  it('has the one step, discardDraw, while such an event resolves', () => {
    expect(resolveStageOf(resolvingGame(table(ATONEMENT)))?.lead.kind).toBe('discardFromHand');
  });
});

describe('the step (#1745)', () => {
  it('discards the card, draws 2 free and moves the event to the discard pile, in one entry that one undo takes back', () => {
    const game = resolvingGame(table(ATONEMENT));
    const after = gameReducer(game, { type: 'effectStep', ids: ['h1'] });
    expect(after.table.resolving).toBeNull();
    expect(after.table.hand.map((c) => c.id)).toEqual(['h2', 'd1', 'd2']);
    expect(after.table.discard.map((c) => c.id)).toEqual(['h1', 'ev']);
    expect(after.table.drawDeck).toHaveLength(8);
    expect(after.log).toHaveLength(game.log.length + 1);
    const entry = after.log[after.log.length - 1];
    expect(logEntryText(entry)).toBe('Discarded Tricorder, drew 2 cards, and Days of Atonement went to the discard pile');
    expect(isLogEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);
    expect(resolveStageOf(after)).toBeNull();

    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(game.table);
    expect(undone.log).toEqual(game.log);
  });

  it('Downfallen Civilization draws 3 with no completed mission, and 2 with one', () => {
    const none = gameReducer(resolvingGame(table(DOWNFALLEN)), { type: 'effectStep', ids: ['h1'] });
    expect(none.table.hand).toHaveLength(4);
    expect(logEntryText(none.log[none.log.length - 1])).toContain('drew 3 cards');
    const one = gameReducer(resolvingGame(table(DOWNFALLEN, { completed: true })), { type: 'effectStep', ids: ['h1'] });
    expect(one.table.hand).toHaveLength(3);
  });

  it('a short draw deck draws what it holds, and the entry gives the real count', () => {
    const short = gameReducer(resolvingGame(table(ATONEMENT, { deck: 1 })), { type: 'effectStep', ids: ['h1'] });
    expect(logEntryText(short.log[short.log.length - 1])).toBe('Discarded Tricorder, drew 1 card, and Days of Atonement went to the discard pile');
    const empty = gameReducer(resolvingGame(table(ATONEMENT, { deck: 0 })), { type: 'effectStep', ids: ['h1'] });
    expect(logEntryText(empty.log[empty.log.length - 1])).toContain('drew 0 cards');
    expect(empty.table.resolving).toBeNull();
  });

  it('changes nothing with an empty hand, an id not in the hand, or the input of another step', () => {
    const emptyHand = resolvingGame(table(ATONEMENT, { hand: [] }));
    expect(gameReducer(emptyHand, { type: 'effectStep', ids: ['ev'] })).toBe(emptyHand);
    const game = resolvingGame(table(ATONEMENT));
    expect(gameReducer(game, { type: 'effectStep', ids: ['d1'] })).toBe(game);
    expect(gameReducer(game, { type: 'effectStep' })).toBe(game);
    expect(gameReducer(game, { type: 'effectStep', ids: ['h1', 'h2'] })).toBe(game);
    expect(gameReducer(game, { type: 'effectStep', personnelId: 'h1' })).toBe(game);
  });

  it('reads a malformed entry with its defaults', () => {
    const entry = { kind: 'resolveDiscardDraw', event: 7, discarded: null, count: 'x', turn: 1, segment: 'playAndDraw' } as unknown as GameState['log'][number];
    expect(logEntryText(entry)).toBe('Discarded a card, drew 0 cards, and the event went to the discard pile');
  });
});

describe('the panel step (#1745)', () => {
  const panel = (step: ResolveStep) =>
    render(
      <DndContext>
        <ResolvingPanel instance={ATONEMENT} hidden={false} escapeActive={false} onDiscard={jest.fn()} onCancel={jest.fn()} onViewTable={jest.fn()} step={step} />
      </DndContext>
    );

  it('picks one card, moves the pick on another tap, and discards it with the button', () => {
    const onDiscardDraw = jest.fn();
    panel({ step: 'discardDraw', draw: 2, hand: [TRICORDER, PHASER], onDiscardDraw });
    const button = screen.getByTestId('resolve-discard-draw');
    expect(button).toHaveTextContent('Discard and draw 2');
    expect(button).toBeDisabled();
    const [first, second] = screen.getAllByTestId('resolve-hand-card');
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onDiscardDraw).toHaveBeenCalledWith('h2');
    expect(screen.getByTestId('resolving-cancel')).toBeInTheDocument();
  });

  it('with an empty hand shows a note and no button', () => {
    panel({ step: 'discardDraw', draw: 2, hand: [], onDiscardDraw: jest.fn() });
    expect(screen.getByTestId('resolve-hand-empty')).toHaveTextContent('Your hand is empty: no card to discard, so no draw.');
    expect(screen.queryByTestId('resolve-discard-draw')).toBeNull();
    expect(screen.getByTestId('resolving-discard')).toBeInTheDocument();
  });
});

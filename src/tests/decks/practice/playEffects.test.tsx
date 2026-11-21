import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  LogEntry,
  logEntryText,
  pendingPlayEffectOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { discardCount, DrawUpToThenDiscardModel, drawUpToCount, playConditionLine, playConditionOf, playModelOf, playStepsOf } from '../../../lib/playModels';
import type { CostMission } from '../../../lib/costModels/model';

// Issue #1800: the "when you play" frame for personnel and ships, with Enabran Tain "Retired" Spymaster's
// draw-up-to-then-discard as its first model. With invented cards, but Tain's title, the key of his model.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const personnel = (id: string, name: string) => card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '3' });
const TAIN = personnel('tain', 'Enabran Tain "Retired" Spymaster');
const OTHER = personnel('other', 'Plain Personnel');
const TRICORDER = card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' });
const PHASER = card('h2', { type: 'equipment', name: 'phaser', originalName: 'Phaser', cost: '1' });

const mission = (i: number, type: string, skills: string) =>
  card(`m${i}`, { type: 'mission', name: `mission ${i}`, originalName: `Mission ${i}`, missiontype: type, skills });

function table({ deck = 10, hand = [TRICORDER, PHASER, TAIN, OTHER], requires = 'intelligence' } = {}): TableState {
  return {
    ...initialTableState,
    hand,
    drawDeck: Array.from({ length: deck }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 4 ? mission(i, 'h', '') : mission(i, i === 2 ? 's' : 'p', `${requires}, security, and cunning>30`),
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
  };
}

const AWAY_TEAM = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;

const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));

const played = (t: TableState = table(), id = 'tain'): GameState => dispatch(initialGameState(t), { type: 'move', id, to: AWAY_TEAM });

const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);

const costMission = (type: string, requirements: string): CostMission => ({
  completed: false,
  name: 'm',
  requirements,
  points: 30,
  type,
  icons: [],
  quadrant: 'a',
  dilemmasUnder: 0,
});

describe('the "when you play" model of Enabran Tain (#1800)', () => {
  const model = playModelOf('Enabran Tain "Retired" Spymaster *VP') as DrawUpToThenDiscardModel;

  it('is found by its whole title, and a personnel with no model has none', () => {
    expect(model).toMatchObject({ kind: 'drawUpToThenDiscard', drawUpTo: 7, discard: 2 });
    expect(playModelOf('Enabran Tain Retired Mastermind')).toBeUndefined();
    expect(playStepsOf(model)).toEqual([
      { step: 'draw', may: true },
      { step: 'discard', may: false },
    ]);
  });

  it('reads its condition from the missions: met, not met, an empty slot and a headquarters count for nothing', () => {
    const met = playConditionOf(model, { missions: [costMission('p', 'intelligence, security'), costMission('h', ''), costMission('', '')] })!;
    expect(met.status).toBe('met');
    expect(playConditionLine(model, met)).toBe('Condition met: each of your non-headquarters missions requires Intelligence');
    const notMet = playConditionOf(model, { missions: [costMission('p', 'intelligence'), costMission('s', 'navigation')] })!;
    expect(playConditionLine(model, notMet)).toBe('Condition not met: each of your non-headquarters missions requires Intelligence');
  });

  it('clamps the draw to 0..7 and the deck, and the discard to the hand', () => {
    expect(drawUpToCount(model, 9, 20)).toBe(7);
    expect(drawUpToCount(model, 4, 2)).toBe(2);
    expect(drawUpToCount(model, -1, 20)).toBe(0);
    expect(discardCount(model, 5)).toBe(2);
    expect(discardCount(model, 1)).toBe(1);
  });
});

describe('the pending effect and its steps (#1800)', () => {
  it('a play to an away team lands Tain there and leaves his effect pending, at the draw step', () => {
    const game = played();
    expect(game.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['tain']);
    const pending = pendingPlayEffectOf(game)!;
    expect(pending).toMatchObject({ id: 'tain', name: 'Enabran Tain "Retired" Spymaster', steps: [], step: { step: 'draw' } });
    expect(pending.condition?.status).toBe('met');
  });

  it('drawing N then discarding 2 makes one entry that names both, and one undo takes back the play and the effect', () => {
    const start = played();
    const before = start.undo[start.undo.length - 1];
    const drew = dispatch(start, { type: 'playEffectDraw', count: 5 });
    expect(drew.log).toHaveLength(1);
    expect(drew.table.hand).toHaveLength(3 + 5);
    expect(pendingPlayEffectOf(drew)?.step.step).toBe('discard');
    const done = dispatch(drew, { type: 'playEffectDiscard', ids: ['h1', 'h2'] });
    expect(done.log).toHaveLength(1);
    expect(done.table.discard.map((c) => c.id)).toEqual(['h1', 'h2']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe(
      'Played Enabran Tain "Retired" Spymaster at Mission 0 (cost 3); drew 5 cards, then discarded Tricorder and Phaser'
    );
    expect(isLogEntry(JSON.parse(JSON.stringify(done.log[0])))).toBe(true);

    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(undone.log).toEqual([]);
    expect(undone.table.hand.map((c) => c.id)).toEqual(['h1', 'h2', 'tain', 'other']);
    expect(undone.table.drawDeck).toHaveLength(10);
  });

  it('a short draw deck draws what it holds, and the record gives the real count', () => {
    const game = dispatch(played(table({ deck: 2 })), { type: 'playEffectDraw', count: 7 });
    expect(game.table.drawDeck).toHaveLength(0);
    expect(lastText(game)).toContain('; drew 2 cards');
  });

  it('a "may" step skipped: Skip leaves one entry and no pending effect, and the table as the play left it', () => {
    const start = played();
    const skipped = dispatch(start, { type: 'playEffectSkip' });
    expect(skipped.log).toHaveLength(1);
    expect(skipped.table).toBe(start.table);
    expect(pendingPlayEffectOf(skipped)).toBeNull();
    expect(lastText(skipped)).toBe('Played Enabran Tain "Retired" Spymaster at Mission 0 (cost 3); skipped its play text');
  });

  it('Done after the draw skips the discard', () => {
    const done = dispatch(dispatch(played(), { type: 'playEffectDraw', count: 1 }), { type: 'playEffectSkip' });
    expect(lastText(done)).toContain('; drew 1 card, then skipped the discard');
    expect(pendingPlayEffectOf(done)).toBeNull();
  });

  it('a reload keeps the effect pending before any step, and keeps the record after Skip', () => {
    const reload = (game: GameState) =>
      gameReducer(initialGameState(initialTableState), { type: 'restore', state: game.table, log: JSON.parse(JSON.stringify(game.log)) });
    expect(pendingPlayEffectOf(reload(played()))?.id).toBe('tain');
    const skipped = reload(dispatch(played(), { type: 'playEffectSkip' }));
    expect(pendingPlayEffectOf(skipped)).toBeNull();
    expect(lastText(skipped)).toContain('skipped its play text');
  });

  it('a malformed record is dropped and the move kept', () => {
    const game = played();
    const entry = game.log[0] as Extract<LogEntry, { kind: 'move' }>;
    const broken = { ...entry, moves: [{ ...entry.moves[0], effects: [{ steps: 'x' }] }] } as unknown as LogEntry;
    expect(logEntryText(broken)).toBe('Played Enabran Tain "Retired" Spymaster at Mission 0 (cost 3)');
    expect(pendingPlayEffectOf({ ...game, log: [broken] })?.id).toBe('tain');
  });

  it('records a condition not met, and the player may resolve it anyway', () => {
    const game = played(table({ requires: 'navigation' }));
    expect(pendingPlayEffectOf(game)?.condition?.status).toBe('notMet');
    const drew = dispatch(game, { type: 'playEffectDraw', count: 2 });
    expect(lastText(drew)).toContain('; drew 2 cards (condition not met)');
  });

  it('a personnel with no model plays as now: no record and nothing pending', () => {
    const game = played(table(), 'other');
    expect(pendingPlayEffectOf(game)).toBeNull();
    expect(gameReducer(game, { type: 'playEffectSkip' })).toBe(game);
    expect(lastText(game)).toBe('Played Plain Personnel at Mission 0 (cost 3)');
  });

  it('a cancelled play has nothing pending', () => {
    const game = played();
    const cancelled: LogEntry = { kind: 'playCancelled', card: 'Enabran Tain "Retired" Spymaster', target: { entry: 0, move: 0, card: 0 }, turn: 1, segment: 'playAndDraw' };
    expect(pendingPlayEffectOf({ ...game, log: [...game.log, cancelled] })).toBeNull();
  });

  it('a later play, the card leaving the table and the end of the segment end it', () => {
    const later = dispatch(played(), { type: 'move', id: 'other', to: AWAY_TEAM });
    expect(pendingPlayEffectOf(later)).toBeNull();
    const game = played();
    expect(pendingPlayEffectOf({ ...game, table: { ...game.table, segment: 'orders' } })).toBeNull();
    const left = gameReducer(game, { type: 'move', id: 'tain', to: 'discard' });
    expect(pendingPlayEffectOf(left)).toBeNull();
  });

  it('holds the next-turn button while it is pending', () => {
    const game = played();
    expect(gameReducer(game, { type: 'advanceSegment' })).toBe(game);
    const skipped = dispatch(game, { type: 'playEffectSkip' });
    expect(gameReducer(skipped, { type: 'advanceSegment' }).table.segment).toBe('orders');
  });

  it('after a correction of the charge, the effect writes one entry of its own, whose undo takes back the effect only', () => {
    const corrected = gameReducer(played(), { type: 'correctCharge', target: { entry: 0, move: 0, card: 0 }, cost: 1 });
    expect(corrected.log).toHaveLength(2);
    const drew = dispatch(corrected, { type: 'playEffectDraw', count: 3 });
    const done = dispatch(drew, { type: 'playEffectDiscard', ids: ['h1', 'h2'] });
    expect(done.log).toHaveLength(3);
    expect(lastText(done)).toBe('Enabran Tain "Retired" Spymaster: drew 3 cards, then discarded Tricorder and Phaser');
    expect(pendingPlayEffectOf(done)).toBeNull();
    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(corrected.table);
    expect(undone.log).toEqual(corrected.log);
    expect(pendingPlayEffectOf(undone)?.step.step).toBe('draw');
  });

  it('refuses a step out of order or a wrong discard', () => {
    const game = played();
    expect(gameReducer(game, { type: 'playEffectDiscard', ids: ['h1', 'h2'] })).toBe(game);
    const drew = dispatch(game, { type: 'playEffectDraw', count: 1 });
    expect(gameReducer(drew, { type: 'playEffectDraw', count: 1 })).toBe(drew);
    expect(gameReducer(drew, { type: 'playEffectDiscard', ids: ['h1'] })).toBe(drew);
    expect(gameReducer(drew, { type: 'playEffectDiscard', ids: ['h1', 'tain'] })).toBe(drew);
  });
});

describe('the panel of a played card (#1800)', () => {
  const panel = (props: Partial<React.ComponentProps<typeof ResolvingPanel>>) =>
    render(
      <DndContext>
        <ResolvingPanel instance={TAIN} hidden={false} escapeActive={false} onViewTable={jest.fn()} {...props} />
      </DndContext>
    );

  it('shows the text, the condition, the draw-up-to stepper and Skip, and no Discard, Remove from game or Cancel', () => {
    const onDraw = jest.fn();
    const onEnd = jest.fn();
    panel({
      step: { step: 'drawUpTo', max: 7, deck: 5, onDraw },
      played: { text: 'You may draw up to seven cards.', condition: 'Condition met: x', started: false, endable: true, skippable: true, onEnd },
    });
    expect(screen.getByTestId('resolve-play-text')).toHaveTextContent('You may draw up to seven cards.');
    expect(screen.getByTestId('resolve-condition')).toHaveTextContent('Condition met: x');
    expect(screen.getByTestId('resolve-draw-count')).toHaveTextContent('5');
    expect(screen.getByTestId('resolve-draw-plus')).toBeDisabled();
    fireEvent.click(screen.getByTestId('resolve-draw-minus'));
    fireEvent.click(screen.getByTestId('resolve-draw'));
    expect(onDraw).toHaveBeenCalledWith(4);
    expect(screen.queryByTestId('resolving-discard')).toBeNull();
    expect(screen.queryByTestId('resolving-remove-from-game')).toBeNull();
    expect(screen.queryByTestId('resolving-cancel')).toBeNull();
    expect(screen.getByTestId('resolving-card')).not.toHaveAttribute('data-card-id');
    fireEvent.click(screen.getByTestId('resolving-skip'));
    expect(onEnd).toHaveBeenCalled();
  });

  it('the discard step picks exactly its count, and Done ends the effect once a step was taken', () => {
    const onDiscard = jest.fn();
    panel({
      step: { step: 'discardFromHand', count: 2, hand: [TRICORDER, PHASER, OTHER], onDiscard },
      played: { text: 't', condition: null, started: true, endable: true, skippable: false, onEnd: jest.fn() },
    });
    const button = screen.getByTestId('resolve-discard');
    expect(button).toBeDisabled();
    const cards = screen.getAllByTestId('resolve-hand-card');
    fireEvent.click(cards[0]);
    fireEvent.click(cards[2]);
    fireEvent.click(cards[1]);
    expect(cards[1]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onDiscard).toHaveBeenCalledWith(['h1', 'other']);
    expect(screen.getByTestId('resolving-done')).toBeInTheDocument();
    expect(screen.queryByTestId('resolve-condition')).toBeNull();
  });
});

// Issue #1808: the kind "discard from hand", a step that is no "may", with Leeta Rebel Supporter's title.
describe('the "when you play" kind discard from hand (#1808)', () => {
  const LEETA = personnel('leeta', 'Leeta Rebel Supporter');

  it('models the titles whose whole clause is "discard a card from hand", and not one that does more', () => {
    for (const name of ['Leeta Rebel Supporter *VP', 'Jake Sisko Reporter Behind the Lines (SS)', 'Kira Nerys Reformed Collaborator', 'Odo Wayward Link', 'Tora Ziyal Beloved Daughter', 'Quark Resistance Informant (R2)']) {
      expect(playModelOf(name)).toMatchObject({ kind: 'discardFromHand', discard: 1, text: 'Discard a card from hand.' });
    }
    expect(playModelOf('Niala Intelligence Asset')).toMatchObject({ kind: 'discardFromHand', discard: 2 });
    expect(playModelOf('Modern Galor')).toBeUndefined();
    expect(playModelOf('Bennet')).toBeUndefined();
    expect(playStepsOf(playModelOf('Leeta Rebel Supporter')!)).toEqual([{ step: 'discard', may: false }]);
  });

  it('asks for N cards, or the whole hand when it holds fewer', () => {
    const niala = playModelOf('Niala Intelligence Asset')!;
    expect(discardCount(niala, 5)).toBe(2);
    expect(discardCount(niala, 1)).toBe(1);
    expect(discardCount(niala, 0)).toBe(0);
  });

  it('a play leaves the discard pending; the discard makes one entry, and one undo returns both cards to the hand', () => {
    const start = played(table({ hand: [TRICORDER, PHASER, LEETA] }), 'leeta');
    const before = start.undo[start.undo.length - 1];
    expect(start.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['leeta']);
    expect(pendingPlayEffectOf(start)).toMatchObject({ id: 'leeta', step: { step: 'discard', may: false } });
    expect(gameReducer(start, { type: 'playEffectSkip' })).toBe(start);
    expect(gameReducer(start, { type: 'playEffectDiscard', ids: ['h1', 'h2'] })).toBe(start);
    const done = dispatch(start, { type: 'playEffectDiscard', ids: ['h2'] });
    expect(done.log).toHaveLength(1);
    expect(done.table.discard.map((c) => c.id)).toEqual(['h2']);
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(lastText(done)).toBe('Played Leeta Rebel Supporter at Mission 0 (cost 3); discarded Phaser');
    const undone = gameReducer(done, { type: 'undo' });
    expect(undone.table).toBe(before);
    expect(undone.table.hand.map((c) => c.id)).toEqual(['h1', 'h2', 'leeta']);
  });

  it('with an empty hand, Done ends the effect and the record says nothing was discarded', () => {
    const start = played(table({ hand: [LEETA] }), 'leeta');
    expect(pendingPlayEffectOf(start)?.step.step).toBe('discard');
    const done = dispatch(start, { type: 'playEffectSkip' });
    expect(pendingPlayEffectOf(done)).toBeNull();
    expect(done.log).toHaveLength(1);
    expect(lastText(done)).toBe('Played Leeta Rebel Supporter at Mission 0 (cost 3); discarded no card');
  });

  it('the panel shows no Skip before the discard, and Done with an empty hand', () => {
    const { unmount } = render(
      <DndContext>
        <ResolvingPanel
          instance={LEETA}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'discardFromHand', count: 1, hand: [TRICORDER], onDiscard: jest.fn() }}
          played={{ text: 'Discard a card from hand.', condition: null, started: false, endable: false, skippable: false, onEnd: jest.fn() }}
        />
      </DndContext>
    );
    expect(screen.getByTestId('resolve-step-discard')).toBeInTheDocument();
    expect(screen.queryByTestId('resolving-skip')).toBeNull();
    expect(screen.queryByTestId('resolving-done')).toBeNull();
    unmount();
    const onEnd = jest.fn();
    render(
      <DndContext>
        <ResolvingPanel
          instance={LEETA}
          hidden={false}
          escapeActive={false}
          onViewTable={jest.fn()}
          step={{ step: 'discardFromHand', count: 0, hand: [], onDiscard: jest.fn() }}
          played={{ text: 'Discard a card from hand.', condition: null, started: false, endable: true, skippable: false, onEnd }}
        />
      </DndContext>
    );
    expect(screen.getByTestId('resolve-step-discard')).toHaveTextContent('Your hand is empty');
    fireEvent.click(screen.getByTestId('resolving-done'));
    expect(onEnd).toHaveBeenCalled();
  });
});

// Resolved → Remove from game (#1730): an event whose text removes it from the game goes to the discard
// pile, marked removed from the game as the discard pile's Remove from game marks it, in one batch and one
// log entry that one undo takes back.
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import {
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  tableReducer,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  resolvedRemoveFromGameAction,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { fromSavedGame, toSavedGame, toSavedHistory } from '../../../app/decks/practice/savedGame';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { removesItselfFromGame } from '../../../lib/playCost';
import { DeckList } from '../../../types';

const cardRows = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  const col = (h: string) => head.indexOf(h);
  return rows.map((r) => ({
    name: r[col('Name')],
    originalName: r[col('Name')],
    type: r[col('Type')].toLowerCase(),
    cost: r[col('Cost')],
    collectorsinfo: r[col('CollectorsInfo')],
    gametext: r[col('gametext')] ?? '',
  }));
})();

const cardNamed = (name: string) => {
  const found = cardRows.find((r) => r.name === name);
  if (!found) throw new Error(`no card ${name}`);
  return found;
};

// The page reads the card data lowercased (`useDataFetching`).
const lowercased = (name: string) => {
  const row = cardNamed(name);
  return { ...row, gametext: row.gametext.toLowerCase() };
};

describe('removesItselfFromGame (#1730)', () => {
  it.each(['Ferengi Tradition', 'Your Fear Will Destroy You', 'Common Purpose', 'Tacking Into the Wind'])(
    'is true for %s, as written and lowercased',
    (name) => {
      expect(removesItselfFromGame(cardNamed(name))).toBe(true);
      expect(removesItselfFromGame(lowercased(name))).toBe(true);
    }
  );

  // Relentless Charge plays in the core and may remove itself later; Vindictive Reprise removes itself at
  // the start of the next turn.
  it.each(['These Are The Voyages', 'At What Cost?', 'Relentless Charge', 'Vindictive Reprise', 'At an Impasse', 'Dreadnought'])(
    'is false for %s, as written and lowercased',
    (name) => {
      expect(removesItselfFromGame(cardNamed(name))).toBe(false);
      expect(removesItselfFromGame(lowercased(name))).toBe(false);
    }
  );

  it('matches exactly the events whose text has the sentence', () => {
    const sentence = cardRows.filter((r) => r.gametext.includes('Remove this event from the game')).map((r) => r.name);
    expect(sentence.length).toBeGreaterThan(0);
    expect(cardRows.filter((r) => removesItselfFromGame({ ...r, gametext: r.gametext.toLowerCase() })).map((r) => r.name)).toEqual(
      sentence
    );
  });

  it('is false for a card of any other type, and for no card', () => {
    expect(removesItselfFromGame({ type: 'interrupt', gametext: 'Remove this event from the game.' })).toBe(false);
    expect(removesItselfFromGame(undefined)).toBe(false);
  });
});

const ferengi = cardNamed('Ferengi Tradition');
const voyages = cardNamed('These Are The Voyages');
const inst = (id: string, card: any): CardInstance => ({ id, card: { ...card }, face: 'up' });
const slots = (): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, () => ({ mission: null, ships: [], awayTeam: [], underMission: [] }));
const table = (): TableState => ({
  ...initialTableState,
  missions: slots(),
  hand: [inst('card-1', ferengi)],
  discard: [inst('card-2', voyages)],
});

const run = (start: TableState | GameState, ...actions: GameAction[]): GameState =>
  actions.reduce(
    (state, action) => gameReducer(state, withShuffleOrders(state.table, action, state.log)),
    'log' in start ? start : initialGameState(start)
  );

describe('Resolved → Remove from game (#1730)', () => {
  const played = () => run(table(), { type: 'move', id: 'card-1', to: 'resolving' });

  it('discards the event marked, as a discard and the discard pile panel do, in one entry', () => {
    const before = played();
    const removed = run(before, resolvedRemoveFromGameAction('card-1'));
    expect(removed.table.resolving).toBeNull();
    expect(removed.table.discard.map((c) => c.id)).toEqual(['card-2', 'card-1']);
    expect(removed.table.discard[1].removedFromGame).toBe(true);
    const byHand = tableReducer(
      tableReducer(before.table, { type: 'move', id: 'card-1', to: 'discard' }),
      { type: 'setRemovedFromGame', ids: ['card-1'], removedFromGame: true }
    );
    expect(removed.table).toEqual(byHand);
    expect(removed.log).toHaveLength(before.log.length + 1);
    expect(logEntryText(removed.log[removed.log.length - 1])).toBe('Resolved Ferengi Tradition, and removed it from the game');
    expect(turnCounters(removed.log, 1).spent).toBe(turnCounters(before.log, 1).spent);
  });

  it('is taken back by one undo, with no mark, and redo removes it again', () => {
    const removed = run(played(), resolvedRemoveFromGameAction('card-1'));
    const undone = gameReducer(removed, { type: 'undo' });
    expect(undone.table.resolving?.id).toBe('card-1');
    expect(undone.table.resolving?.removedFromGame).toBeUndefined();
    expect(undone.log).toHaveLength(removed.log.length - 1);
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table).toEqual(removed.table);
  });

  it('keeps the plain discard text for Resolved → Discard', () => {
    const discarded = run(played(), { type: 'move', id: 'card-1', to: 'discard' });
    expect(logEntryText(discarded.log[discarded.log.length - 1])).toBe(
      'Resolved Ferengi Tradition, and it went to the discard pile'
    );
  });

  it('saves and restores the entry with the same text', () => {
    const removed = run(played(), resolvedRemoveFromGameAction('card-1'));
    const deck: DeckList = { ferengi: { count: 1, row: ferengi }, voyages: { count: 1, row: voyages } };
    const json = JSON.stringify(toSavedGame(removed.table, deck, 'builder', undefined, undefined, removed.log));
    const restored = fromSavedGame(json, deck, toSavedHistory(removed, deck))!;
    expect(restored.log.map(logEntryText)).toEqual(removed.log.map(logEntryText));
    expect(restored.table.discard.find((c) => c.id === 'card-1')?.removedFromGame).toBe(true);
  });
});

describe('ResolvingPanel (#1730)', () => {
  const noop = () => {};
  it('shows Resolved → Remove from game first, before Resolved → Discard, when given', () => {
    render(
      <ResolvingPanel
        instance={inst('card-1', ferengi)}
        hidden={false}
        escapeActive={false}
        onDiscard={noop}
        onRemoveFromGame={noop}
        onCancel={noop}
        onViewTable={noop}
      />
    );
    const remove = screen.getByTestId('resolving-remove-from-game');
    expect(remove).toHaveTextContent('Resolved → Remove from game');
    const discard = screen.getByTestId('resolving-discard');
    expect(remove.compareDocumentPosition(discard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows only Resolved → Discard otherwise', () => {
    render(
      <ResolvingPanel instance={inst('card-1', voyages)} hidden={false} escapeActive={false} onDiscard={noop} onCancel={noop} onViewTable={noop} />
    );
    expect(screen.queryByTestId('resolving-remove-from-game')).toBeNull();
    expect(screen.getByTestId('resolving-discard')).toBeInTheDocument();
  });
});

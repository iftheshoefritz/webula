import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  resolveStageOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { downloadCopyOf } from '../../../app/decks/practice/personnelChoice';
import { ResolvingPanel } from '../../../app/decks/practice/ResolvingPanel';
import { resolveModelOf } from '../../../lib/resolveModels';

// Issue #1746: Second Edition downloads a copy (a card of the same title) of a personnel the player
// commands, shuffles the draw deck, draws a card when that personnel is [AU], and goes to the discard pile,
// in one entry and one undo. With invented personnel.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, icons = '', extra: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2', affiliation: 'federation', icons }, extra);
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const SECOND_EDITION = card('ev', { type: 'event', name: 'second edition', originalName: 'Second Edition', cost: '1' });

// The away team holds Ann, a personnel, and Bo, an [AU] personnel, stopped when `boStopped`; the brig holds Cy.
// The draw deck holds a copy of each, Ann's a later version of the same title, and four other cards.
function table(deck?: CardInstance[], { boStopped = false }: { boStopped?: boolean } = {}): TableState {
  return {
    ...initialTableState,
    hand: [card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder', cost: '1' })],
    drawDeck: deck ?? [
      deckCard('d1'),
      person('ann2', 'Ann Invented *VP'),
      deckCard('d2'),
      person('bo2', 'Bo Invented', '[AU][TNG]', { face: 'down' }),
      person('cy2', 'Cy Invented'),
      deckCard('d3'),
      deckCard('d4'),
    ],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: i === 0 ? [person('ann', 'Ann Invented'), person('bo', 'Bo Invented', '[AU][TNG]', { stopped: boStopped }), person('dee', 'Dee Invented')] : [],
      underMission: [],
    })),
    brig: [person('cy', 'Cy Invented')],
    resolving: SECOND_EDITION,
  };
}

function resolvingGame(t: TableState): GameState {
  const { resolving } = t;
  const before = { ...t, resolving: null, hand: [...t.hand, resolving!] };
  const play = withShuffleOrders(before, { type: 'move', id: resolving!.id, to: 'resolving' }, []);
  return gameReducer(initialGameState(before), play);
}

const download = (game: GameState, personnelId: string, order?: string[]) => {
  const action: GameAction = { type: 'effectStep', personnelId, ...(order ? { order } : {}) };
  return gameReducer(game, withShuffleOrders(game.table, action, game.log));
};

describe('the Second Edition model (#1746)', () => {
  it('is a download of a copy, with a draw for an [AU] personnel, and has the one step', () => {
    expect(resolveModelOf('Second Edition')?.steps).toEqual([
      { kind: 'download', of: { kind: 'copyOfCommanded' }, upTo: 1, to: { kind: 'hand' } },
      { kind: 'shuffle' },
      { kind: 'draw', count: { kind: 'ifPickedIcon', icon: '[au]', count: 1 } },
    ]);
    expect(resolveStageOf(resolvingGame(table()))?.lead.kind).toBe('download');
  });

  it('finds the copy by title, for an unstopped commanded personnel, never the brig', () => {
    const t = table();
    expect(downloadCopyOf(t, 'ann')?.id).toBe('ann2');
    expect(downloadCopyOf(t, 'bo')?.id).toBe('bo2');
    // #1942: a stopped personnel's title is a characteristic it cannot use (Glossary › "stopped", p. 20).
    expect(downloadCopyOf(table(undefined, { boStopped: true }), 'bo')).toBeNull();
    expect(downloadCopyOf(t, 'dee')).toBeNull();
    expect(downloadCopyOf(t, 'cy')).toBeNull();
    expect(downloadCopyOf(t, 'nobody')).toBeNull();
  });

  it('chooses the shuffle on the page: an order of the draw deck less the copy', () => {
    const game = resolvingGame(table());
    const action = withShuffleOrders(game.table, { type: 'effectStep', personnelId: 'ann' }, game.log);
    expect(action.type === 'effectStep' && [...action.order!].sort()).toEqual(['bo2', 'cy2', 'd1', 'd2', 'd3', 'd4']);
  });
});

describe('the download (#1746)', () => {
  const order = ['d4', 'cy2', 'd1', 'bo2', 'd2', 'd3'];

  it('takes the copy, shuffles in the carried order, draws nothing for a personnel that is not [AU], in one entry', () => {
    const game = resolvingGame(table());
    const after = download(game, 'ann', order);
    expect(after.table.hand.map((c) => c.id)).toEqual(['h1', 'ann2']);
    expect(after.table.drawDeck.map((c) => c.id)).toEqual(order);
    expect(after.table.discard.map((c) => c.id)).toEqual(['ev']);
    expect(after.table.resolving).toBeNull();
    expect(resolveStageOf(after)).toBeNull();
    expect(after.log).toHaveLength(game.log.length + 1);
    const entry = after.log[after.log.length - 1];
    expect(logEntryText(entry)).toBe(
      'Downloaded Ann Invented (Second Edition), shuffled the draw deck, and Second Edition went to the discard pile'
    );
    expect(isLogEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);

    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(game.table);
    expect(undone.log).toEqual(game.log);
    expect(gameReducer(undone, { type: 'redo' }).table).toEqual(after.table);
  });

  it('refuses a stopped personnel (#1942)', () => {
    const game = resolvingGame(table(undefined, { boStopped: true }));
    expect(download(game, 'bo')).toBe(game);
  });

  it('draws the top card of the shuffled deck for an [AU] personnel', () => {
    const after = download(resolvingGame(table()), 'bo', ['d4', 'ann2', 'cy2', 'd1', 'd2', 'd3']);
    expect(after.table.hand.map((c) => c.id)).toEqual(['h1', 'bo2', 'd4']);
    expect(after.table.drawDeck).toHaveLength(5);
    expect(logEntryText(after.log[after.log.length - 1])).toBe(
      'Downloaded Bo Invented (Second Edition), shuffled the draw deck, drew 1 card, and Second Edition went to the discard pile'
    );
  });

  it('draws 0 when the copy was the whole deck, and still finishes', () => {
    const after = download(resolvingGame(table([person('bo2', 'Bo Invented', '[AU]')])), 'bo');
    expect(after.table.hand.map((c) => c.id)).toEqual(['h1', 'bo2']);
    expect(after.table.resolving).toBeNull();
  });

  it('changes nothing for a personnel with no copy, in the brig, unknown, or with nothing resolving', () => {
    const game = resolvingGame(table());
    for (const id of ['dee', 'cy', 'nobody']) expect(download(game, id)).toBe(game);
    const idle = { ...game, table: { ...game.table, resolving: null } };
    expect(download(idle, 'ann')).toBe(idle);
    expect(gameReducer(game, { type: 'effectStep' })).toBe(game);
  });
});

describe('the panel step (#1746)', () => {
  it('disables the personnel with no copy, and downloads the chosen one', () => {
    const t = table();
    const onDownload = jest.fn();
    render(
      <DndContext>
        <ResolvingPanel
          instance={SECOND_EDITION}
          hidden={false}
          escapeActive={false}
          onDiscard={jest.fn()}
          onCancel={jest.fn()}
          onViewTable={jest.fn()}
          step={{
            step: 'download',
            groups: [
              {
                key: 'awayTeam-0',
                label: 'Away team at Moab IV',
                cards: t.missions[0].awayTeam.map((c) => ({ id: c.id, name: String(c.card.originalName), affiliation: 'federation', card: c })),
              },
            ],
            available: (id) => downloadCopyOf(t, id) !== null,
            onDownload,
          }}
        />
      </DndContext>
    );
    const rows = screen.getAllByTestId('resolve-personnel');
    expect(rows.map((r) => r.hasAttribute('disabled'))).toEqual([false, false, true]);
    expect(rows[2]).toHaveTextContent('no copy in the draw deck');
    const button = screen.getByTestId('resolve-download');
    expect(button).toBeDisabled();
    fireEvent.click(rows[2]);
    expect(button).toBeDisabled();
    fireEvent.click(rows[1]);
    fireEvent.click(button);
    expect(onDownload).toHaveBeenCalledWith('bo');
    expect(screen.getByTestId('resolving-cancel')).toBeInTheDocument();
  });
});

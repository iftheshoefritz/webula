import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { GameState, gameReducer, initialGameState, isLogEntry, logEntryText, resolveStepOf, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { exchangeCandidatesOf } from '../../../app/decks/practice/personnelChoice';
import { ResolvingPanel, ResolveStep } from '../../../app/decks/practice/ResolvingPanel';
import { resolveModelOf } from '../../../lib/resolveModels';

// Issue #1765: Vidiian Organ Bank exchanges a [Vid] personnel of the hand with an unstopped [Vid] personnel
// the player commands, in one entry and one undo. With invented personnel.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, affiliation = 'vidiian', extra: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2', affiliation }, extra);
const ORGAN_BANK = card('ev', { type: 'event', name: 'vidiian organ bank', originalName: 'Vidiian Organ Bank', cost: '0' });
const SHIP = card('ship', { type: 'ship', name: 'invented cruiser', originalName: 'Invented Cruiser', cost: '3' });

// The hand holds Hal, a [Vid] personnel, Fed, a Federation one, and a Tricorder. The away team at Moab IV holds
// Amo ([Vid]) and Sto ([Vid], stopped); the crew at Bilana System holds Cru ([Vid]) and Kor (Klingon); the brig
// holds Bri ([Vid]).
function table(overrides: Partial<TableState> = {}): TableState {
  return {
    ...initialTableState,
    hand: [person('hal', 'Hal Invented'), person('fed', 'Fed Invented', 'federation'), card('h1', { type: 'equipment', name: 'tricorder', originalName: 'Tricorder' })],
    drawDeck: [card('d1', { type: 'event', name: 'card d1', originalName: 'Card d1' }, { face: 'down' })],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission:
        i === 0
          ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' })
          : i === 2
            ? card('m2', { type: 'mission', name: 'bilana system', originalName: 'Bilana System', missiontype: 's' })
            : null,
      ships: i === 2 ? [{ ...SHIP, crew: [person('cru', 'Cru Invented'), person('kor', 'Kor Invented', 'klingon')] }] : [],
      awayTeam: i === 0 ? [person('amo', 'Amo Invented'), person('sto', 'Sto Invented', 'vidiian', { stopped: true })] : [],
      underMission: [],
    })),
    brig: [person('bri', 'Bri Invented')],
    resolving: ORGAN_BANK,
    ...overrides,
  };
}

function resolvingGame(t: TableState): GameState {
  const { resolving } = t;
  const before = { ...t, resolving: null, hand: [...t.hand, resolving!] };
  const play = withShuffleOrders(before, { type: 'move', id: resolving!.id, to: 'resolving' }, []);
  return gameReducer(initialGameState(before), play);
}

const exchange = (game: GameState, handId: string, tableId: string) => gameReducer(game, { type: 'resolveExchange', handId, tableId });

describe('the Vidiian Organ Bank model (#1765)', () => {
  it('is an exchange of Vidiian personnel, with the one step', () => {
    expect(resolveModelOf('Vidiian Organ Bank')).toEqual({ kind: 'exchange', title: 'Vidiian Organ Bank', affiliation: 'vidiian' });
    expect(resolveStepOf(resolvingGame(table()))).toBe('exchange');
  });

  it('lists the [Vid] personnel of the hand, and the unstopped ones commanded, by place, never the brig', () => {
    const { hand, groups } = exchangeCandidatesOf(table(), 'vidiian');
    expect(hand.map((c) => c.id)).toEqual(['hal']);
    expect(groups.map((g) => [g.label, g.cards.map((c) => c.id)])).toEqual([
      ['Away team at Moab IV', ['amo']],
      ['Crew of Invented Cruiser at Bilana System', ['cru']],
    ]);
  });

  it('counts a personnel of several affiliations for each', () => {
    const t = table({ hand: [person('dual', 'Dual Invented', 'vidiian/federation')] });
    expect(exchangeCandidatesOf(t, 'vidiian').hand.map((c) => c.id)).toEqual(['dual']);
  });
});

describe('the exchange (#1765)', () => {
  it('with a crew personnel: each takes the other place, the event goes to the discard pile, in one entry and one undo', () => {
    const game = resolvingGame(table());
    const after = exchange(game, 'hal', 'cru');
    expect(after.table.hand.map((c) => c.id)).toEqual(['fed', 'h1', 'cru']);
    expect(after.table.missions[2].ships[0].crew!.map((c) => c.id)).toEqual(['kor', 'hal']);
    expect(after.table.missions[2].ships[0].crew!.find((c) => c.id === 'hal')!.stopped).toBeFalsy();
    expect(after.table.discard.map((c) => c.id)).toEqual(['ev']);
    expect(after.table.resolving).toBeNull();
    expect(resolveStepOf(after)).toBeNull();
    expect(after.log).toHaveLength(game.log.length + 1);
    const entry = after.log[after.log.length - 1];
    expect(logEntryText(entry)).toBe('Exchanged Hal Invented for Cru Invented, and Vidiian Organ Bank went to the discard pile');
    expect(isLogEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);

    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(game.table);
    expect(undone.log).toEqual(game.log);
  });

  it('with an away team personnel: the hand personnel joins the end of that away team', () => {
    const after = exchange(resolvingGame(table()), 'hal', 'amo');
    expect(after.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['sto', 'hal']);
    expect(after.table.hand.map((c) => c.id)).toContain('amo');
  });

  it('refuses a stopped, a brig, a non-[Vid], a non-personnel or an unknown card, and a second exchange', () => {
    const game = resolvingGame(table());
    for (const [handId, tableId] of [
      ['hal', 'sto'],
      ['hal', 'bri'],
      ['hal', 'kor'],
      ['fed', 'cru'],
      ['h1', 'cru'],
      ['hal', 'nobody'],
      ['nobody', 'cru'],
      ['cru', 'hal'],
    ]) {
      expect(exchange(game, handId, tableId)).toBe(game);
    }
    const after = exchange(game, 'hal', 'cru');
    expect(exchange(after, 'cru', 'amo')).toBe(after);
    expect(gameReducer(game, { type: 'resolveDraw' })).toBe(game);
  });

  it('reads a malformed entry with its defaults', () => {
    const entry = { kind: 'resolveExchanged', event: 1, fromHand: null, turn: 1, segment: 'playAndDraw' } as unknown as GameState['log'][number];
    expect(logEntryText(entry)).toBe('Exchanged a personnel for a personnel, and the event went to the discard pile');
  });
});

describe('the panel step (#1765)', () => {
  const panel = (step: ResolveStep) =>
    render(
      <DndContext>
        <ResolvingPanel instance={ORGAN_BANK} hidden={false} escapeActive={false} onDiscard={jest.fn()} onCancel={jest.fn()} onViewTable={jest.fn()} step={step} />
      </DndContext>
    );

  it('enables Exchange only with one of each picked', () => {
    const onExchange = jest.fn();
    panel({ step: 'exchange', ...exchangeCandidatesOf(table(), 'vidiian'), onExchange });
    const button = screen.getByTestId('resolve-exchange');
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByTestId('resolve-hand-card'));
    expect(button).toBeDisabled();
    const rows = screen.getAllByTestId('resolve-personnel');
    expect(rows.map((r) => r.getAttribute('data-card-choice'))).toEqual(['amo', 'cru']);
    fireEvent.click(rows[1]);
    fireEvent.click(button);
    expect(onExchange).toHaveBeenCalledWith('hal', 'cru');
    expect(screen.getByTestId('resolving-cancel')).toBeInTheDocument();
  });

  it('says which side is empty and shows no button', () => {
    panel({ step: 'exchange', hand: [], groups: exchangeCandidatesOf(table(), 'vidiian').groups, onExchange: jest.fn() });
    expect(screen.getByTestId('resolve-exchange-empty')).toHaveTextContent('No [Vid] personnel in your hand');
    expect(screen.queryByTestId('resolve-exchange')).toBeNull();
    expect(screen.getByTestId('resolving-discard')).toBeInTheDocument();
  });

  it('says so when no unstopped [Vid] personnel is commanded', () => {
    panel({ step: 'exchange', hand: exchangeCandidatesOf(table(), 'vidiian').hand, groups: [], onExchange: jest.fn() });
    expect(screen.getByTestId('resolve-exchange-empty')).toHaveTextContent('No unstopped [Vid] personnel you command');
  });
});

// Issue #1826: The Crossing, "To play this event, you must command three [SF] personnel or three [Xin] personnel.
// Replace one of your personnel with a personnel of the same affiliation from your hand. Place the personnel you
// replaced in your discard pile. Destroy this event." The same exchange step, with a matching affiliation, and the
// replaced personnel to the discard pile.
describe('The Crossing (#1826)', () => {
  const CROSSING = card('tc', { type: 'event', name: 'the crossing', originalName: 'The Crossing', cost: '2' });
  const crossing = (overrides: Partial<TableState> = {}) => table({ resolving: CROSSING, ...overrides });

  it('is an exchange of any matching affiliation, whose replaced personnel goes to the discard pile', () => {
    expect(resolveModelOf('The Crossing')).toEqual({ kind: 'exchange', title: 'The Crossing', replacedTo: 'discard' });
    expect(resolveStepOf(resolvingGame(crossing()))).toBe('exchange');
  });

  it('lists the personnel of each side that share an affiliation with one of the other, never a stopped one nor the brig', () => {
    // Hal ([Vid]) matches Amo and Cru; Fed (Federation) matches nobody; Kor (Klingon) matches nobody in the hand.
    const { hand, groups } = exchangeCandidatesOf(crossing());
    expect(hand.map((c) => c.id)).toEqual(['hal']);
    expect(groups.map((g) => g.cards.map((c) => c.id))).toEqual([['amo'], ['cru']]);
    const withKlingon = exchangeCandidatesOf(crossing({ hand: [person('kh', 'Klingon Hand', 'klingon'), person('fed', 'Fed Invented', 'federation')] }));
    expect(withKlingon.hand.map((c) => c.id)).toEqual(['kh']);
    expect(withKlingon.groups.map((g) => g.cards.map((c) => c.id))).toEqual([['kor']]);
  });

  it('replaces: the table personnel to the discard pile, the hand personnel to its place, the event after it, one entry and one undo', () => {
    const game = resolvingGame(crossing());
    const after = exchange(game, 'hal', 'cru');
    expect(after.table.missions[2].ships[0].crew!.map((c) => c.id)).toEqual(['kor', 'hal']);
    expect(after.table.hand.map((c) => c.id)).toEqual(['fed', 'h1']);
    expect(after.table.discard.map((c) => c.id)).toEqual(['cru', 'tc']);
    expect(after.table.resolving).toBeNull();
    expect(after.log).toHaveLength(game.log.length + 1);
    const entry = after.log[after.log.length - 1];
    expect(logEntryText(entry)).toBe('Replaced Cru Invented with Hal Invented, Cru Invented went to the discard pile, and The Crossing went to the discard pile');
    expect(isLogEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);
    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(game.table);
  });

  it('refuses two personnel of different affiliations, a stopped one and the brig', () => {
    const game = resolvingGame(crossing({ hand: [person('hal', 'Hal Invented'), person('kh', 'Klingon Hand', 'klingon')] }));
    for (const [handId, tableId] of [
      ['kh', 'cru'],
      ['hal', 'kor'],
      ['hal', 'sto'],
      ['hal', 'bri'],
    ]) {
      expect(exchange(game, handId, tableId)).toBe(game);
    }
    expect(exchange(game, 'kh', 'kor').table.discard.map((c) => c.id)).toEqual(['kor', 'tc']);
  });

  it('leaves Vidiian Organ Bank sending its personnel to the hand', () => {
    const after = exchange(resolvingGame(table()), 'hal', 'cru');
    expect(after.table.hand.map((c) => c.id)).toContain('cru');
    expect(after.table.discard.map((c) => c.id)).toEqual(['ev']);
  });

  describe('the panel', () => {
    const panel = (t: TableState, onExchange = jest.fn()) => {
      const all = (id: string) => t.missions.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((sh) => sh.crew ?? [])]).find((c) => c.id === id);
      const matches = (handId: string, tableId: string) =>
        String(t.hand.find((c) => c.id === handId)?.card.affiliation) === String(all(tableId)?.card.affiliation);
      render(
        <DndContext>
          <ResolvingPanel
            instance={CROSSING}
            hidden={false}
            escapeActive={false}
            onDiscard={jest.fn()}
            onCancel={jest.fn()}
            onViewTable={jest.fn()}
            step={{ step: 'exchange', ...exchangeCandidatesOf(t), onExchange, replace: { matches } }}
          />
        </DndContext>
      );
      return onExchange;
    };

    it('disables the hand personnel that do not match the picked one, and replaces', () => {
      const onExchange = panel(crossing({ hand: [person('hal', 'Hal Invented'), person('kh', 'Klingon Hand', 'klingon')] }));
      const rows = screen.getAllByTestId('resolve-personnel');
      expect(rows.map((r) => r.getAttribute('data-card-choice'))).toEqual(['amo', 'cru', 'kor']);
      expect(rows[0]).toHaveTextContent('to the discard pile');
      fireEvent.click(rows[2]);
      const handCards = screen.getAllByTestId('resolve-hand-card');
      expect(handCards.map((c) => c.getAttribute('data-card-choice'))).toEqual(['hal', 'kh']);
      expect(handCards[0]).toBeDisabled();
      expect(handCards[1]).not.toBeDisabled();
      fireEvent.click(handCards[1]);
      const button = screen.getByTestId('resolve-exchange');
      expect(button).toHaveTextContent('Replace');
      fireEvent.click(button);
      expect(onExchange).toHaveBeenCalledWith('kh', 'kor');
    });

    it('says so when no personnel of the hand matches one commanded', () => {
      panel(crossing({ hand: [person('fed', 'Fed Invented', 'federation')] }));
      expect(screen.getByTestId('resolve-exchange-empty')).toHaveTextContent('No personnel in your hand shares an affiliation');
      expect(screen.queryByTestId('resolve-exchange')).toBeNull();
    });
  });
});

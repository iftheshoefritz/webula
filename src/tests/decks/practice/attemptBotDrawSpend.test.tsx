// Issue #1291: in a bot game the attempt popup sets the bot's Draw and Spend, the attempt keeps
// them, the save keeps them, and the strip shows them.
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttemptDialog } from '../../../app/decks/practice/AttemptPanel';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { drawSpendText } from '../../../app/decks/practice/drawSpend';
import { tableReducer, initialTableState, Attempt, MissionSlot, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

describe('drawSpendText (#1291)', () => {
  it('reads draw/spend N when both are N, and names both when they differ', () => {
    expect(drawSpendText(9, 9)).toBe('draw/spend 9');
    expect(drawSpendText(9, 6)).toBe('draw 9, spend 6');
  });
});

describe('AttemptDialog in a bot game (#1291)', () => {
  const renderDialog = (bot: boolean) => {
    const onStart = jest.fn();
    render(<AttemptDialog mission="Bilana System" personnel={12} subtract={3} bot={bot} onStart={onStart} onCancel={() => {}} />);
    return onStart;
  };

  it('starts Draw and Spend at N and has them follow Personnel and Subtract until edited', () => {
    renderDialog(true);
    expect(screen.getByTestId('attempt-bot-draw')).toHaveValue('9');
    expect(screen.getByTestId('attempt-bot-spend')).toHaveValue('9');
    expect(screen.getByTestId('attempt-result')).toHaveTextContent(/^draw\/spend 9$/);
    fireEvent.change(screen.getByTestId('attempt-subtract'), { target: { value: '2' } });
    expect(screen.getByTestId('attempt-bot-draw')).toHaveValue('10');
    expect(screen.getByTestId('attempt-bot-spend')).toHaveValue('10');
  });

  it('keeps an edited number while the other follows, and starts with both', () => {
    const onStart = renderDialog(true);
    fireEvent.change(screen.getByTestId('attempt-bot-spend'), { target: { value: '6' } });
    expect(screen.getByTestId('attempt-result')).toHaveTextContent(/^draw 9, spend 6$/);
    fireEvent.change(screen.getByTestId('attempt-personnel'), { target: { value: '10' } });
    expect(screen.getByTestId('attempt-bot-draw')).toHaveValue('7');
    expect(screen.getByTestId('attempt-bot-spend')).toHaveValue('6');
    fireEvent.click(screen.getByRole('button', { name: 'Increase draw' }));
    fireEvent.change(screen.getByTestId('attempt-personnel'), { target: { value: '20' } });
    expect(screen.getByTestId('attempt-bot-draw')).toHaveValue('8');
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(20, 3, { botDraw: 8, botSpend: 6 });
  });

  it('disables Start while either field holds no whole number', () => {
    const onStart = renderDialog(true);
    fireEvent.change(screen.getByTestId('attempt-bot-draw'), { target: { value: '' } });
    expect(screen.getByTestId('attempt-start')).toBeDisabled();
    fireEvent.change(screen.getByTestId('attempt-bot-draw'), { target: { value: '0' } });
    expect(screen.getByTestId('attempt-start')).toBeEnabled();
    fireEvent.change(screen.getByTestId('attempt-bot-spend'), { target: { value: '' } });
    expect(screen.getByTestId('attempt-start')).toBeDisabled();
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows neither field in a game with a deck\'s dilemmas, and starts with no bot numbers', () => {
    const onStart = renderDialog(false);
    expect(screen.queryByTestId('attempt-bot-draw')).toBeNull();
    expect(screen.queryByTestId('attempt-bot-spend')).toBeNull();
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(12, 3);
  });
});

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides });

describe('the attempt keeps the bot numbers (#1291)', () => {
  const deck = {
    mission: { count: 1, row: { collectorsinfo: '1M1', name: 'Mission', type: 'mission', missiontype: 'p' } },
  } as any;
  const dealt = (): TableState => ({
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
      slot({ mission: i === 0 ? { id: 'card-1', card: { ...deck.mission.row }, face: 'up' } : null })
    ),
  });
  const start = { type: 'startAttempt', missionIndex: 0, personnel: 12, subtract: 3 } as const;

  it('stores botDraw and botSpend from startAttempt, and neither key without them', () => {
    expect(tableReducer(dealt(), { ...start, botDraw: 9, botSpend: 6 }).attempt).toMatchObject({ botDraw: 9, botSpend: 6 });
    const plain = tableReducer(dealt(), start).attempt!;
    expect('botDraw' in plain).toBe(false);
    expect('botSpend' in plain).toBe(false);
  });

  it('round-trips the bot numbers through the save, and drops an attempt with a bad one', () => {
    const t = tableReducer(dealt(), { ...start, botDraw: 9, botSpend: 6 });
    expect(fromSavedGame(JSON.stringify(toSavedGame(t, deck, 'builder')), deck)!.table.attempt).toEqual(t.attempt);
    const save = toSavedGame(t, deck, 'builder');
    const bad = { ...save, table: { ...save.table, attempt: { ...t.attempt!, botDraw: -1 } } };
    expect(fromSavedGame(JSON.stringify(bad), deck)!.table.attempt).toBeUndefined();
  });
});

describe('the attempt strip in a bot game (#1291)', () => {
  const mission = slot({ mission: { id: 'm2', card: { name: 'Bilana System', originalName: 'Bilana System', imagefile: 'm2' }, face: 'up' } as any });
  const face = computeAttemptLayout(667, 280, false, 0, 1);
  const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, true) };
  const noop = () => {};
  const renderStrip = (attempt: Attempt) =>
    render(
      <AttemptLayout
        attempt={attempt}
        slot={mission}
        sizes={sizes}
        personnelCount={12}
        desktop={false}
        dilemmaStack={null}
        layoutRef={noop}
        stripRef={noop}
        onViewFullTable={noop}
        onEndAttempt={noop}
        onOpenPile={noop}
        onShipClick={noop}
        onOpenShipRow={noop}
        onOpenPlacedOn={noop}
        onFlipMission={noop}
        onSetMissionCompleted={noop}
        selectedIds={[]}
        onToggleSelect={noop}
        onSetStopped={noop}
        onShuffle={noop}
        moveDestinations={[]}
        onMoveSelection={noop}
        canDrawDilemma
        onDrawDilemma={noop}
        onSetPhase={noop}
      />
    );
  const base: Attempt = { missionIndex: 2, personnel: 12, subtract: 3, phase: 'choose', drawn: 0 };

  it('shows the bot numbers', () => {
    renderStrip({ ...base, botDraw: 9, botSpend: 6 });
    expect(screen.getByTestId('attempt-draw-spend')).toHaveTextContent(/^draw 9, spend 6$/);
  });

  it('shows draw/spend N without them', () => {
    renderStrip(base);
    expect(screen.getByTestId('attempt-draw-spend')).toHaveTextContent(/^draw\/spend 9$/);
  });
});

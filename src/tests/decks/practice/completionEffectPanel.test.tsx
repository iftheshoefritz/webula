import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CompletionEffectPanel } from '../../../app/decks/practice/CompletionEffectPanel';
import { completionEffectOf } from '../../../app/decks/practice/completionEffects';
import { initialTableState, type CardInstance, type MissionSlot, MISSION_SLOTS, type TableState } from '../../../app/decks/practice/tableReducer';

// The panel of a completion effect (#1757), with invented personnel.

const inst = (id: string, name: string, type: string, extra: Record<string, string> = {}): CardInstance => ({
  id,
  card: { name: name.toLowerCase(), originalName: name, type, ...extra },
  face: 'up',
});
const slots = (overrides: Partial<MissionSlot>[]): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides[i] }));
const person = (id: string, name: string, cost: number) => inst(id, name, 'personnel', { cost: String(cost), unique: 'Y', affiliation: 'federation' });

const renderPanel = (table: TableState) => {
  const onComplete = jest.fn();
  const onClose = jest.fn();
  render(<CompletionEffectPanel table={table} missionIndex={0} effect={completionEffectOf(table, 0)!} onComplete={onComplete} onClose={onClose} />);
  return { onComplete, onClose };
};
const pick = (id: string) => fireEvent.click(document.querySelector(`[data-card-choice="${id}"]`)!);

describe('the completion effect panel (#1757)', () => {
  const aldea = (): TableState => ({
    ...initialTableState,
    missions: slots([
      {
        mission: inst('m0', 'Aldea Aid Legendary Civilization', 'mission', { missiontype: 'p' }),
        awayTeam: [person('p1', 'Ann Invented', 7), person('p2', 'Bo Invented', 6)],
        involved: ['p1', 'p2'],
      },
    ]),
  });

  it('shows the total, disables Confirm past the cap, and confirms the picks in order', () => {
    const { onComplete } = renderPanel(aldea());
    expect(screen.getByTestId('completion-effect-text').textContent).toMatch(/up to 12 total cost/);
    const confirm = screen.getByTestId('completion-effect-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    pick('p2');
    pick('p1');
    expect(screen.getByTestId('completion-effect-total').textContent).toBe('Total cost 13 of 12');
    expect(confirm.disabled).toBe(true);
    pick('p1');
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onComplete).toHaveBeenCalledWith([{ type: 'move', id: 'p2', to: 'drawDeck', position: 'bottom' }]);
  });

  it('completes with no effect on Skip, and Escape cancels with nothing done', () => {
    const { onComplete, onClose } = renderPanel(aldea());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('completion-effect-skip'));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('lists no one with no attempt at the mission', () => {
    renderPanel({ ...aldea(), missions: slots([{ ...aldea().missions[0], involved: undefined }]) });
    expect(screen.queryAllByTestId('completion-effect-candidate')).toHaveLength(0);
    expect(screen.getByText('No personnel involved.')).toBeTruthy();
  });

  it('Bassen Rift needs its own press to destroy the ships, and Discard needs a pick', () => {
    const t: TableState = {
      ...initialTableState,
      missions: slots([
        {
          mission: inst('m0', 'Bassen Rift Interdict Genocidal Praetor', 'mission', { missiontype: 's' }),
          ships: [{ ...inst('s1', 'An Invented Ship', 'ship'), crew: [person('p1', 'Ann Invented', 4), person('p2', 'Bo Invented', 3)] }],
          involved: ['p1', 'p2'],
        },
      ]),
    };
    const { onComplete } = renderPanel(t);
    expect(screen.getAllByTestId('completion-effect-candidate').map((b) => b.getAttribute('data-card-choice'))).toEqual(['p1']);
    expect((screen.getByTestId('completion-effect-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('completion-effect-destroy'));
    expect(onComplete).toHaveBeenCalledWith([{ type: 'move', id: 's1', to: 'discard' }]);
  });
});

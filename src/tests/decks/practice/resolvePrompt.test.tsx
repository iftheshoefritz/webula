// The prompt mode of a resolving event (#1870): `presentationOf`, the candidate row and the prompt alone.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ResolveCandidates, ResolvePrompt, presentationOf } from '../../../app/decks/practice/ResolvePrompt';
import type { ResolveStep } from '../../../app/decks/practice/ResolvingPanel';
import type { CardInstance } from '../../../app/decks/practice/tableReducer';
import { resolveModelOf } from '../../../lib/resolveModels';

const personnel = (id: string, name: string, cost: string): CardInstance =>
  ({ id, key: id, card: { type: 'personnel', name: name.toLowerCase(), originalName: name, cost, affiliation: 'federation' } as any } as any);

const drawStep = (onDraw = jest.fn()): Extract<ResolveStep, { step: 'draw' }> => ({
  step: 'draw',
  groups: [
    {
      key: 'awayTeam-0',
      label: 'Away team at Earth',
      place: 'Earth',
      cards: [
        { id: 'p0', name: 'Ensign Zero', affiliation: 'federation', card: personnel('p0', 'Ensign Zero', '0') },
        { id: 'p3', name: 'Data', affiliation: 'federation', card: personnel('p3', 'Data', '3') },
      ],
    },
  ],
  onDraw,
});

describe('presentationOf (#1870)', () => {
  const bottom: ResolveStep = { step: 'bottom', count: 3, hand: [], onPlace: () => {} };
  it('is the prompt for These Are The Voyages, in its draw and bottom steps', () => {
    expect(presentationOf(resolveModelOf('These Are The Voyages'), drawStep())).toBe('prompt');
    expect(presentationOf(resolveModelOf('These Are The Voyages'), bottom)).toBe('prompt');
  });
  it('is the panel for Miracle Working, of the same kind, for every other model, and with no step', () => {
    expect(presentationOf(resolveModelOf('Miracle Working'), { step: 'draw', groups: [], fixed: 4, onDraw: () => {} })).toBe('panel');
    expect(presentationOf(resolveModelOf('Miracle Working'), bottom)).toBe('panel');
    expect(presentationOf(resolveModelOf('Days of Atonement'), { step: 'discardDraw', draw: 2, hand: [], onDiscardDraw: () => {} })).toBe('panel');
    expect(presentationOf(resolveModelOf('These Are The Voyages'), undefined)).toBe('panel');
    expect(presentationOf(undefined, drawStep())).toBe('panel');
  });
});

describe('the candidate row and the prompt (#1870)', () => {
  it('keeps a cost-0 candidate enabled, and Draw 0 dispatches its id', () => {
    const onDraw = jest.fn();
    const step = drawStep(onDraw);
    const onPick = jest.fn();
    const { rerender } = render(
      <>
        <ResolvePrompt step={step} picks={[]} chipShown={false} hidden={false} escapeActive onCollapse={() => {}} onCancel={() => {}} />
        <ResolveCandidates step={step} picked={null} bottom={100} hidden={false} onPick={onPick} />
      </>
    );
    const zero = screen.getAllByTestId('resolve-candidate')[0];
    expect(zero).toHaveAttribute('data-card-id', 'p0');
    expect(zero).toHaveAttribute('data-place', 'Earth');
    expect(zero).not.toBeDisabled();
    fireEvent.click(zero);
    expect(onPick).toHaveBeenCalledWith('p0');
    rerender(
      <>
        <ResolvePrompt step={step} picks={['p0']} chipShown={false} hidden={false} escapeActive onCollapse={() => {}} onCancel={() => {}} />
        <ResolveCandidates step={step} picked="p0" bottom={100} hidden={false} onPick={onPick} />
      </>
    );
    const done = screen.getByTestId('resolve-prompt-done');
    expect(done).toHaveTextContent('Draw 0');
    expect(done).not.toBeDisabled();
    fireEvent.click(done);
    expect(onDraw).toHaveBeenCalledWith('p0');
  });

  it('hands the picks to onPlace in tap order, and hides Cancel in the bottom step', () => {
    const onPlace = jest.fn();
    render(
      <ResolvePrompt
        step={{ step: 'bottom', count: 3, hand: [], onPlace }}
        picks={['c', 'a', 'b']}
        chipShown={false}
        hidden={false}
        escapeActive
        onCollapse={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByTestId('resolve-prompt-cancel')).toBeNull();
    expect(screen.getByTestId('resolve-prompt-count')).toHaveTextContent('3 of 3');
    fireEvent.click(screen.getByTestId('resolve-prompt-done'));
    expect(onPlace).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('collapses on Escape, and does nothing on Escape while hidden by a drag', () => {
    const onCollapse = jest.fn();
    const props = { step: drawStep(), picks: [], chipShown: false, escapeActive: true, onCollapse, onCancel: () => {} };
    const { rerender } = render(<ResolvePrompt {...props} hidden />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCollapse).not.toHaveBeenCalled();
    rerender(<ResolvePrompt {...props} hidden={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});

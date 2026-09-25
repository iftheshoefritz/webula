import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CardHoldProvider, useCardHold, HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';

// jsdom has no PointerEvent, so `fireEvent.pointerMove` would drop `clientX`/`clientY`.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

// A card with the hold on it, and a readout of the page state the hold drives (#763).
function Harness({ dndPointerDown = () => {}, onTap = () => {} }: { dndPointerDown?: () => void; onTap?: () => void }) {
  const [held, setHeld] = useState<string | null>(null);
  const callbacks = React.useMemo(() => ({ startHold: (id: string) => setHeld(id), endHold: () => setHeld(null) }), []);
  return (
    <CardHoldProvider value={callbacks}>
      <Card id="card-1" dndPointerDown={dndPointerDown} onTap={onTap} />
      <div data-testid="elsewhere" />
      <span data-testid="held">{held ?? 'none'}</span>
    </CardHoldProvider>
  );
}

function Card({ id, dndPointerDown, onTap }: { id: string; dndPointerDown: () => void; onTap: () => void }) {
  const listeners = useCardHold(id, { onPointerDown: dndPointerDown });
  return (
    <button type="button" onClick={onTap} {...listeners}>
      card
    </button>
  );
}

const held = () => screen.getByTestId('held').textContent;
const card = () => screen.getByRole('button', { name: 'card' });
const press = (init: PointerEventInit = {}) => fireEvent.pointerDown(card(), { clientX: 10, clientY: 10, button: 0, ...init });

describe('useCardHold', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    delete (navigator as { vibrate?: unknown }).vibrate;
  });

  it('shows the card after 500 ms of holding, and the release hides it', () => {
    render(<Harness />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS - 1));
    expect(held()).toBe('none');
    act(() => jest.advanceTimersByTime(1));
    expect(held()).toBe('card-1');
    fireEvent.pointerUp(window);
    expect(held()).toBe('none');
  });

  it('a release before 500 ms shows nothing and still taps', () => {
    const onTap = jest.fn();
    render(<Harness onTap={onTap} />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS - 1));
    fireEvent.pointerUp(card());
    fireEvent.click(card());
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(held()).toBe('none');
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('calls dnd-kit\'s own onPointerDown too', () => {
    const dndPointerDown = jest.fn();
    render(<Harness dndPointerDown={dndPointerDown} />);
    press();
    expect(dndPointerDown).toHaveBeenCalledTimes(1);
  });

  it('a move of more than 8 px before the timer fires cancels the hold', () => {
    render(<Harness />);
    press();
    fireEvent.pointerMove(window, { clientX: 19, clientY: 10 });
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(held()).toBe('none');
  });

  it('a small move, even off the card, keeps the same card in the preview', () => {
    render(<Harness />);
    press();
    fireEvent.pointerMove(window, { clientX: 14, clientY: 14 });
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    fireEvent.pointerMove(screen.getByTestId('elsewhere'), { clientX: 16, clientY: 10 });
    expect(held()).toBe('card-1');
  });

  it.each([
    ['pointercancel', () => fireEvent.pointerCancel(window)],
    ['a second pointer going down', () => fireEvent.pointerDown(screen.getByTestId('elsewhere'), { pointerId: 2 })],
    ['the window losing focus', () => fireEvent.blur(window)],
    [
      'the tab becoming hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        fireEvent(document, new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      },
    ],
  ])('%s ends the hold', (_name, endIt) => {
    render(<Harness />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(held()).toBe('card-1');
    act(() => endIt());
    expect(held()).toBe('none');
  });

  it('swallows the click that follows a hold\'s release', () => {
    const onTap = jest.fn();
    render(<Harness onTap={onTap} />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    fireEvent.pointerUp(card());
    fireEvent.click(card());
    expect(onTap).not.toHaveBeenCalled();
    // The next tap goes through.
    press();
    fireEvent.pointerUp(card());
    fireEvent.click(card());
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('vibrates when navigator.vibrate exists', () => {
    const vibrate = jest.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    render(<Harness />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(vibrate).toHaveBeenCalled();
  });

  it('does not throw when navigator.vibrate is missing', () => {
    render(<Harness />);
    press();
    expect(() => act(() => jest.advanceTimersByTime(HOLD_DELAY_MS))).not.toThrow();
    expect(held()).toBe('card-1');
  });

  it('prevents the context menu on the card', () => {
    render(<Harness />);
    const notCancelled = fireEvent.contextMenu(card());
    expect(notCancelled).toBe(false);
  });
});

import React, { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CardHoldProvider, useCardHold, HOLD_DELAY_MS, HOVER_DELAY_MS } from '../../../app/decks/practice/useCardHold';

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
function Harness({
  dndPointerDown = () => {},
  onTap = () => {},
  showCard = true,
}: {
  dndPointerDown?: () => void;
  onTap?: () => void;
  showCard?: boolean;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const callbacks = React.useMemo(
    () => ({
      startHold: (id: string) => setHeld(id),
      endHold: () => setHeld(null),
      startHover: (id: string) => setHovered(id),
      endHover: (id: string) => setHovered((current) => (current === id ? null : current)),
    }),
    []
  );
  return (
    <CardHoldProvider value={callbacks}>
      {showCard && <Card id="card-1" dndPointerDown={dndPointerDown} onTap={onTap} />}
      <div data-testid="elsewhere" />
      <span data-testid="held">{held ?? 'none'}</span>
      <span data-testid="hovered">{hovered ?? 'none'}</span>
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
    fireEvent.pointerMove(window, { clientX: 19, clientY: 10, buttons: 1 });
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(held()).toBe('none');
  });

  it('a small move, even off the card, keeps the same card in the preview', () => {
    render(<Harness />);
    press();
    fireEvent.pointerMove(window, { clientX: 14, clientY: 14, buttons: 1 });
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    fireEvent.pointerMove(screen.getByTestId('elsewhere'), { clientX: 16, clientY: 10, buttons: 1 });
    expect(held()).toBe('card-1');
  });

  it.each([
    ['pointercancel', () => fireEvent.pointerCancel(window)],
    ['a second pointer going down', () => fireEvent.pointerDown(screen.getByTestId('elsewhere'), { pointerId: 2 })],
    ['the window losing focus', () => fireEvent.blur(window)],
    // The signs of a release the page never saw (#776).
    ['touchend', () => fireEvent.touchEnd(window)],
    ['touchcancel', () => fireEvent.touchCancel(window)],
    ['the press losing its pointer capture', () => fireEvent(window, new PointerEvent('lostpointercapture', { pointerId: 1 }))],
    ['a pointermove with no button down', () => fireEvent.pointerMove(window, { clientX: 10, clientY: 10, buttons: 0 })],
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

  it('a lost pointer capture for another pointer does not end the hold', () => {
    render(<Harness />);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    act(() => {
      fireEvent(window, new PointerEvent('lostpointercapture', { pointerId: 2 }));
    });
    expect(held()).toBe('card-1');
  });

  it('the press that ends a fired hold has its click swallowed, and only that one (#776)', () => {
    const onElsewhere = jest.fn();
    render(<Harness />);
    const elsewhere = screen.getByTestId('elsewhere');
    elsewhere.addEventListener('click', onElsewhere);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    // The release is lost. The next press closes the preview and does nothing else.
    fireEvent.pointerDown(elsewhere, { pointerId: 2 });
    expect(held()).toBe('none');
    fireEvent.pointerUp(elsewhere, { pointerId: 2 });
    fireEvent.click(elsewhere);
    act(() => jest.advanceTimersByTime(0));
    expect(onElsewhere).not.toHaveBeenCalled();
    // The tap after that acts.
    fireEvent.pointerDown(elsewhere, { pointerId: 3 });
    fireEvent.pointerUp(elsewhere, { pointerId: 3 });
    fireEvent.click(elsewhere);
    expect(onElsewhere).toHaveBeenCalledTimes(1);
  });

  it('a press while the hold timer is still pending is an ordinary tap', () => {
    const onElsewhere = jest.fn();
    render(<Harness />);
    const elsewhere = screen.getByTestId('elsewhere');
    elsewhere.addEventListener('click', onElsewhere);
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS - 1));
    fireEvent.pointerDown(elsewhere, { pointerId: 2 });
    fireEvent.pointerUp(elsewhere, { pointerId: 2 });
    fireEvent.click(elsewhere);
    expect(onElsewhere).toHaveBeenCalledTimes(1);
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

describe('useCardHold: a mouse hover (#766)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const hovered = () => screen.getByTestId('hovered').textContent;
  const enter = (init: PointerEventInit = {}) => fireEvent.pointerEnter(card(), { pointerType: 'mouse', buttons: 0, ...init });
  const leave = () => fireEvent.pointerLeave(card(), { pointerType: 'mouse' });

  it('shows the card after 300 ms of rest, and a leave hides it', () => {
    render(<Harness />);
    enter();
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS - 1));
    expect(hovered()).toBe('none');
    act(() => jest.advanceTimersByTime(1));
    expect(hovered()).toBe('card-1');
    leave();
    expect(hovered()).toBe('none');
  });

  it('a leave before 300 ms shows nothing', () => {
    render(<Harness />);
    enter();
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS - 1));
    leave();
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('none');
  });

  it('a touch or a pen does not hover', () => {
    render(<Harness />);
    enter({ pointerType: 'touch' });
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('none');
    enter({ pointerType: 'pen' });
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('none');
  });

  it('an enter with a button held (a drag passing over) does not hover', () => {
    render(<Harness />);
    enter({ buttons: 1 });
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('none');
  });

  it('a press cancels a pending hover', () => {
    render(<Harness />);
    enter();
    press();
    fireEvent.pointerUp(window);
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('none');
  });

  it('an unmount while hovered ends the hover', () => {
    const { rerender } = render(<Harness />);
    enter();
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    expect(hovered()).toBe('card-1');
    rerender(<Harness showCard={false} />);
    expect(hovered()).toBe('none');
  });

  it('the release of a mouse hold on a hovered card keeps the hover', () => {
    render(<Harness />);
    enter();
    act(() => jest.advanceTimersByTime(HOVER_DELAY_MS));
    press();
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(held()).toBe('card-1');
    fireEvent.pointerUp(window);
    expect(held()).toBe('none');
    expect(hovered()).toBe('card-1');
  });
});

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import CardPreview, { FACE_DOWN_LABEL } from '../../../app/decks/practice/CardPreview';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { cardBorderWidth } from '../../../app/decks/practice/TableCard';
import { previewMaxWidth } from '../../../app/decks/practice/previewSize';
import { FINE_POINTER_QUERY, useFinePointer } from '../../../app/decks/practice/useFinePointer';

// #946, #1458: on a desktop the preview is no taller than 499 px, and the viewers take a fixed width.
const faceDown: CardInstance = {
  id: 'c0',
  card: { name: 'Tricorder', imagefile: 'tricorder' },
  face: 'down',
};

describe('CardPreview desktop size (#946)', () => {
  it('keeps 90% of the screen, and caps the height at 499 px only under (pointer: fine)', () => {
    render(<CardPreview instance={faceDown} />);
    const image = screen.getByTestId('card-preview-enlarged');
    expect(image).toHaveClass('h-[90%]');
    expect(image).toHaveClass('[@media(pointer:fine)]:max-h-(--preview-max-h)');
    expect(image).not.toHaveClass('max-h-(--preview-max-h)');
    expect(screen.getByTestId('card-preview').style.getPropertyValue('--preview-max-h')).toBe('499px');
  });

  it('draws the border at the width of a 499 px tall card (#1458)', () => {
    render(<CardPreview instance={faceDown} />);
    expect(previewMaxWidth()).toBe(Math.round((499 * 120) / 167));
    expect(cardBorderWidth(previewMaxWidth())).toBe(9);
    expect(screen.getByTestId('card-preview-enlarged').style.outline).toBe('9px solid black');
  });

  it('moves the "Face down" badge down with the top of the smaller card only under (pointer: fine)', () => {
    render(<CardPreview instance={faceDown} />);
    const badge = screen.getByText(FACE_DOWN_LABEL);
    expect(badge).toHaveClass('top-[6%]');
    expect(badge).toHaveClass('[@media(pointer:fine)]:top-[max(6%,calc(50%_-_var(--preview-max-h)/2_+_8px))]');
  });
});

function Probe() {
  return <span data-testid="fine">{String(useFinePointer())}</span>;
}

function setMatchMedia(value: typeof window.matchMedia | undefined) {
  (window as { matchMedia?: typeof window.matchMedia }).matchMedia = value;
}

describe('useFinePointer (#946)', () => {
  const original = window.matchMedia;
  afterEach(() => {
    setMatchMedia(original);
  });

  function mockMatchMedia(initial: boolean) {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const state = { matches: initial };
    const matchMedia = jest.fn((query: string) => ({
      matches: query === FINE_POINTER_QUERY && state.matches,
      media: query,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
      removeEventListener: jest.fn(),
    }));
    setMatchMedia(matchMedia as unknown as typeof window.matchMedia);
    return { matchMedia, listeners, state };
  }

  it('is true on a desktop and follows a change of the pointer', () => {
    const { matchMedia, listeners, state } = mockMatchMedia(true);
    render(<Probe />);
    expect(matchMedia).toHaveBeenCalledWith('(pointer: fine)');
    expect(screen.getByTestId('fine')).toHaveTextContent('true');
    state.matches = false;
    act(() => listeners.forEach((l) => l({ matches: false } as MediaQueryListEvent)));
    expect(screen.getByTestId('fine')).toHaveTextContent('false');
  });

  it('is false in a server render, even on a desktop (#1207)', () => {
    mockMatchMedia(true);
    expect(renderToString(<Probe />)).toContain('false');
  });

  it('is false on a touch device', () => {
    mockMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId('fine')).toHaveTextContent('false');
  });

  it('is false when the browser has no matchMedia', () => {
    setMatchMedia(undefined);
    render(<Probe />);
    expect(screen.getByTestId('fine')).toHaveTextContent('false');
  });
});

// #932, #1544: a touch device draws an overlay scrollbar that shows only while a finger moves, so a
// card list panel grid that overflows looked like it held one row of cards. An element that
// overflows hides its native scrollbar, keeps no width for it, and shows the page's own thumb,
// `ScrollIndicator`, over its right edge, outside the scroller. jsdom reports 0 for both heights,
// so a test that needs a grid that overflows gives the scroller its heights.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React from 'react';
import { act, render } from '@testing-library/react';
import CardListPanel, { panelScrollClassName } from '../../../app/decks/practice/CardListPanel';
import { SCROLL_INDICATOR_INSET, SCROLL_INDICATOR_MIN_THUMB, scrollThumb } from '../../../app/decks/practice/ScrollIndicator';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: { collectorsinfo: `1U0${n}`, originalName: `Card ${n}`, type: 'equipment', name: `card ${n}`, imagefile: `card_${n}` },
  }) as unknown as CardInstance;

describe('scrollThumb (#1544)', () => {
  const track = 200 - 2 * SCROLL_INDICATOR_INSET;

  it('gives no thumb when the content fits', () => {
    expect(scrollThumb({ scrollTop: 0, scrollHeight: 200, clientHeight: 200 })).toBeNull();
    expect(scrollThumb({ scrollTop: 0, scrollHeight: 100, clientHeight: 200 })).toBeNull();
  });

  it('makes the thumb the part of the track that is in view', () => {
    expect(scrollThumb({ scrollTop: 0, scrollHeight: 400, clientHeight: 200 })).toEqual({ track, length: track / 2, offset: 0 });
  });

  it('puts the thumb at the top at the top and at the bottom at the bottom', () => {
    expect(scrollThumb({ scrollTop: 0, scrollHeight: 400, clientHeight: 200 })?.offset).toBe(0);
    expect(scrollThumb({ scrollTop: 100, scrollHeight: 400, clientHeight: 200 })?.offset).toBe(track / 4);
    expect(scrollThumb({ scrollTop: 200, scrollHeight: 400, clientHeight: 200 })?.offset).toBe(track / 2);
  });

  it('never makes the thumb shorter than the minimum', () => {
    const thumb = scrollThumb({ scrollTop: 19800, scrollHeight: 20000, clientHeight: 200 });
    expect(thumb?.length).toBe(SCROLL_INDICATOR_MIN_THUMB);
    expect(thumb?.offset).toBe(track - SCROLL_INDICATOR_MIN_THUMB);
  });
});

describe('A card list panel that overflows always shows that it scrolls (#932, #1544)', () => {
  it('hides the native scrollbar of an overflowing element, which still scrolls', () => {
    const classes = panelScrollClassName(true).split(' ');
    expect(classes).toEqual(expect.arrayContaining(['overflow-y-scroll', 'scrollbar-hidden']));
    expect(classes).not.toContain('scrollbar-visible');
    expect(classes).not.toContain('overflow-y-auto');
  });

  it('leaves an element that fits on overflow-y-auto', () => {
    expect(panelScrollClassName(false)).toBe('overflow-y-auto');
  });

  it('shows no indicator on a grid that fits', () => {
    render(
      <CardListPanel location="drawDeck" cards={[makeCard(0), makeCard(1)]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );
    const grid = document.body.querySelector('[data-testid="card-list-panel-drawDeck"]') as HTMLElement;
    expect(grid.className).toMatch(/overflow-y-auto/);
    expect(document.body.querySelector('[data-testid="scroll-indicator"]')).toBeNull();
  });

  it('leaves the dilemma stack popup overflow-hidden, with no indicator', () => {
    render(
      <CardListPanel location="dilemmaStack" cards={[makeCard(0), makeCard(1)]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );
    const grid = document.body.querySelector('[data-testid="card-list-panel-dilemmaStack"]') as HTMLElement;
    expect(grid.className).toMatch(/overflow-hidden/);
    expect(document.body.querySelector('[data-testid="scroll-indicator"]')).toBeNull();
  });

  describe('with a grid that overflows', () => {
    const heights = { scrollHeight: 0, clientHeight: 0 };
    let restore: () => void;
    beforeEach(() => {
      heights.scrollHeight = 0;
      heights.clientHeight = 0;
      const proto = HTMLElement.prototype;
      const saved = {
        scrollHeight: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
        clientHeight: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
      };
      Object.defineProperty(proto, 'scrollHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.dataset.testid === 'card-list-panel-awayTeam' ? heights.scrollHeight : 0;
        },
      });
      Object.defineProperty(proto, 'clientHeight', {
        configurable: true,
        get(this: HTMLElement) {
          return this.dataset.testid === 'card-list-panel-awayTeam' ? heights.clientHeight : 0;
        },
      });
      restore = () => {
        for (const key of ['scrollHeight', 'clientHeight'] as const) {
          const d = saved[key];
          if (d) Object.defineProperty(proto, key, d);
          else delete (proto as unknown as Record<string, unknown>)[key];
        }
      };
    });
    afterEach(() => restore());

    it('draws the thumb beside the scroller, with no pointer events, and moves it on a scroll', () => {
      heights.scrollHeight = 800;
      heights.clientHeight = 200;
      const cards = Array.from({ length: 20 }, (_, n) => makeCard(n));
      render(<CardListPanel location="awayTeam" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />);
      const grid = document.body.querySelector('[data-testid="card-list-panel-awayTeam"]') as HTMLElement;
      expect(grid.className).toMatch(/scrollbar-hidden/);
      const indicator = document.body.querySelector('[data-testid="scroll-indicator"]') as HTMLElement;
      expect(indicator).not.toBeNull();
      expect(grid.contains(indicator)).toBe(false);
      expect(indicator.parentElement).toBe(grid.parentElement);
      expect(indicator.className).toMatch(/pointer-events-none/);
      const thumb = document.body.querySelector('[data-testid="scroll-indicator-thumb"]') as HTMLElement;
      expect(thumb.style.top).toBe('0px');
      act(() => {
        grid.scrollTop = 600;
        grid.dispatchEvent(new Event('scroll'));
      });
      const track = 200 - 2 * SCROLL_INDICATOR_INSET;
      expect(thumb.style.top).toBe(`${track - track / 4}px`);
    });
  });
});

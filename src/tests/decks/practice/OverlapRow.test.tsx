import React from 'react';
import { render } from '@testing-library/react';
import OverlapRow from '../../../app/decks/practice/OverlapRow';
import { offsetFor } from '../../../app/decks/practice/overlapOffset';

// #802: the dilemma stack and the open fan share this row. It packs the cards into its own
// measured width with `offsetFor`.
describe('OverlapRow', () => {
  const items = Array.from({ length: 8 }, (_, i) => `c${i}`);
  const renderRow = () =>
    render(
      <OverlapRow
        items={items}
        keyFor={(id) => id}
        cardWidth={108}
        height={96}
        renderCard={(id) => <span data-testid={id} />}
      />
    );
  const lefts = () => items.map((id) => parseFloat(document.querySelector(`[data-testid="${id}"]`)!.parentElement!.style.left));

  afterEach(() => {
    delete (HTMLElement.prototype as any).clientWidth;
  });

  it('lays the cards out with the offsetFor offset of its measured width', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 500 });
    renderRow();
    const offset = offsetFor(8, 108, 500, 108);
    expect(lefts()).toEqual(items.map((_, i) => i * offset));
  });

  it('puts the cards edge to edge when it measures no width', () => {
    renderRow();
    expect(lefts()).toEqual(items.map((_, i) => i * 108));
  });
});

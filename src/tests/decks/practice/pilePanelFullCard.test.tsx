// #806: a pile panel used to draw the same cropped art the table card draws (`object-cover
// object-top` over a box shorter than the card's own width), so the panel showed the picture but
// none of the card's text. Every panel now draws the whole card image, at the height the image's
// own 120 x 167 ratio gives. This renders `PilePanel` directly, the same way
// `pilePanelScroll.test.tsx` does.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import PilePanel from '../../../app/decks/practice/PilePanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, stopped = false): CardInstance =>
  ({
    id: `card-${n}`,
    stopped,
    face: 'up',
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type: 'personnel',
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

const cardImage = (id: string) =>
  document.body.querySelector(`[data-card-id="${id}"] img`) as HTMLImageElement;

describe('Practice draw: a panel shows the whole card, not the cropped art (#806)', () => {
  it('draws the full card image at the full-card height', () => {
    render(
      <PilePanel zone="pile" cards={[makeCard(0)]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );

    const image = cardImage('card-0');
    expect(image.getAttribute('src')).toBe('/cardimages/card_0.jpg');
    expect(image.style.width).toBe('108px');
    // 108 x 167 / 120, the card image's own ratio: taller than it is wide, unlike the art crop.
    expect(image.style.height).toBe('150px');
    expect(image.className).not.toMatch(/object-cover/);
  });

  it('grows the card with the table scale', () => {
    render(
      <PilePanel
        zone="pile"
        cards={[makeCard(0)]}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        cardWidth={216}
        cardHeight={301}
      />
    );

    const image = cardImage('card-0');
    expect(image.style.width).toBe('216px');
    expect(image.style.height).toBe('301px');
  });

  it('keeps the stopped look on the full card', () => {
    render(
      <PilePanel
        zone="pile"
        cards={[makeCard(0, true)]}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
      />
    );

    expect(cardImage('card-0').className).toMatch(/grayscale/);
  });

  it('draws the card back for a face-down card in a panel that can flip (#762)', () => {
    const down = { ...makeCard(0), face: 'down' } as CardInstance;
    render(
      <PilePanel
        zone="dilemmaStack"
        cards={[down]}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onFlip={() => {}}
      />
    );

    const image = cardImage('card-0');
    expect(image.getAttribute('src')).toBe('/cardimages/cardback.jpg');
    expect(image.style.height).toBe('150px');
  });
});

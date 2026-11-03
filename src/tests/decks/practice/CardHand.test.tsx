jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardHand from '../../../app/decks/practice/CardHand';
import CountBadge from '../../../app/decks/practice/CountBadge';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { VIEWER_TOP_INSET } from '../../../app/decks/practice/viewerCardSize';
import {
  ARC_TOUCH_MIN_VISIBLE,
  ARC_DESKTOP_RAISE,
  ARC_TOUCH_OPTIONS,
  CLOSED_FAN_CORE_CARDS,
  CLOSED_FAN_VISIBLE,
  handArcLayout,
} from '../../../app/decks/practice/handArc';
import { flatCardWidth } from '../../../app/decks/practice/flatRowWidths';

const makeInstances = (n: number): CardInstance[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    card: { name: `Card ${i}`, imagefile: `card_${i}` },
    face: 'up',
  }));

function Harness({
  instances,
  initialOpen = false,
  dragging = false,
  portalContainer,
  bottomInset,
}: {
  instances: CardInstance[];
  initialOpen?: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
  bottomInset?: number;
}) {
  const [open, setOpen] = React.useState(initialOpen);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  return (
    <>
      <CardHand
        instances={instances}
        open={open}
        dragging={dragging}
        portalContainer={portalContainer}
        bottomInset={bottomInset}
        onOpen={() => setOpen(true)}
        onClose={() => {
          setOpen(false);
          setSelectedIds([]);
        }}
        selectedIds={selectedIds}
        onToggleSelect={(id) =>
          setSelectedIds((ids) => (ids.includes(id) ? ids.filter((cardId) => cardId !== id) : [...ids, id]))
        }
      />
    </>
  );
}

describe('CardHand', () => {
  it('opens on a tap of the closed hand', () => {
    render(<Harness instances={makeInstances(3)} />);

    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i }));
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
  });

  // The fan used to sit at the top of the screen (#806), where it covered the mission rows. It
  // now anchors its bottom edge at the inset a card list panel takes (#895, #828), just above the
  // bottom row, and grows upward.
  it('anchors the open fan at the bottom inset it is given, not at the top (#895)', () => {
    render(<Harness instances={makeInstances(3)} initialOpen bottomInset={210} />);

    const fan = document.body.querySelector('[data-zone="hand"]') as HTMLElement;
    expect(fan.style.bottom).toBe('210px');
    expect(fan.style.top).toBe('');
  });

  it('defaults the bottom inset to a card list panel\'s default (#895)', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);

    const fan = document.body.querySelector('[data-zone="hand"]') as HTMLElement;
    expect(fan.style.bottom).toBe(`${VIEWER_TOP_INSET}px`);
  });

  it('closes on a tap outside the open fan', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
  });

  it('a tap on a card in the open fan toggles its selection, the same as its checkbox (#764)', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    const card = screen.getByRole('button', { name: 'Card 1' });
    fireEvent.click(card);
    expect(screen.getByRole('button', { name: 'Deselect Card 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveClass('ring-2');
    fireEvent.click(card);
    expect(screen.queryByRole('button', { name: 'Deselect Card 1' })).toBeNull();
    expect(card).not.toHaveClass('ring-2');
  });

  // #1489: the closed hand is a small fan of card faces, and it reverses the card backs of #639.
  // Its cards carry no `data-card-id`: they are picked up from the open arc.
  it('shows the closed fan as card faces with no data-card-id, and the open fan as card faces', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} />);

    const closedButton = screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i });
    const closedImages = closedButton.querySelectorAll('img');
    expect(closedImages).toHaveLength(3);
    closedImages.forEach((img, idx) => {
      expect(img).toHaveAttribute('src', `/cardimages/${instances[idx].card.imagefile}.jpg`);
    });
    expect(closedButton.querySelector('[data-card-id]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();

    fireEvent.click(closedButton);
    instances.forEach((instance) => {
      expect(document.body.querySelector(`[data-card-id="${instance.id}"] img`)).toHaveAttribute(
        'src',
        `/cardimages/${instance.card.imagefile}.jpg`,
      );
    });
  });

  // #1489: the small fan spans at most two cards of the core, however many cards the hand holds.
  it('keeps the closed fan within two core cards as the card count grows', () => {
    const closedWidth = () =>
      parseFloat((screen.getByRole('button', { name: /tap to open$/i }) as HTMLElement).style.width);
    const { rerender } = render(<Harness instances={makeInstances(2)} />);
    const smallWidth = closedWidth();

    rerender(<Harness instances={makeInstances(20)} />);
    expect(closedWidth()).toBeGreaterThan(smallWidth);
    expect(closedWidth()).toBeLessThanOrEqual(CLOSED_FAN_CORE_CARDS * flatCardWidth(1));
  });

  it('sits at the left end of its anchor, or at the right end for the dilemma hand (#1489)', () => {
    const anchor = document.createElement('div');
    anchor.setAttribute('data-testid', 'fan-anchor');
    anchor.getBoundingClientRect = () =>
      ({ left: 200, right: 700, top: 500, bottom: 580, width: 500, height: 80, x: 200, y: 500, toJSON: () => {} }) as DOMRect;
    document.body.appendChild(anchor);
    const props = { instances: makeInstances(7), open: false, onOpen: () => {}, onClose: () => {} };
    const { unmount } = render(
      <>
        <CardHand {...props} closedFanAnchor='[data-testid="fan-anchor"]' />
        <CardHand {...props} zone="dilemmaHand" label="dilemma hand" closedFanAnchor='[data-testid="fan-anchor"]' closedFanSide="right" />
      </>,
    );
    const hand = screen.getByRole('button', { name: /^hand, 7 cards/ });
    const dilemmaHand = screen.getByRole('button', { name: /^dilemma hand, 7 cards/ });
    const box = (el: HTMLElement) => ({ left: parseFloat(el.style.left), right: parseFloat(el.style.left) + parseFloat(el.style.width) });
    expect(box(hand).left).toBeCloseTo(200, 0);
    expect(box(hand).right).toBeLessThanOrEqual(200 + CLOSED_FAN_CORE_CARDS * flatCardWidth(1) + 0.5);
    expect(box(dilemmaHand).right).toBeCloseTo(700, 0);
    expect(box(dilemmaHand).left).toBeGreaterThanOrEqual(700 - CLOSED_FAN_CORE_CARDS * flatCardWidth(1) - 0.5);
    // Neither is a focus layer: no backdrop.
    expect(screen.queryByRole('button', { name: /^close/i })).not.toBeInTheDocument();
    unmount();
    anchor.remove();
  });

  it('sits in the middle of the screen with closedFanSide "center" (#1496)', () => {
    const anchor = document.createElement('div');
    anchor.setAttribute('data-testid', 'fan-anchor');
    anchor.getBoundingClientRect = () =>
      ({ left: 200, right: 700, top: 500, bottom: 580, width: 500, height: 80, x: 200, y: 500, toJSON: () => {} }) as DOMRect;
    document.body.appendChild(anchor);
    const { unmount } = render(
      <CardHand
        instances={makeInstances(7)}
        open={false}
        onOpen={() => {}}
        onClose={() => {}}
        closedFanAnchor='[data-testid="fan-anchor"]'
        closedFanSide="center"
      />,
    );
    const hand = screen.getByRole('button', { name: /^hand, 7 cards/ });
    const centre = parseFloat(hand.style.left) + parseFloat(hand.style.width) / 2;
    expect(Math.abs(centre - window.innerWidth / 2)).toBeLessThanOrEqual(1);
    unmount();
    anchor.remove();
  });

  // On a touch screen, the browser sends the rest of a touch's events to the element where the
  // touch started. If the drag start removes that card from the document, WebKit's events stop
  // bubbling to the document, where dnd-kit listens, and the drop never happens.
  it('keeps the dragged card in the document after a drag closes the hand', () => {
    const instances = makeInstances(3);
    const props = { instances, onOpen: () => {}, onClose: () => {} };
    const { rerender } = render(<CardHand {...props} open />);
    const draggedCard = document.body.querySelector(`[data-card-id="${instances[1].id}"]`);
    expect(draggedCard).not.toBeNull();

    // When the drag starts, the page closes the hand and sets `dragging` in the same update.
    rerender(<CardHand {...props} open={false} dragging />);

    expect(draggedCard!.isConnected).toBe(true);
    // The kept fan is hidden: no backdrop, no second hand zone, and no accessible card buttons.
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card 1' })).not.toBeInTheDocument();
    expect(document.body.querySelectorAll('[data-zone="hand"]')).toHaveLength(1);
  });

  it('removes the hidden fan after the drag ends', () => {
    const instances = makeInstances(3);
    const { rerender } = render(<Harness instances={instances} dragging />);
    expect(document.body.querySelector('[data-card-id]')).not.toBeNull();

    rerender(<Harness instances={instances} />);
    expect(document.body.querySelector('[data-card-id]')).toBeNull();
  });

  // The bottom row has a CSS transform, which would make the fan's `fixed` position relative
  // to the row. So the fan goes in a portal on the given container.
  it('renders the open fan in the portal container, outside the closed hand', () => {
    const portalContainer = document.createElement('div');
    document.body.appendChild(portalContainer);
    const { container } = render(<Harness instances={makeInstances(3)} initialOpen portalContainer={portalContainer} />);

    expect(portalContainer.querySelector('[data-zone="hand"] [data-card-id]')).not.toBeNull();
    expect(container.querySelector('[data-card-id]')).toBeNull();
    portalContainer.remove();
  });

  // #691: each card in the open fan carries the same select checkbox a card list panel's cards do
  // (#677), so several cards can be checked and dragged together.
  it('shows a card as selected once its checkbox is tapped', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    // #1015: an unselected card shows no checkbox.
    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));

    expect(screen.getByRole('button', { name: 'Deselect Card 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card 2$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Deselect Card 1' }));

    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card/ })).toBeNull();
  });

  it('a tap on the checkbox does not open the card preview', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect Card 1' }));

    expect(screen.queryByTestId('previewed')).not.toBeInTheDocument();
  });

  it('clears the selection when the hand is closed', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));
    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i }));

    expect(screen.queryByRole('button', { name: 'Deselect Card 1' })).toBeNull();
  });

  it('disables the closed hand when it has no cards', () => {
    render(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeDisabled();
  });

  it('shows a count badge on the closed hand, and an empty placeholder instead when it is empty during a drag', () => {
    const { rerender } = render(<Harness instances={makeInstances(3)} />);
    expect(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i })).toHaveTextContent('3');

    rerender(<Harness instances={[]} dragging />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toHaveTextContent('Empty');
  });

  // #929: the empty marker only helps while a drag runs, so it hides the rest of the time. The
  // closed row keeps its size, so nothing in the bottom row moves as the marker comes and goes.
  it('hides the empty placeholder when no drag runs, and keeps the closed row its size (#929)', () => {
    const { rerender } = render(<Harness instances={[]} />);
    const hand = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(hand).not.toHaveTextContent('Empty');
    expect(hand.querySelector('.border-dashed')).toBeNull();
    const idleSize = { width: hand.style.width, height: hand.style.height };

    rerender(<Harness instances={[]} dragging />);
    expect(hand).toHaveTextContent('Empty');
    expect({ width: hand.style.width, height: hand.style.height }).toEqual(idleSize);

    rerender(<Harness instances={[]} />);
    expect(hand).not.toHaveTextContent('Empty');
  });

  // #750: a pile's `CountBadge` used to draw on top of the open hand and dilemma hand, because
  // the badge's z-index outranked the fan's and the backdrop's. Rather than pin this to the
  // exact pair of literal values, assert the relationship that has to hold: the open fan and its
  // backdrop must both outrank the highest z-index a `CountBadge` can render.
  it('draws the open fan and its backdrop above a pile count badge (#750)', () => {
    const parseZIndex = (className: string) => {
      const match = className.match(/z-\[(\d+)\]/);
      return match ? Number(match[1]) : null;
    };

    const { container: badgeContainer } = render(<CountBadge count={3} />);
    const badgeZIndex = parseZIndex(badgeContainer.querySelector('span')!.className);
    expect(badgeZIndex).not.toBeNull();

    render(<Harness instances={makeInstances(3)} initialOpen />);
    const backdropZIndex = parseZIndex(screen.getByRole('button', { name: /^close hand$/i }).className);
    const fanZIndex = parseZIndex(document.body.querySelector('[data-zone="hand"]')!.className);

    expect(backdropZIndex).not.toBeNull();
    expect(fanZIndex).not.toBeNull();
    expect(backdropZIndex!).toBeGreaterThan(badgeZIndex!);
    expect(fanZIndex!).toBeGreaterThan(badgeZIndex!);
  });

  it('hides the count badge while the hand is open', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);
    expect(document.body.querySelector('[aria-label="hand, 3 cards, tap to open"]')).toHaveStyle({
      visibility: 'hidden',
    });
  });

  // #638: the backdrop covers the whole screen, including the draw deck, so a tap there still
  // draws a card instead of only closing the hand.
  describe('passthroughZone', () => {
    function renderWithPassthroughTarget(onPassthroughClick: () => void) {
      const target = document.createElement('button');
      target.setAttribute('data-zone', 'drawDeck');
      target.getBoundingClientRect = () => ({
        left: 100,
        right: 150,
        top: 100,
        bottom: 150,
        width: 50,
        height: 50,
        x: 100,
        y: 100,
        toJSON: () => {},
      });
      target.addEventListener('click', onPassthroughClick);
      document.body.appendChild(target);
      return target;
    }

    it('forwards a tap on the passthrough zone to it, instead of closing the hand', () => {
      const onPassthroughClick = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={() => {}}
          passthroughZone="drawDeck"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 120, clientY: 120 });

      expect(onPassthroughClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
      target.remove();
    });

    it('still closes the hand when a tap misses the passthrough zone', () => {
      const onPassthroughClick = jest.fn();
      const onClose = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={onClose}
          passthroughZone="drawDeck"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 0, clientY: 0 });

      expect(onPassthroughClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      target.remove();
    });

    // #741: a hand also passes a tap through to the dilemma pile's two halves, so either hand
    // can stay open while the player draws from either pile.
    it('forwards a tap to whichever of several named passthrough zones it lands on', () => {
      const onPassthroughClick = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      target.setAttribute('data-zone', 'dilemma-pile-top');
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={() => {}}
          passthroughZone={['drawDeck', 'dilemma-pile-top', 'dilemma-pile-bottom']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 120, clientY: 120 });

      expect(onPassthroughClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
      target.remove();
    });

    it('still closes the hand when a tap misses every named passthrough zone', () => {
      const onPassthroughClick = jest.fn();
      const onClose = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      target.setAttribute('data-zone', 'dilemma-pile-top');
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={onClose}
          passthroughZone={['drawDeck', 'dilemma-pile-top', 'dilemma-pile-bottom']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 0, clientY: 0 });

      expect(onPassthroughClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      target.remove();
    });
  });

  // #994: the "→ top" and "→ bottom" buttons name the hand's own deck and report the end.
  it('shows the top and bottom buttons for a selection, named for the deck', () => {
    const onSendSelected = jest.fn();
    render(
      <CardHand
        instances={makeInstances(2)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        zone="dilemmaHand"
        selectedIds={['c1']}
        onSendSelected={onSendSelected}
        deckLabel="dilemma pile"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Selected cards to the top of the dilemma pile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selected cards to the bottom of the dilemma pile' }));
    expect(onSendSelected.mock.calls).toEqual([['top'], ['bottom']]);
  });

  // #1013: the row's right end lines up with the right end of the fan, not the screen edge. The
  // row takes the fan's own width, centred as the fan is, and packs its buttons to the right.
  // jsdom measures 0, so `OverlapRow` lays the cards edge to edge: 3 cards take 3 card widths.
  it('lines the top and bottom buttons up with the right end of the fan (#1013)', () => {
    render(
      <CardHand
        instances={makeInstances(3)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        zone="dilemmaHand"
        openCardWidth={100}
        selectedIds={['c1']}
        onSendSelected={() => {}}
        deckLabel="dilemma pile"
      />,
    );
    const row = screen.getByTestId('dilemmaHand-controls');
    expect(row).toHaveStyle({ width: '300px' });
    expect(row).toHaveClass('justify-end');
    expect(row.parentElement).toHaveClass('fixed', 'inset-x-2', 'justify-center');
    expect(row.parentElement).not.toHaveClass('right-2');
  });

  // The row shares the fan's stacking context with the cards, whose `zIndex` runs from 1 to the
  // count. Without a `zIndex` above them, the cards paint over the buttons where the two overlap,
  // as they do at 568 x 320, and a tap on the lower half of a button lands on a card.
  it('stacks the top and bottom buttons above every card of the fan (#1013)', () => {
    render(
      <CardHand
        instances={makeInstances(3)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        selectedIds={['c1']}
        onSendSelected={() => {}}
      />,
    );
    const rowZ = Number(screen.getByTestId('hand-controls').parentElement!.style.zIndex);
    const cardZ = screen
      .getAllByRole('button', { name: /^Card \d+$/ })
      .map((card) => Number((card.closest('[style*="z-index"]') as HTMLElement).style.zIndex));
    expect(cardZ.length).toBe(3);
    expect(rowZ).toBeGreaterThan(Math.max(...cardZ));
  });

  it('shows no top and bottom buttons when no card of the hand is selected', () => {
    render(
      <CardHand
        instances={makeInstances(2)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        selectedIds={['elsewhere']}
        onSendSelected={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Selected cards to the/ })).toBeNull();
  });
});

describe('CardHand as an arc (#1125)', () => {
  it('draws the open hand as an arc centred between the two piles', () => {
    const left = document.createElement('div');
    left.setAttribute('data-testid', 'left-pile');
    left.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 0, width: 100, height: 0, x: 0, y: 0, toJSON: () => ({}) });
    const right = document.createElement('div');
    right.setAttribute('data-testid', 'right-pile');
    right.getBoundingClientRect = () => ({ left: 900, right: 1000, top: 0, bottom: 0, width: 100, height: 0, x: 900, y: 0, toJSON: () => ({}) });
    document.body.append(left, right);

    render(
      <CardHand
        instances={makeInstances(3)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        openCardWidth={108}
        arcBetween={{ left: '[data-testid="left-pile"]', right: '[data-testid="right-pile"]' }}
      />,
    );

    const arc = screen.getByTestId('hand-arc');
    expect(arc).toHaveAttribute('data-zone', 'hand');
    const wrappers = Array.from(arc.children) as HTMLElement[];
    expect(wrappers).toHaveLength(3);
    // The middle card sits centred in the gap, 104 to 896 px.
    const middle = wrappers[1];
    expect(parseFloat(middle.style.left) + 54).toBeCloseTo(500);
    expect(middle.style.transform).toBe('rotate(0deg)');
    expect(wrappers[0].style.transform).toMatch(/rotate\(-/);
    for (const wrapper of wrappers) {
      expect(parseFloat(wrapper.style.left)).toBeGreaterThanOrEqual(104);
    }
    expect(arc.querySelector('[data-card-id="c1"]')).toBeInTheDocument();

    left.remove();
    right.remove();
  });
});

describe('CardHand arc on a touch screen (#1149)', () => {
  const stubPiles = () => {
    const left = document.createElement('div');
    left.setAttribute('data-testid', 'left-pile');
    left.getBoundingClientRect = () => ({ left: 0, right: 100, top: 0, bottom: 0, width: 100, height: 0, x: 0, y: 0, toJSON: () => ({}) });
    const right = document.createElement('div');
    right.setAttribute('data-testid', 'right-pile');
    right.getBoundingClientRect = () => ({ left: 900, right: 1000, top: 0, bottom: 0, width: 100, height: 0, x: 900, y: 0, toJSON: () => ({}) });
    document.body.append(left, right);
    return () => {
      left.remove();
      right.remove();
    };
  };

  // The bounds `useArcBounds` measures from the two stubbed piles.
  const layout = (options: Partial<typeof ARC_TOUCH_OPTIONS & { maxVisible: number }>) =>
    handArcLayout({ count: 3, cardWidth: 108, maxStep: Math.round((108 * 60) / 56), left: 104, right: 896, bottom: window.innerHeight, ...options });

  it.each(['hand', 'dilemmaHand'] as const)('draws the touch arc of the %s, and moves its controls row, with a coarse pointer only (#1149, #1380)', (zone) => {
    const tops: Record<string, { cards: number[]; controls: string }> = {};
    for (const finePointer of [true, false]) {
      const cleanup = stubPiles();
      const { unmount } = render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={() => {}}
          zone={zone}
          openCardWidth={108}
          selectedIds={['c1']}
          onSendSelected={() => {}}
          arcBetween={{ left: '[data-testid="left-pile"]', right: '[data-testid="right-pile"]' }}
          finePointer={finePointer}
        />,
      );
      const wrappers = (Array.from(screen.getByTestId(`${zone}-arc`).children) as HTMLElement[]).slice(0, 3);
      tops[String(finePointer)] = {
        cards: wrappers.map((wrapper) => parseFloat(wrapper.style.top)),
        controls: screen.getByTestId(`${zone}-controls`).style.top,
      };
      unmount();
      cleanup();
    }

    const plain = layout({});
    const desktop = layout({ lower: -ARC_DESKTOP_RAISE, maxVisible: window.innerHeight - VIEWER_TOP_INSET - 44 });
    const touch = layout(ARC_TOUCH_OPTIONS);
    // The desktop arc sits higher than the plain arc (#1495).
    expect(desktop.visibleHeight).toBeCloseTo((1 + ARC_DESKTOP_RAISE) * plain.visibleHeight);
    // The touch arc has no sag, so its ends sit as high as its middle.
    expect(touch.cards[0].centerY).toBeCloseTo(touch.cards[1].centerY);
    expect(plain.cards[0].centerY).toBeGreaterThan(plain.cards[1].centerY);
    tops.true.cards.forEach((top, i) => expect(top).toBeCloseTo(desktop.cards[i].centerY - desktop.cardHeight / 2));
    tops.false.cards.forEach((top, i) => expect(top).toBeCloseTo(touch.cards[i].centerY - touch.cardHeight / 2));
    // Every touch card keeps its lowest top corner at least the floor above the bottom edge.
    touch.cards.forEach((card) => {
      const rad = (Math.abs(card.angle) * Math.PI) / 180;
      const lowestTop = card.centerY + (touch.cardWidth / 2) * Math.sin(rad) - (touch.cardHeight / 2) * Math.cos(rad);
      expect(window.innerHeight - lowestTop).toBeGreaterThanOrEqual(ARC_TOUCH_MIN_VISIBLE - 0.01);
    });
    // The row's top is `calc(100% - (visibleHeight + the row's height))`, so it follows the arc.
    const offset = (top: string) => parseFloat(top.match(/100% - ([\d.]+)px/)![1]);
    expect(offset(tops.true.controls) - offset(tops.false.controls)).toBeCloseTo(desktop.visibleHeight - touch.visibleHeight);
  });
});

// #1465: on a large screen the closed hand grows by the bottom-row scale, as the piles beside it do.
describe('CardHand closed fan at a bottom-row scale', () => {
  it('draws its cards and its button at the scale', () => {
    render(
      <CardHand
        instances={makeInstances(1)}
        open={false}
        onOpen={() => {}}
        onClose={() => {}}
        dragging={false}
        rowScale={1.5}
      />
    );
    // A pile card at the scale, 84 x 120, of which `CLOSED_FAN_VISIBLE` shows above the bottom edge.
    const button = screen.getByRole('button', { name: /hand, 1 card/ });
    expect(button.style.width).toBe('84px');
    expect(button.style.height).toBe(`${Math.round(CLOSED_FAN_VISIBLE * 120)}px`);
    expect((button.querySelector('img') as HTMLImageElement).style.width).toBe('84px');
  });
});

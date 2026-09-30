// #894: the host card of a card list panel sat in its own section above the grid and shrank with
// the grid on a short viewport, until it could not be read. It now sits to the right of the grid,
// in one row with it, and keeps the size of a panel card. jsdom does no layout, so this checks the
// order of the elements and the sizes the host is given.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CardHoldProvider, HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';
import CardListPanel, { crewPanelMinHeight, PanelLocation, placedOnCardWidth } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, type = 'personnel'): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type,
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

const cases: [PanelLocation, string][] = [
  ['crew', 'card-list-panel-crew-ship'],
  ['on', 'card-list-panel-on-host'],
];

describe('Practice draw: a card list panel shows its host to the right of the grid (#894)', () => {
  it.each(cases)('puts the %s host after the grid, in one row with it', (location, hostTestId) => {
    render(
      <CardListPanel
        location={location}
        cards={[makeCard(1), makeCard(2)]}
        host={makeCard(9, 'ship')}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        cardWidth={108}
        cardHeight={150}
      />
    );

    const grid = screen.getByTestId(`card-list-panel-${location}`);
    const host = screen.getByTestId(hostTestId);
    expect(host.parentElement).toBe(grid.parentElement);
    expect(grid.parentElement!.className).toMatch(/flex-row/);
    expect(grid.nextElementSibling).toBe(host);

    // The host does not shrink with the grid: it keeps the size of a panel card.
    expect(host.className).toMatch(/shrink-0/);
    const img = host.querySelector('img[alt="card 9"]') as HTMLImageElement;
    expect(img.style.width).toBe('108px');
    expect(img.style.height).toBe('150px');
    expect(img.style.maxHeight).toBe('');
  });
});

describe('Practice draw: the host section of a card list panel has no label (#916)', () => {
  it.each(cases)('shows the %s host card with no text above it', (location, hostTestId) => {
    render(
      <CardListPanel
        location={location}
        cards={[makeCard(1)]}
        host={makeCard(9, 'ship')}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        cardWidth={108}
        cardHeight={150}
      />
    );

    const host = screen.getByTestId(hostTestId);
    expect(host.textContent).toBe('');
    expect(screen.queryByText(/^Ship$/i)).toBeNull();
    expect(screen.queryByText(/^Placed on$/i)).toBeNull();
    // The framed box stays.
    expect(host.firstElementChild!.className).toMatch(/border-accent\/60/);
  });
});

describe('Practice draw: the crew panel shows the cards placed on the ship below it (#957)', () => {
  const renderPanel = (location: PanelLocation, host: CardInstance, onHold = jest.fn()) =>
    render(
      <CardHoldProvider value={{ startHold: onHold, endHold: () => {}, startHover: () => {}, endHover: () => {} }}>
        <CardListPanel
          location={location}
          cards={[makeCard(1)]}
          host={host}
          onClose={() => {}}
          selectedIds={[]}
          onToggleSelect={() => {}}
          cardWidth={108}
          cardHeight={150}
        />
      </CardHoldProvider>
    );

  const shipWithPlaced = (): CardInstance => ({
    ...makeCard(9, 'ship'),
    placedOn: [makeCard(20, 'event'), makeCard(21, 'equipment')],
  });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders one tiny card per placed card inside the ship section, a third of its width', () => {
    renderPanel('crew', shipWithPlaced());
    const section = screen.getByTestId('card-list-panel-crew-ship');
    for (const id of ['card-20', 'card-21']) {
      const tiny = screen.getByTestId(`card-list-panel-crew-on-${id}`);
      expect(section).toContainElement(tiny);
      const button = tiny.querySelector('button') as HTMLButtonElement;
      expect(button.style.width).toBe(`${placedOnCardWidth(108)}px`);
    }
    expect(placedOnCardWidth(108)).toBeGreaterThanOrEqual(30);
    expect(placedOnCardWidth(108)).toBeLessThanOrEqual(36);
    // The tiny cards sit below the ship image.
    const shipImage = section.querySelector('[role="img"]')!;
    expect(shipImage.nextElementSibling).toBe(screen.getByTestId('card-list-panel-crew-ship-placed-on'));
    // Not drop targets.
    expect(section.querySelector('[data-zone]')).toBeNull();
  });

  it('renders no tiny cards for a ship with nothing on it', () => {
    renderPanel('crew', makeCard(9, 'ship'));
    expect(screen.queryByTestId('card-list-panel-crew-ship-placed-on')).toBeNull();
    expect(screen.queryByTestId(/^card-list-panel-crew-on-/)).toBeNull();
  });

  it('renders no tiny cards in the host section of the on panel', () => {
    renderPanel('on', shipWithPlaced());
    expect(screen.queryByTestId(/^card-list-panel-crew-on-/)).toBeNull();
    expect(screen.getByTestId('card-list-panel-on-host').querySelectorAll('button')).toHaveLength(0);
  });

  it('a hold on a tiny card previews that card', () => {
    const onHold = jest.fn();
    renderPanel('crew', shipWithPlaced(), onHold);
    const button = screen.getByTestId('card-list-panel-crew-on-card-20').querySelector('button')!;
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS);
    });
    expect(onHold).toHaveBeenCalledWith('card-20', expect.anything());
    fireEvent.pointerUp(window);
  });
});

// #965: the ship section was clamped to the height of the grid beside it (`max-h-full`), so a ship
// with cards placed on it scrolled in a panel with one row of crew. jsdom does no layout, so this
// checks the classes and the style that size the panel.
describe('Practice draw: the crew panel is tall enough for the cards on the ship (#965)', () => {
  const renderPanel = (location: PanelLocation, cards: CardInstance[]) =>
    render(
      <CardListPanel
        location={location}
        cards={cards}
        host={makeCard(9, 'ship')}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        cardWidth={108}
        cardHeight={150}
      />
    );

  it('gives the crew panel a minimum height of 1.5 panel card heights, capped at the space it may use', () => {
    expect(crewPanelMinHeight(150)).toBe('min(225px, 100%)');
  });

  it.each([[[]], [[makeCard(1)]]])('the row of an empty or small crew grows to fill the panel', (cards) => {
    renderPanel('crew', cards);
    const row = screen.getByTestId('card-list-panel-crew').parentElement!;
    expect(row.className).toMatch(/\bflex-1\b/);
    expect(row.className).toMatch(/\bmin-h-0\b/);
  });

  it('the ship section stretches with the row and is not clamped to a percentage height', () => {
    renderPanel('crew', [makeCard(1)]);
    const section = screen.getByTestId('card-list-panel-crew-ship');
    expect(section.className).not.toMatch(/max-h-full/);
    expect(section.className).not.toMatch(/self-start/);
    expect(section.className).toMatch(/overflow-y-auto/);
  });

  it('leaves the on panel at the height of its cards', () => {
    renderPanel('on', [makeCard(1)]);
    const row = screen.getByTestId('card-list-panel-on').parentElement!;
    expect(row.className).not.toMatch(/\bflex-1\b/);
    expect(row.parentElement!.style.minHeight).toBe('');
  });
});

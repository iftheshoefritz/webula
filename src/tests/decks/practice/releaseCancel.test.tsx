// Mock next/navigation hooks (required for App Router hooks in Jest/jsdom)
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

// Mock useDataFetching hook
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock deckBuilderUtils to spy on deckFromTsv and expandDeck
jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  expandDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

// Mock react-icons to avoid jsdom noise
jest.mock('react-icons/fa', () => ({
  FaRedo: () => null,
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});
// See discardDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
// directly. Here the events also carry an `activatorEvent` and a `delta`, the press point and the
// pointer's travel, since #774's rule reads them.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: any) => void) | null = null;
let mockOnDragEnd: ((event: any) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: ({ id }: { id: string }) => {
      mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { isReleaseInDeadRect, PressGeometry } from '../../../app/decks/practice/releaseCancel';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
  pile: 'draw',
  count: 1,
};

const mockDeck = {
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
};

// A card of the open fan, 73 x 104 px, the size the issue measured, pressed at its centre.
const CARD_RECT = { left: 370, top: 503, right: 443, bottom: 607, width: 73, height: 104, x: 370, y: 503 };
const PRESS = { x: 406.5, y: 555 };

describe('isReleaseInDeadRect (#774)', () => {
  const press: PressGeometry = { ...PRESS, rect: CARD_RECT };

  it('cancels a release 9.4 px from the press point', () => {
    expect(isReleaseInDeadRect(press, { x: 5, y: -8 })).toBe(true);
  });

  it('keeps the 24 px floor in each direction from the press point', () => {
    // Half the card's width is only 18 px each side of its centre; the floor widens it to 24 px.
    expect(isReleaseInDeadRect(press, { x: 23, y: 0 })).toBe(true);
    expect(isReleaseInDeadRect(press, { x: 25, y: 0 })).toBe(false);
  });

  it('lets a release that leaves the half-size rectangle but stays on the card drop', () => {
    // Half the card's height is 26 px below its centre; the card itself reaches 52 px.
    expect(isReleaseInDeadRect(press, { x: 0, y: 25 })).toBe(true);
    expect(isReleaseInDeadRect(press, { x: 0, y: 30 })).toBe(false);
  });

  it('treats a drag with no press geometry or no delta as a normal drop', () => {
    expect(isReleaseInDeadRect(null, { x: 0, y: 0 })).toBe(false);
    expect(isReleaseInDeadRect(press, undefined)).toBe(false);
  });
});

describe('Practice draw: a release near the press point cancels the drag (#774)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (deckFromTsv as jest.Mock).mockReturnValue({});
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);

    Object.defineProperty(screen, 'orientation', {
      value: { lock: jest.fn().mockResolvedValue(undefined), unlock: jest.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockEventCard]);
  });

  const openHand = async () => {
    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  // Presses the card's rendered element at `PRESS`, with the element measured at `CARD_RECT`,
  // then releases it `delta` away with `overId` under the release point.
  const drag = async (id: string, delta: { x: number; y: number }, overId: string) => {
    const element = document.body.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
    expect(element).not.toBeNull();
    element.getBoundingClientRect = () => ({ ...CARD_RECT, toJSON: () => ({}) }) as DOMRect;
    await act(async () => {
      mockOnDragStart!({ active: { id }, activatorEvent: { clientX: PRESS.x, clientY: PRESS.y, target: element } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: overId }, delta });
    });
  };

  const cardInCore = (id: string) => document.body.querySelector(`[data-zone="core"] [data-card-id="${id}"]`);

  it('keeps a card in the open hand, and reopens the hand, for a 9 px drag over the core', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openHand();
    const [id] = mockDraggableIds;

    await drag(id, { x: 5, y: -8 }, 'core');

    expect(cardInCore(id)).toBeNull();
    expect(screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'distress call' })).toBeInTheDocument();
  });

  it('drops a card that leaves the half-size rectangle, though the release is still on the card', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openHand();
    const [id] = mockDraggableIds;

    await drag(id, { x: 0, y: 30 }, 'core');

    expect(cardInCore(id)).not.toBeNull();
  });

  it("keeps a card in a mission's pile panel, and keeps the panel open, for a 9 px drag", async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openHand();
    const [id] = mockDraggableIds;

    // File the event into mission 0's event pile, then open that pile's panel.
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: 'mission-0' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^event pile, 1 card, tap to open$/i }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-event"]')).not.toBeNull();

    await drag(id, { x: 5, y: -8 }, 'core');

    expect(cardInCore(id)).toBeNull();
    expect(document.body.querySelector(`[data-zone="pile-panel-event"] [data-card-id="${id}"]`)).not.toBeNull();
  });
});

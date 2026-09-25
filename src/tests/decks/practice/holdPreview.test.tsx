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
// directly and to capture the ids each draggable table card registers, since jsdom has no real
// pointer geometry for dnd-kit to detect drop targets with.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
let mockOnDragCancel: (() => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      mockOnDragCancel = onDragCancel;
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
import { HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';

// Press and hold a card to preview it (#763), on the whole page. Since #764 the hold is the only
// way to open the preview: the tap acts, the hold looks, and the preview is read-only.

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'draw',
  count: 1,
};

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'draw',
  count: 1,
};

const mockEquipmentCard = {
  collectorsinfo: '1U001',
  originalName: 'Tricorder',
  type: 'equipment',
  name: 'tricorder',
  imagefile: 'tricorder',
  pile: 'draw',
  count: 1,
};

const mockMissionCard = {
  collectorsinfo: '1R100',
  originalName: 'First Contact',
  type: 'mission',
  name: 'first contact',
  imagefile: 'first_contact',
  pile: 'mission',
  count: 1,
};

const deckOf = (...cards: any[]) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// The enlarged image of the preview, if the preview shows the named card.
const preview = (name: string) => {
  const image = screen.queryByTestId('card-preview-enlarged');
  return image && image.getAttribute('alt')?.toLowerCase() === name.toLowerCase() ? image : null;
};

const hold = (element: Element) => {
  fireEvent.pointerDown(element, { button: 0 });
  act(() => {
    jest.advanceTimersByTime(HOLD_DELAY_MS);
  });
};

// A tap as the browser sends it: a press, a release, and the click.
const tap = (element: Element) => {
  act(() => {
    fireEvent.pointerDown(element, { button: 0 });
    fireEvent.pointerUp(element);
    fireEvent.click(element);
  });
};

const release = () => {
  act(() => {
    fireEvent.pointerUp(window);
  });
};

describe('Practice draw: press and hold a card to preview it (#763)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockOnDragCancel = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (deckFromTsv as jest.Mock).mockReturnValue({});
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Renders the page with the given hand cards (and the given missions) and opens the hand.
  const setupOpenHand = async (cards: any[], missions: any[] = []) => {
    localStorage.setItem('currentDeck', JSON.stringify(deckOf(...cards, ...missions)));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
    jest.useFakeTimers();
  };

  const drag = (id: string, over: string) => {
    act(() => {
      mockOnDragStart!({ active: { id } });
    });
    act(() => {
      mockOnDragEnd!({ active: { id }, over: { id: over } });
    });
  };

  it('a hold on a mission card shows its preview, and the release hides it', async () => {
    await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
    const mission = screen.getByRole('button', { name: 'first contact' });

    fireEvent.pointerDown(mission, { button: 0 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS - 1);
    });
    expect(preview('first contact')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(preview('first contact')).toBeInTheDocument();

    release();
    // The click that follows the release does not reopen it.
    fireEvent.click(mission);
    expect(preview('first contact')).toBeNull();
  });

  it('a release before 500 ms shows no preview', async () => {
    await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'first contact' }), { button: 0 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS - 1);
    });
    release();
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS);
    });
    expect(preview('first contact')).toBeNull();
  });

  it('a hold on an open-hand card shows its preview', async () => {
    await setupOpenHand([mockEquipmentCard]);
    hold(screen.getByRole('button', { name: 'tricorder' }));
    expect(preview('tricorder')).toBeInTheDocument();
    release();
    expect(preview('tricorder')).toBeNull();
  });

  it('a drag start closes a hold-opened preview', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [id] = mockDraggableIds;
    hold(screen.getByRole('button', { name: 'tricorder' }));
    expect(preview('tricorder')).toBeInTheDocument();
    act(() => {
      mockOnDragStart!({ active: { id } });
    });
    expect(preview('tricorder')).toBeNull();
  });

  it('a hold on a ship shows its preview only, without its crew panel; a hold on a crew card keeps the panel open', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    drag(shipId, 'mission-2');
    drag(personnelId, `crew-${shipId}`);

    const ship = screen.getByRole('button', { name: 'u.s.s. relativity' });
    hold(ship);
    expect(preview('u.s.s. relativity')).toBeInTheDocument();
    expect(document.body.querySelector('[data-zone="pile-panel-crew"]')).toBeNull();
    release();
    expect(preview('u.s.s. relativity')).toBeNull();

    // A tap on the ship opens its crew panel and no preview. A hold on the crew card shows that
    // card; the release hides it, the panel stays open, and the card's selection is unchanged.
    tap(ship);
    expect(document.body.querySelector('[data-zone="pile-panel-crew"]')).not.toBeNull();
    expect(screen.queryByTestId('card-preview')).toBeNull();
    const crewCard = screen.getByRole('button', { name: 'data' });
    hold(crewCard);
    expect(preview('data')).toBeInTheDocument();
    release();
    fireEvent.click(crewCard);
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select data' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.body.querySelector('[data-zone="pile-panel-crew"]')).not.toBeNull();
  });

  it('the preview holds no button and takes no pointer events (#764)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    hold(screen.getByRole('button', { name: 'tricorder' }));
    const layer = screen.getByTestId('card-preview');
    expect(layer).toHaveClass('pointer-events-none');
    expect(layer.querySelector('button')).toBeNull();
    release();
  });
});

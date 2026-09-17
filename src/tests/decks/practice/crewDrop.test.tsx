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
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      void onDragCancel;
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

const mockOtherShipCard = {
  collectorsinfo: '1R901',
  originalName: 'I.K.S. Somraw',
  type: 'ship',
  name: 'i.k.s. somraw',
  imagefile: 'somraw',
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

const deckOf = (...cards: any[]) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

describe('Practice draw: dropping a personnel or equipment card on a ship', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
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

  // Renders the page with the given deck and opens the hand, so its cards are draggable.
  const setupOpenHand = async (cards: any[]) => {
    localStorage.setItem('currentDeck', JSON.stringify(deckOf(...cards)));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.getByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
  };

  // Places the first draggable id (a ship dealt into the hand) onto the given mission's ship
  // row, then re-opens the (drag-start-closed) hand so the rest of the hand is draggable again.
  const placeShipOnMission = async (shipDraggableId: string, missionIndex: number, remainingCount: number) => {
    await act(async () => {
      mockOnDragStart!({ active: { id: shipDraggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipDraggableId }, over: { id: `mission-${missionIndex}` } });
    });
    const label = new RegExp(`^hand, ${remainingCount} cards?, tap to open$`, 'i');
    const closedHandButton = screen.getByRole('button', { name: label });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
  };

  it('moves a dragged personnel card off the hand and aboard a ship when dropped on it', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });

    // Gone from the hand...
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();

    // ...and now shown as crew: the ship's own preview lists it, and the ship's badge shows 1.
    const shipButton = screen.getByRole('button', { name: 'u.s.s. relativity' });
    expect(shipButton.textContent).toContain('1');

    await act(async () => {
      fireEvent.click(shipButton);
    });
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
  });

  it('moves a dragged equipment card off the hand and aboard a ship when dropped on it', async () => {
    await setupOpenHand([mockShipCard, mockEquipmentCard]);
    const [shipId, equipmentId] = mockDraggableIds;
    await placeShipOnMission(shipId, 1, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: equipmentId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: equipmentId }, over: { id: `crew-${shipId}` } });
    });

    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' }).textContent).toContain('1');
  });

  it('leaves a ship in the hand when dropped on another ship\'s crew slot (unsupported drop)', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard]);
    const [shipId, otherShipId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: otherShipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: otherShipId }, over: { id: `crew-${shipId}` } });
    });

    // The dropped ship is still in the hand, not aboard the other ship.
    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    expect(screen.getByRole('button', { name: 'i.k.s. somraw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' }).textContent).not.toContain('1');
  });

  it("drags a crew card from the ship's preview to the discard pile, removing it from the crew and closing the preview", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 4, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });

    // Open the ship's preview: the crew row shows the crew member.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();

    // Drag the crew card to the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'discard' } });
    });

    // The preview closed, and the crew member is gone from the crew (and now in the discard pile).
    expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'data' })).not.toBeInTheDocument();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });

  it("tapping a crew card in the ship's preview opens that card's own preview", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 3, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });

    expect(screen.getByRole('button', { name: /data, tap to shrink/i })).toBeInTheDocument();
  });
});

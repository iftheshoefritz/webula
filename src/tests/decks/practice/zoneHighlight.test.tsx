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

// These checks (#608) only need the weaker, not-`isOver` "valid" highlight, so `isOver` stays
// false throughout, the same as `shipRowDrop.test.tsx`. See `dilemmaPileLabel.test.tsx` for the
// pattern of driving `mockOnDragStart` directly and leaving a drag mid-flight (no `onDragEnd`
// call) to inspect the highlight a real, uninterrupted browser drag can't hold still for.
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

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'draw',
  count: 1,
};

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemma',
  count: 1,
};

const mockManyDeck = {
  [mockShipCard.collectorsinfo]: { count: 1, row: mockShipCard },
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
  [mockDilemmaCard.collectorsinfo]: { count: 1, row: mockDilemmaCard },
};

const missionZoneIds = ['mission-0', 'mission-1', 'mission-2', 'mission-3', 'mission-4'];
const shipRowZoneIds = ['ship-row-0', 'ship-row-1', 'ship-row-2', 'ship-row-3', 'ship-row-4'];

function highlightOf(zoneId: string): string | null {
  return document.body.querySelector(`[data-zone="${zoneId}"]`)!.getAttribute('data-highlight');
}

describe('Practice table: valid-zone highlight during a drag (#608)', () => {
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
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
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

  it('highlights the ship rows, the mission cards, the core, and the discard pile while dragging a ship', async () => {
    await setupOpenHand([mockShipCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    shipRowZoneIds.forEach((id) => expect(highlightOf(id)).toBe('valid'));
    missionZoneIds.forEach((id) => expect(highlightOf(id)).toBe('valid'));
    expect(highlightOf('core')).toBe('valid');
    expect(highlightOf('discard')).toBe('valid');

    // Not advisory for a ship: the brig only accepts personnel, and the dilemma pile only
    // accepts dilemmas.
    expect(highlightOf('brig')).toBeNull();
    expect(highlightOf('dilemma-pile-top')).toBeNull();
    expect(highlightOf('dilemma-pile-bottom')).toBeNull();
  });

  it('also highlights a ship\'s crew zone and the brig while dragging a personnel card', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;

    // Put a ship in a ship row first (shipRowDrop.test.tsx's setup), so a crew zone exists to
    // highlight (#608 review point 3).
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-0' } });
    });

    // Re-open the hand (the ship's drag start closed it) and drag the personnel card.
    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });

    expect(highlightOf(`crew-${shipId}`)).toBe('valid');
    expect(highlightOf('brig')).toBe('valid');
    missionZoneIds.forEach((id) => expect(highlightOf(id)).toBe('valid'));
    expect(highlightOf('core')).toBe('valid');
    expect(highlightOf('discard')).toBe('valid');

    // Not advisory for personnel: a ship row only accepts ships.
    shipRowZoneIds.forEach((id) => expect(highlightOf(id)).toBeNull());
  });

  it('highlights the mission cards, the core, the discard pile, and both dilemma pile halves while dragging a dilemma', async () => {
    await setupOpenHand([mockDilemmaCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    missionZoneIds.forEach((id) => expect(highlightOf(id)).toBe('valid'));
    expect(highlightOf('core')).toBe('valid');
    expect(highlightOf('discard')).toBe('valid');
    expect(highlightOf('dilemma-pile-top')).toBe('valid');
    expect(highlightOf('dilemma-pile-bottom')).toBe('valid');

    // Not advisory for a dilemma: neither a ship row nor the brig accepts one.
    shipRowZoneIds.forEach((id) => expect(highlightOf(id)).toBeNull());
    expect(highlightOf('brig')).toBeNull();
  });
});

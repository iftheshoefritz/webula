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

// See crewDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd` directly
// and to capture the ids each draggable table card registers, since jsdom has no real pointer
// geometry for dnd-kit to detect drop targets with.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
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

const mockCardData = [mockPersonnelCard, mockEquipmentCard];

const deckOf = (...cards: any[]) => Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

describe('Practice draw: stopping a personnel card (#679)', () => {
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

  it('shows a "Stop" button only for a personnel card\'s preview', async () => {
    await setupOpenHand([mockPersonnelCard, mockEquipmentCard]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /data, tap to shrink/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'tricorder' }));
    });
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
  });

  it('tapping "Stop" greys the previewed image and flips the button to "Unstop"; tapping it again restores both', async () => {
    await setupOpenHand([mockPersonnelCard]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    const preview = screen.getByRole('button', { name: /data, tap to shrink/i });
    expect(preview.querySelector('img')).not.toHaveClass('grayscale');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    });
    expect(preview.querySelector('img')).toHaveClass('grayscale', 'opacity-50');
    expect(screen.getByRole('button', { name: /^unstop$/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^unstop$/i }));
    });
    expect(preview.querySelector('img')).not.toHaveClass('grayscale');
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
  });

  it('shows a stopped personnel card greyed out on the table, in its pile panel, and after moving to a new zone', async () => {
    await setupOpenHand([mockPersonnelCard]);
    const [personnelId] = mockDraggableIds;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /data, tap to shrink/i }));
    });

    // Drag the (now stopped) card from the hand to the brig (#603's flat zone, `FlatCardRow`
    // -> `TableCard`).
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'brig' } });
    });

    const brigCardImg = document.body.querySelector(`[data-card-id="${personnelId}"] img`);
    expect(brigCardImg).toHaveClass('grayscale', 'opacity-50');

    // Tapping the card in the brig opens the brig's own pile panel (#640); the card there shows
    // the same greyed-out style.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    const panelCardImg = document.body.querySelector('[data-zone="pile-panel-brig"] img');
    expect(panelCardImg).toHaveClass('grayscale', 'opacity-50');
  });
});

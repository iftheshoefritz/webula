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

// Mock deckBuilderUtils to spy on deckFromTsv and extractDrawDeck
jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
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
// Issue #814: the top card of the draw deck and of the dilemma pile is draggable off the pile
// art. See discardDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
// directly. Only the pile-art draggables (`data.showBack`) are recorded here, keyed by id, so
// each test can pick the top card of either pile.
const mockPileDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string; data?: { current?: { showBack?: boolean } } } }) => void) | null =
  null;
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
    useDraggable: ({ id, data }: { id: string; data?: { showBack?: boolean } }) => {
      if (data?.showBack && !mockPileDraggableIds.includes(id)) mockPileDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

// 8 draw cards: a new game deals 7 into the hand, leaving exactly one ("Card 8") in the draw deck.
const mockDrawCards = Array.from({ length: 8 }, (_, i) => ({
  collectorsinfo: `1U${String(i + 1).padStart(3, '0')}`,
  originalName: `Card ${i + 1}`,
  type: 'equipment',
  name: `card ${i + 1}`,
  imagefile: `card_${i + 1}`,
  pile: 'drawDeck',
  count: 1,
}));

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 1,
};

const mockDeck = {
  ...Object.fromEntries(mockDrawCards.map((c) => [c.collectorsinfo, { count: 1, row: c }])),
  [mockDilemmaCard.collectorsinfo]: { count: 1, row: mockDilemmaCard },
};

describe('Practice table: dragging the top card off the draw deck or the dilemma pile (#814)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPileDraggableIds.length = 0;
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
  });

  const setup = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue(mockDrawCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };

  const drag = async (id: string, overId: string) => {
    await act(async () => {
      mockOnDragStart!({ active: { id, data: { current: { showBack: true } } } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: overId } });
    });
  };

  const coreZone = () => document.body.querySelector('[data-zone="core"]') as HTMLElement;

  it("moves the draw deck's top card into the core, face up, and out of the draw deck", async () => {
    await setup();
    const drawTop = document.body.querySelector('[aria-label="Draw deck top, tap to draw"]')!;
    const topId = drawTop.closest('[data-card-id]')!.getAttribute('data-card-id')!;
    expect(mockPileDraggableIds).toContain(topId);

    await drag(topId, 'core');

    // Face up in the core, by name.
    expect(within(coreZone()).getByRole('button', { name: 'Card 8' })).toBeInTheDocument();
    // The draw deck is empty now, so its top half is disabled and has no draggable around it.
    expect(screen.getByRole('button', { name: 'Draw deck top, tap to draw' })).toBeDisabled();
    expect(document.body.querySelector(`[data-card-id="${topId}"]`)?.closest('[data-zone="core"]')).not.toBeNull();
  });

  it("moves the dilemma pile's top card into the core, face up, and out of the dilemma pile", async () => {
    await setup();
    const dilemmaTop = document.body.querySelector('[aria-label="Dilemma pile top, tap to draw"]')!;
    const topId = dilemmaTop.closest('[data-card-id]')!.getAttribute('data-card-id')!;
    expect(mockPileDraggableIds).toContain(topId);

    await drag(topId, 'core');

    expect(within(coreZone()).getByRole('button', { name: 'Cardassian Trap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dilemma pile top, tap to draw' })).toBeDisabled();
  });

  it("keeps the draw deck's top card face down when it lands in a face-down zone", async () => {
    await setup();
    const drawTop = document.body.querySelector('[aria-label="Draw deck top, tap to draw"]')!;
    const topId = drawTop.closest('[data-card-id]')!.getAttribute('data-card-id')!;

    await drag(topId, 'dilemmaStack');

    const stackZone = document.body.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(within(stackZone).getByRole('img').getAttribute('alt')).toBe('Face-down dilemma stack');
    expect(within(stackZone).queryByText('Card 8')).not.toBeInTheDocument();
  });

  it('shows the card back in the drag overlay for a drag off the pile art', async () => {
    await setup();
    const drawTop = document.body.querySelector('[aria-label="Draw deck top, tap to draw"]')!;
    const topId = drawTop.closest('[data-card-id]')!.getAttribute('data-card-id')!;

    await act(async () => {
      mockOnDragStart!({ active: { id: topId, data: { current: { showBack: true } } } });
    });

    const overlayImage = within(screen.getByTestId('drag-overlay')).getByRole('img');
    expect(overlayImage.getAttribute('src')).toBe('/cardimages/cardback.jpg');
  });

  // Issue #1036: `scripts/watch_landed.sh` finds the overlay's content by this test id.
  it('marks the drag overlay content with a data-testid during a drag, and drops it after', async () => {
    await setup();
    const drawTop = document.body.querySelector('[aria-label="Draw deck top, tap to draw"]')!;
    const topId = drawTop.closest('[data-card-id]')!.getAttribute('data-card-id')!;
    expect(screen.queryByTestId('drag-overlay-card')).not.toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: topId, data: { current: { showBack: true } } } });
    });
    const content = within(screen.getByTestId('drag-overlay')).getByTestId('drag-overlay-card');
    expect(content).not.toHaveAttribute('data-zone');

    await act(async () => {
      mockOnDragEnd!({ active: { id: topId }, over: { id: 'core' } });
    });
    expect(screen.queryByTestId('drag-overlay-card')).not.toBeInTheDocument();
  });
});

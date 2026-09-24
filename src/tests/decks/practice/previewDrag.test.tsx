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
// directly and to capture what each draggable table card registers, since jsdom has no real
// pointer geometry for dnd-kit to detect drop targets with. This file also captures `disabled`,
// so a test can tell a mission's own preview (#643: not draggable) apart from every other
// preview (draggable) without needing real dnd-kit's pointer-sensor behaviour.
const mockDraggableRegistrations: { id: string; disabled?: boolean }[] = [];
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
    useDraggable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
      mockDraggableRegistrations.push({ id, disabled });
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { previewDraggableId } from '../../../app/decks/practice/CardPreview';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'draw',
  count: 1,
};

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
  pile: 'draw',
  count: 1,
};

const missionCard = {
  collectorsinfo: '1R100',
  originalName: 'First Contact',
  type: 'mission',
  name: 'first contact',
  imagefile: 'first_contact',
  pile: 'mission',
  count: 1,
};

const personnelDeck = { [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard } };
const eventDeck = { [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard } };
const missionDeck = {
  ...personnelDeck,
  [missionCard.collectorsinfo]: { count: 1, row: missionCard },
};

describe('Practice draw: dragging the enlarged card preview to another zone (#643)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableRegistrations.length = 0;
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
  const setupOpenHand = async (deck: object, cards: any[]) => {
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  it("drags a hand card's enlarged preview onto a mission, moving the card and closing the preview", async () => {
    await setupOpenHand(personnelDeck, [mockPersonnelCard]);
    const [homeId] = mockDraggableRegistrations.map((r) => r.id);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    const previewId = previewDraggableId(homeId);

    // The home card and its enlarged preview each registered their own, distinct draggable id
    // with dnd-kit — not the same id twice, which dnd-kit does not support.
    const registeredIds = mockDraggableRegistrations.map((r) => r.id);
    expect(registeredIds).toContain(homeId);
    expect(registeredIds).toContain(previewId);
    expect(homeId).not.toBe(previewId);

    await act(async () => {
      mockOnDragStart!({ active: { id: previewId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: previewId }, over: { id: 'mission-0' } });
    });

    // The preview closed, and the card is now in that mission's personnel pile.
    expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();
    const badge = screen.getByRole('button', { name: /personnel pile, 1 card, tap to open/i });
    await act(async () => {
      fireEvent.click(badge);
    });
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
  });

  it("drags a card's enlarged preview out of an open pile panel, where its home draggable is mounted at the same time", async () => {
    await setupOpenHand(eventDeck, [mockEventCard]);
    const [homeId] = mockDraggableRegistrations.map((r) => r.id);

    await act(async () => {
      mockOnDragStart!({ active: { id: homeId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: homeId }, over: { id: 'core' } });
    });

    // Open the core's pile panel, then that card's own preview from inside it: the card's home
    // draggable (in the panel) and its preview's draggable are now both mounted at once.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });
    const panel = document.body.querySelector('[data-zone="pile-panel-core"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'distress call' }));
    });
    expect(screen.getByRole('button', { name: /distress call, tap to shrink/i })).toBeInTheDocument();

    const previewId = previewDraggableId(homeId);
    const registeredIds = mockDraggableRegistrations.map((r) => r.id);
    expect(registeredIds).toContain(homeId);
    expect(registeredIds).toContain(previewId);

    await act(async () => {
      mockOnDragStart!({ active: { id: previewId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: previewId }, over: { id: 'discard' } });
    });

    // The card left the core (and its now-closed panel) for the discard pile.
    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).toBeNull();
    expect(document.body.querySelector('[data-zone="core"] [data-card-id]')).toBeNull();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });

  it('registers no draggable for a mission card\'s own preview', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(missionDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'first contact' }));
    });
    expect(screen.getByRole('button', { name: /first contact, tap to shrink/i })).toBeInTheDocument();

    // The mission preview is the only `preview-` registration here, since the hand is closed
    // and no other card is previewed; it must be disabled, matching the mission's own on-table
    // `TableCard`, which is not draggable either.
    const previewRegistrations = mockDraggableRegistrations.filter((r) => r.id.startsWith('preview-'));
    expect(previewRegistrations).toHaveLength(1);
    expect(previewRegistrations[0].disabled).toBe(true);
  });
});

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
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { dilemmaHandIds, drawChoiceDilemma, enterDilemmaChoice, mockAttemptMission } from '../../fixtures/enterAttempt';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 2,
};

// A mission in slot 0 for the dilemma choice, where the dilemma hand shows (#1223).
const mockDilemmaDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
  [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
};

// Issue #733 took the per-mission dilemma stack (`MissionSlot.dilemma`, #605) out of the table
// state. A dilemma dropped on a mission card now always goes under that mission (#606), whatever
// zone it comes from, so the tests here cover that one route. The face-down stack itself is now a
// single top-level `dilemmaStack` zone, which #630 draws on the table.
describe('Practice table: a dilemma dropped on a mission goes under it (#606, #733)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (extractDrawDeck as jest.Mock).mockReturnValue([]);
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });

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

  // Renders the page with a deck holding 2 copies of a dilemma, enters the dilemma choice of an
  // attempt at mission 0, the only place the dilemma hand shows (#1223), and draws both dilemmas into
  // the dilemma hand, which opens it, so its cards are draggable.
  const setupOpenDilemmaHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDilemmaDeck));

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await enterDilemmaChoice(<PracticeDrawPage />);

    await drawChoiceDilemma();
    await drawChoiceDilemma();
  };

  // Renders the full table, where every mission is mounted, and returns the id of the dilemma
  // pile's top card, which drags off the pile (#814).
  const setupDilemmaPile = async (): Promise<string> => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDilemmaDeck));

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    return JSON.parse(localStorage.getItem('practiceGame')!).table.dilemmaPile[0].id;
  };

  it('puts a dilemma dragged out of the dilemma hand under the mission, not in a stack', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = dilemmaHandIds();

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-under-0' } });
    });

    // No mission column has a dilemma pile or its badge any more (#733).
    expect(document.body.querySelector('[data-zone="mission-pile-dilemma-0"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Dilemma pile, 1 card, tap to open/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
  });

  it('moves a dilemma from under one mission to under another', async () => {
    const firstId = await setupDilemmaPile();

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-under-0' } });
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-under-1' } });
    });

    // One under-the-mission pile of 1 card, now at mission-1 rather than mission-0.
    const underMissionButtons = screen.getAllByRole('button', {
      name: /Under the mission pile, 1 card, tap to open/i,
    });
    expect(underMissionButtons).toHaveLength(1);
  });

  it('names the mission on the under-the-mission stack, for practice_drag.sh (#920)', async () => {
    const firstId = await setupDilemmaPile();

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-under-1' } });
    });

    // The stack is not a drop target (#861), so it names the mission with a testid, not a data-zone.
    const stack = screen.getByTestId('mission-under-1-stack');
    expect(stack).not.toHaveAttribute('data-zone');
    expect(stack.querySelector(`[data-card-id="${firstId}"]`)).not.toBeNull();
    expect(within(stack).getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
    expect(screen.queryByTestId('mission-under-0-stack')).toBeNull();
  });

  it('moves the discard pile\'s top dilemma under a mission when dragged there (#606 review)', async () => {
    const firstId = await setupDilemmaPile();

    // Discard the dilemma from the dilemma pile first, so it sits on top of the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'discard' } });
    });
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-under-0' } });
    });

    expect(screen.getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
  });
});

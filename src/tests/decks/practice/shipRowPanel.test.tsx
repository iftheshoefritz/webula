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

// See shipRowDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
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

const mockThirdShipCard = {
  collectorsinfo: '1R902',
  originalName: 'U.S.S. Voyager',
  type: 'ship',
  name: 'u.s.s. voyager',
  imagefile: 'voyager',
  pile: 'draw',
  count: 1,
};

const mockFourthShipCard = {
  collectorsinfo: '1R903',
  originalName: 'I.R.W. Khazara',
  type: 'ship',
  name: 'i.r.w. khazara',
  imagefile: 'khazara',
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

const deckOf = (...cards: any[]) => Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// A mission's ship row fits 2 ships side by side with no overlap; a 3rd or later overlaps the
// earlier ones almost completely (#668, #713), so this row's own list panel is the only way to
// reach every ship on it once it holds 3 or more.
describe('Practice draw: a mission\'s overlapping ship row opens a list panel (#713)', () => {
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

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  // Drops a ship (already dealt into the open hand) onto a mission, then re-opens the
  // (drag-start-closed) hand so the rest is draggable again, unless nothing remains.
  const dropOnMission = async (draggableId: string, missionIndex: number, remainingCount: number) => {
    await act(async () => {
      mockOnDragStart!({ active: { id: draggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggableId }, over: { id: `mission-${missionIndex}` } });
    });
    if (remainingCount > 0) {
      const label = new RegExp(`^hand, ${remainingCount} cards?, tap to open$`, 'i');
      // #740 keeps a hand open after a drag out of it, so this tap only runs when the
      // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
      const closedHandButton = screen.queryByRole('button', { name: label });
      if (closedHandButton) {
        await act(async () => {
          fireEvent.click(closedHandButton);
        });
      }
    }
  };

  it('opens a panel listing every ship on a row of three, on a tap of any of them', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard]);
    const [firstId, secondId, thirdId] = mockDraggableIds;
    await dropOnMission(firstId, 0, 2);
    await dropOnMission(secondId, 0, 1);
    await dropOnMission(thirdId, 0, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. voyager' }));
    });

    const panel = document.body.querySelector('[data-zone="pile-panel-shipRow"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(3);
    expect(panel.querySelector(`[data-card-id="${firstId}"]`)).not.toBeNull();
    expect(panel.querySelector(`[data-card-id="${secondId}"]`)).not.toBeNull();
    expect(panel.querySelector(`[data-card-id="${thirdId}"]`)).not.toBeNull();
    // A tap on an overlapping row opens the list panel, and no preview.
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it('a tap on a ship with no crew on a row of two (no overlap) opens nothing (#764)', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard]);
    const [firstId, secondId] = mockDraggableIds;
    await dropOnMission(firstId, 0, 1);
    await dropOnMission(secondId, 0, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'i.k.s. somraw' }));
    });

    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).toBeNull();
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it('drags a ship out of the row panel to the discard pile, the same as a direct drag off the row, and keeps the panel open (#675)', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard]);
    const [firstId, secondId, thirdId] = mockDraggableIds;
    await dropOnMission(firstId, 1, 2);
    await dropOnMission(secondId, 1, 1);
    await dropOnMission(thirdId, 1, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'i.k.s. somraw' }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).not.toBeNull();

    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: 'discard' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-1"]') as HTMLElement;
    expect(shipRow.querySelectorAll('[data-card-id]')).toHaveLength(2);
    expect(shipRow.querySelector(`[data-card-id="${secondId}"]`)).toBeNull();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();

    const panel = document.body.querySelector('[data-zone="pile-panel-shipRow"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(2);
  });

  it('tapping a ship inside the row panel selects it and keeps the row panel open (#764)', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard]);
    const [firstId, secondId, thirdId] = mockDraggableIds;
    await dropOnMission(firstId, 2, 2);
    await dropOnMission(secondId, 2, 1);
    await dropOnMission(thirdId, 2, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. voyager' }));
    });
    const panel = document.body.querySelector('[data-zone="pile-panel-shipRow"]') as HTMLElement;
    expect(panel).not.toBeNull();

    await act(async () => {
      fireEvent.click(panel.querySelector(`[data-card-id="${firstId}"]`) as HTMLElement);
    });

    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).not.toBeNull();
    expect(panel.querySelector(`[data-card-id="${firstId}"]`)).toHaveClass('ring-2');
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it('tapping a crewed ship inside the row panel selects it, does not open its crew panel, and keeps the row panel open', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard, mockPersonnelCard]);
    const [firstId, secondId, thirdId, personnelId] = mockDraggableIds;
    await dropOnMission(firstId, 3, 3);
    await dropOnMission(secondId, 3, 2);
    await dropOnMission(thirdId, 3, 1);

    // Board the personnel card onto the first ship.
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${firstId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. voyager' }));
    });
    const panel = document.body.querySelector('[data-zone="pile-panel-shipRow"]') as HTMLElement;
    expect(panel).not.toBeNull();

    await act(async () => {
      fireEvent.click(panel.querySelector(`[data-card-id="${firstId}"]`) as HTMLElement);
    });

    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).not.toBeNull();
    expect(panel.querySelector(`[data-card-id="${firstId}"]`)).toHaveClass('ring-2');
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-crew"]')).toBeNull();
  });

  it('still reaches the row when a fourth ship is dropped on it while its list panel is open', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard, mockFourthShipCard]);
    const [firstId, secondId, thirdId, fourthId] = mockDraggableIds;
    await dropOnMission(firstId, 4, 3);
    await dropOnMission(secondId, 4, 2);
    await dropOnMission(thirdId, 4, 1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. voyager' }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).not.toBeNull();

    await act(async () => {
      mockOnDragStart!({ active: { id: fourthId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: fourthId }, over: { id: 'mission-4' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-4"]') as HTMLElement;
    expect(shipRow.querySelectorAll('[data-card-id]')).toHaveLength(4);
    expect(shipRow.querySelector(`[data-card-id="${fourthId}"]`)).not.toBeNull();
  });

  it('closing the row panel via its own close button leaves the table unchanged', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard, mockThirdShipCard]);
    const [firstId, secondId, thirdId] = mockDraggableIds;
    await dropOnMission(firstId, 0, 2);
    await dropOnMission(secondId, 0, 1);
    await dropOnMission(thirdId, 0, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. voyager' }));
    });

    const closeButton = document.body.querySelector('button[aria-label="Close ships"]') as HTMLElement;
    expect(closeButton).not.toBeNull();
    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(document.body.querySelector('[data-zone="pile-panel-shipRow"]')).toBeNull();
    const shipRow = document.body.querySelector('[data-zone="ship-row-0"]') as HTMLElement;
    expect(shipRow.querySelectorAll('[data-card-id]')).toHaveLength(3);
  });
});

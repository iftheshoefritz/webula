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

// See dilemmaUnderMissionDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/
// `onDragEnd` directly, since jsdom has no real pointer geometry for dnd-kit to detect drop
// targets with.
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
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { expandDeck } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemma',
  count: 2,
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

const mockDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
};

// #630: a face-down top-level zone to the right of the missions (the state side, `dilemmaStack`
// on `TableState`, was already added by #733). A drop onto it appends to the bottom, so the
// first card dropped stays first in stack order (index 0), the first revealed. A tap opens its
// own `PilePanel`, under the same one-panel-at-a-time rule as every other flat zone (#711), and a
// tap on a card inside that panel gets a working Flip button (the `flip` reducer case already
// handles any plain string zone).
describe('Practice table: the dilemma stack (#630)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (expandDeck as jest.Mock).mockReturnValue([mockEventCard]);
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

  // Draws both dilemma copies into the dilemma hand and opens it, so its cards are draggable.
  const setupOpenDilemmaHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawDilemmaButton = screen.getByRole('button', { name: 'Dilemma pile top, tap to draw' });
    await act(async () => {
      fireEvent.click(drawDilemmaButton);
    });
    await act(async () => {
      fireEvent.click(drawDilemmaButton);
    });

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedDilemmaHandButton = screen.queryByRole('button', { name: /^dilemma hand, 2 cards, tap to open$/i });
    if (closedDilemmaHandButton) {
      await act(async () => {
        fireEvent.click(closedDilemmaHandButton);
      });
    }
  };

  it('moves a dropped dilemma onto the stack, appending a second drop after the first', async () => {
    await setupOpenDilemmaHand();
    const [firstId, secondId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    expect(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' })).toBeInTheDocument();

    // Reopen the dilemma hand (a drag closes it) to drag the second card too.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedHand) {
      await act(async () => {
        fireEvent.click(closedHand);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: 'dilemmaStack' } });
    });

    expect(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' }));
    });

    const stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    expect(stackPanel).not.toBeNull();
    const cardIds = Array.from(stackPanel!.querySelectorAll('[data-card-id]')).map((el) =>
      el.getAttribute('data-card-id')
    );
    expect(cardIds).toEqual([firstId, secondId]);
  });

  it('a tap on the stack opens its panel and closes another open panel (#711)', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    // Open the regular hand (the drag above already closed the dilemma hand), so the event
    // card's own draggable registers, and drag it into the core.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand2 = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHand2) {
      await act(async () => {
        fireEvent.click(closedHand2);
      });
    }
    const eventDraggableId = mockDraggableIds[mockDraggableIds.length - 1];
    await act(async () => {
      mockOnDragStart!({ active: { id: eventDraggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: eventDraggableId }, over: { id: 'core' } });
    });

    // Open the core's own pile panel.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).not.toBeNull();

    // Without closing it, tap the dilemma stack.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });

    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]')).not.toBeNull();
  });

  it('a tap on a card in the stack panel opens a preview with a working Flip button', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });
    // #740 leaves the dilemma hand open behind the stack panel, so the same card name matches
    // both the fan's card and the panel's card. Scope the tap to the panel.
    const stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(stackPanel).getByRole('button', { name: 'cardassian trap' }));
    });

    expect(screen.getByText('Face down')).toBeInTheDocument();
    const flipButton = screen.getByRole('button', { name: 'Flip' });
    await act(async () => {
      fireEvent.click(flipButton);
    });

    expect(screen.queryByText('Face down')).not.toBeInTheDocument();
  });

  // #631: the dilemma hand is now a drop target even with no cards in it, so a dilemma dragged
  // from the stack popup always has somewhere to land.
  it('moves a dilemma dropped on the (empty) dilemma hand from the stack popup, face up, without reordering the rest of the stack', async () => {
    await setupOpenDilemmaHand();
    const [firstId, secondId] = mockDraggableIds;

    // Move both dilemmas onto the stack, leaving the dilemma hand empty.
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand3 = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedHand3) {
      await act(async () => {
        fireEvent.click(closedHand3);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: 'dilemmaStack' } });
    });

    const emptyDilemmaHandButton = screen.getByRole('button', { name: /^dilemma hand, 0 cards, tap to open$/i });
    expect(emptyDilemmaHandButton).toBeInTheDocument();
    expect(document.body.querySelector('[data-zone="dilemmaHand"]')).not.toBeNull();

    // Open the stack popup and drag the first card dropped (now at the bottom of the stack, see
    // the appending test above) back onto the empty dilemma hand.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaHand' } });
    });

    expect(screen.getByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' })).toBeInTheDocument();

    // The card that stayed behind in the stack keeps its place; only firstId left.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });
    const stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    const cardIds = Array.from(stackPanel!.querySelectorAll('[data-card-id]')).map((el) =>
      el.getAttribute('data-card-id')
    );
    expect(cardIds).toEqual([secondId]);

    // Close the stack popup so its own "cardassian trap" card button doesn't also match below.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close dilemma stack' }));
    });

    // The moved card is face up in the dilemma hand (dilemmaHand's ZONE_FACE), unlike the stack.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand4 = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedHand4) {
      await act(async () => {
        fireEvent.click(closedHand4);
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'cardassian trap' }));
    });
    expect(screen.queryByText('Face down')).not.toBeInTheDocument();
  });

  // #632: a drop inside the stack popup, on top of another card still in the stack, reorders the
  // stack rather than moving the dropped card out of it.
  it('reorders the stack when one card is dropped on another inside the popup, and the order survives closing and reopening it', async () => {
    await setupOpenDilemmaHand();
    const [firstId, secondId] = mockDraggableIds;

    // Move both dilemmas onto the stack, in order: the stack starts as [firstId, secondId]
    // (appending to the bottom, #630).
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand5 = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedHand5) {
      await act(async () => {
        fireEvent.click(closedHand5);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: 'dilemmaStack' } });
    });

    // Open the stack popup and drag secondId onto firstId, moving it ahead of firstId.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: firstId } });
    });

    // The card never left the stack, so the popup stays open and shows the new order at once.
    let stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    expect(stackPanel).not.toBeNull();
    let cardIds = Array.from(stackPanel!.querySelectorAll('[data-card-id]')).map((el) =>
      el.getAttribute('data-card-id')
    );
    expect(cardIds).toEqual([secondId, firstId]);

    // Close and reopen the popup: the new order lives in the table state itself, not only in the
    // popup's own rendering.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close dilemma stack' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' }));
    });
    stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    cardIds = Array.from(stackPanel!.querySelectorAll('[data-card-id]')).map((el) => el.getAttribute('data-card-id'));
    expect(cardIds).toEqual([secondId, firstId]);
  });

  // #632: the reorder detection must not swallow an ordinary drag out of the popup onto a real
  // zone — here, under a mission, same as a dilemma dragged from anywhere else (#606, #733).
  it('still moves a dilemma dragged from the stack popup onto a mission card, not a reorder', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });

    expect(screen.getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dilemma stack, 1 card, tap to open/i })).not.toBeInTheDocument();
    // The stack is empty again and the drag closed the dilemma hand (#742): the zone hides, but
    // stays in the DOM (`visibility: hidden`, not removed) so the mission row's column layout
    // doesn't shift. A `visibility: hidden` element drops out of the accessible-name-based role
    // query, so read it by its `data-zone` instead.
    const stackZone = document.body.querySelector('[data-zone="dilemmaStack"]');
    expect(stackZone).not.toBeNull();
    expect(stackZone).toHaveStyle({ visibility: 'hidden' });
  });

  // #742: the zone hides once it isn't useful — the stack is empty, the dilemma hand is closed,
  // and no dilemma is being dragged — and shows again as soon as any one of those changes.
  it('hides the empty stack zone until the dilemma hand opens or a dilemma is dragged, and stays visible after a drop', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // A fresh game: no dilemmas drawn, the dilemma hand closed. The zone stays in the DOM (its
    // reserved column keeps the mission row in place) but is hidden.
    const stackZone = () => document.body.querySelector('[data-zone="dilemmaStack"]');
    expect(stackZone()).not.toBeNull();
    expect(stackZone()).toHaveStyle({ visibility: 'hidden' });

    // Opening the (still empty) dilemma hand shows the zone.
    const drawDilemmaButton = screen.getByRole('button', { name: 'Dilemma pile top, tap to draw' });
    await act(async () => {
      fireEvent.click(drawDilemmaButton);
    });
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand6 = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedHand6) {
      await act(async () => {
        fireEvent.click(closedHand6);
      });
    }
    expect(stackZone()).toHaveStyle({ visibility: 'visible' });

    // Dragging that dilemma closes the hand (`handleDragStart`), but the zone stays visible for
    // the rest of the drag.
    const [firstId] = mockDraggableIds;
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    expect(stackZone()).toHaveStyle({ visibility: 'visible' });

    // Dropping it on the stack: the zone stays visible afterward, now that the stack holds a
    // card.
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });
    expect(stackZone()).toHaveStyle({ visibility: 'visible' });
  });
});

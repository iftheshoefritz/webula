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
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'drawDeck',
  count: 1,
};

const mockOtherShipCard = {
  collectorsinfo: '1R901',
  originalName: 'I.K.S. Somraw',
  type: 'ship',
  name: 'i.k.s. somraw',
  imagefile: 'somraw',
  pile: 'drawDeck',
  count: 1,
};

const mockEquipmentCard = {
  collectorsinfo: '1U001',
  originalName: 'Tricorder',
  type: 'equipment',
  name: 'tricorder',
  imagefile: 'tricorder',
  pile: 'drawDeck',
  count: 1,
};

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'drawDeck',
  count: 1,
};

const mockManyDeck = {
  [mockShipCard.collectorsinfo]: { count: 1, row: mockShipCard },
  [mockEquipmentCard.collectorsinfo]: { count: 1, row: mockEquipmentCard },
};

describe('Practice draw: dropping a hand card on a mission or its ship row', () => {
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
    (extractDrawDeck as jest.Mock).mockReturnValue(cards);

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

  it('moves a dragged ship out of the hand and into the target mission\'s ship row when dropped on the mission card', async () => {
    await setupOpenHand([mockShipCard]);
    const [draggedId] = mockDraggableIds;
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' })).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'mission-under-1' } });
    });

    // Gone from the (re-opened) hand fan...
    const closedHandButton = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();

    // ...and now shown in mission 1's ship row.
    const shipRow = document.body.querySelector('[data-zone="ship-row-1"]');
    expect(shipRow).not.toBeNull();
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' })).toBeInTheDocument();
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });

  it('moves a dragged ship into the target mission\'s ship row when dropped on the ship row itself', async () => {
    await setupOpenHand([mockShipCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'ship-row-3' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-3"]');
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });

  it('files a non-ship card into the away team when dropped on a mission card (#602)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'mission-under-0' } });
    });

    // Gone from the (re-opened) hand...
    const closedHandButton = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();

    // ...and now filed into mission 0's away team badge.
    expect(screen.getByRole('button', { name: /Away team, 1 card/i })).toBeInTheDocument();
  });

  // #602 filed a non-ship card dropped on a ship row into the away team. #886 removed that route:
  // the ship row holds ships, so the card stays in the hand.
  it('leaves a non-ship card where it was when dropped on a ship row (#602, #886)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'ship-row-0' } });
    });

    expect(document.body.querySelector(`[data-zone="hand"] [data-card-id="${draggedId}"]`)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Away team, 1 card/i })).toBeNull();
  });

  describe('with a mission card dealt (#813)', () => {
    const mockMissionCard = {
      collectorsinfo: '1R100',
      originalName: 'First Contact',
      type: 'mission',
      name: 'first contact',
      imagefile: 'first_contact',
      pile: 'mission',
      count: 1,
    };
    const mockEventCard = {
      collectorsinfo: '1U002',
      originalName: 'Distress Call',
      type: 'event',
      name: 'distress call',
      imagefile: 'distress_call',
      pile: 'drawDeck',
      count: 1,
    };
    const mockInterruptCard = {
      collectorsinfo: '1U003',
      originalName: 'Adapt',
      type: 'interrupt',
      name: 'adapt',
      imagefile: 'adapt',
      pile: 'drawDeck',
      count: 1,
    };
    const mockDilemmaCard = {
      collectorsinfo: '1C300',
      originalName: 'Chula The Chandra',
      type: 'dilemma',
      name: 'chula the chandra',
      imagefile: 'chula',
      pile: 'drawDeck',
      count: 1,
    };

    // Deals mission 0 a mission card, and puts the given cards in the hand.
    const setupWithMission = async (cards: any[]) => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          ...mockManyDeck,
          [mockMissionCard.collectorsinfo]: { count: 1, row: mockMissionCard },
        })
      );
      (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
      (extractDrawDeck as jest.Mock).mockReturnValue(cards);

      await act(async () => {
        render(<PracticeDrawPage />);
      });
      const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
      if (closedHandButton) {
        await act(async () => {
          fireEvent.click(closedHandButton);
        });
      }
    };

    // The id of the open hand's card with this name.
    const handCardId = (name: string) =>
      screen.getByRole('button', { name }).closest('[data-card-id]')!.getAttribute('data-card-id')!;

    const drop = async (id: string, overId: string) => {
      await act(async () => {
        mockOnDragStart!({ active: { id } });
      });
      await act(async () => {
        mockOnDragEnd!({ active: { id }, over: { id: overId } });
      });
    };

    // A personnel or an equipment aimed at the mission card joins the away team, face down, the
    // same as a drop on the away team badge (#870). Nothing is placed on the mission card.
    it.each([
      ['personnel', mockPersonnelCard],
      ['equipment', mockEquipmentCard],
    ])("files a %s dropped on a mission card's art into the away team, face down", async (_type, card) => {
      await setupWithMission([card]);
      const draggedId = handCardId(card.name);

      await drop(draggedId, 'mission-under-0');

      expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /on it$/ })).toBeNull();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Away team, 1 card, tap to open$/i }));
      });
      const panelCard = document.body.querySelector(
        `[data-testid="card-list-panel-awayTeam"] [data-card-id="${draggedId}"]`
      );
      expect(panelCard).not.toBeNull();
      expect(panelCard!.querySelector('[data-testid="face-down-mark"]')).not.toBeNull();
    });

    it.each([
      ['event', mockEventCard],
    ])("places a %s dropped on a mission card's art on the mission card", async (_type, card) => {
      await setupWithMission([card]);
      const draggedId = handCardId(card.name);

      await drop(draggedId, 'mission-under-0');

      expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'first contact, 1 card on it' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Away team, 1 card/i })).toBeNull();
      expect(document.body.querySelector('[data-zone^="mission-pile-event"]')).toBeNull();

      // A tap on the counter opens the cards on the mission card.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'first contact, 1 card on it' }));
      });
      expect(document.body.querySelector(`[data-testid="card-list-panel-on"] [data-card-id="${draggedId}"]`)).not.toBeNull();
    });

    // The away team badge is not a drop target of its own (#924): the mission's bottom half reaches
    // over it, so a drop there routes by the card's type. No drop id files a ship into the away team.
    it('files nothing into the away team for a drop on the old badge id', async () => {
      await setupWithMission([mockShipCard]);
      const draggedId = handCardId(mockShipCard.name);

      await drop(draggedId, 'mission-pile-awayTeam-0');

      expect(document.body.querySelector('[data-testid="mission-pile-awayTeam-0"]')).toHaveAttribute(
        'aria-label',
        'Away team, 0 cards'
      );
    });

    // The under-mission pile has no badge of its own: its stack sits inside the mission card's drop
    // target, so a dilemma dropped there goes under the mission (#606), not on the mission card.
    it('files a dilemma dropped on the mission under the mission, not on the mission card', async () => {
      await setupWithMission([mockDilemmaCard]);
      const draggedId = handCardId(mockDilemmaCard.name);

      await drop(draggedId, 'mission-under-0');

      expect(screen.getByRole('button', { name: /^under the mission pile, 1 card/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /on it$/ })).toBeNull();
    });

    // #645 filed a personnel dropped on a ship row, off any ship, into the away team. #886 removed
    // that route: the ship row holds ships, and any other card stays where it was.
    it.each([
      ['personnel', mockPersonnelCard],
      ['equipment', mockEquipmentCard],
      ['event', mockEventCard],
      ['interrupt', mockInterruptCard],
      ['dilemma', mockDilemmaCard],
    ])('leaves a %s dropped on a ship row, off any ship, in the hand (#645, #886)', async (_type, card) => {
      await setupWithMission([card]);
      const draggedId = handCardId(card.name);

      await drop(draggedId, 'ship-row-0');

      expect(document.body.querySelector(`[data-zone="hand"] [data-card-id="${draggedId}"]`)).not.toBeNull();
      expect(screen.queryByRole('button', { name: /Away team, 1 card/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /on it$/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^under the mission pile, 1 card/i })).toBeNull();
      expect(document.body.querySelector('[data-zone="ship-row-0"] [data-card-id]')).toBeNull();
    });
  });

  it('drags a ship out of a ship row to the discard pile', async () => {
    await setupOpenHand([mockShipCard]);
    // A card's instance id stays the same across a move (only its face changes), so the id the
    // hand fan first registered with useDraggable also names the ship once it sits in the ship
    // row.
    const [shipId] = mockDraggableIds;

    // First drop the ship on a mission's ship row.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-under-2' } });
    });

    // Then drag it from the ship row to the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'discard' } });
    });

    expect(document.body.querySelector('[data-zone="ship-row-2"] [data-card-id]')).toBeNull();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });

  it("moves a ship with a crew member to a different mission's ship row, keeping its crew aboard (#601)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;

    // Place the ship on mission 0.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-under-0' } });
    });

    // Re-open the hand (drag start closed it) and board the personnel card as crew.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });
    expect(document.body.querySelector('[aria-label*="u.s.s. relativity crew"]')).not.toBeNull();

    // Drag the crewed ship to mission 4's ship row, crossing over the missions in between.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-under-4' } });
    });

    const sourceRow = document.body.querySelector('[data-zone="ship-row-0"]');
    const destinationRow = document.body.querySelector('[data-zone="ship-row-4"]');
    expect(sourceRow!.querySelector('[data-card-id]')).toBeNull();
    const shipButton = screen.getByRole('button', { name: 'u.s.s. relativity' });
    expect(destinationRow!.contains(shipButton)).toBe(true);
    expect(destinationRow!.querySelector('[aria-label*="crew, 1 card"]')).not.toBeNull();

    // A tap on the ship opens its crew panel.
    await act(async () => {
      fireEvent.click(shipButton);
    });
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
  });

  it('drops a second, different ship on a mission that already holds one, over the first ship\'s crew zone, keeping both reachable (#668)', async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard]);
    const [firstShipId, secondShipId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstShipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstShipId }, over: { id: 'mission-under-1' } });
    });

    // #740 keeps the hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const reopenHand = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (reopenHand) {
      await act(async () => {
        fireEvent.click(reopenHand);
      });
    }

    // The pointer lands on the first ship's own crew zone (it covers almost the whole row,
    // #668) rather than the row itself.
    await act(async () => {
      mockOnDragStart!({ active: { id: secondShipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondShipId }, over: { id: `crew-${firstShipId}` } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-1"]') as HTMLElement;
    expect(shipRow.querySelector(`[data-card-id="${firstShipId}"]`)).not.toBeNull();
    expect(shipRow.querySelector(`[data-card-id="${secondShipId}"]`)).not.toBeNull();
  });

  it('drops two copies of the same ship card on the same mission as two separate cards, each with its own crew (#668)', async () => {
    await setupOpenHand([mockShipCard, mockShipCard, mockPersonnelCard]);
    const [firstCopyId, secondCopyId, personnelId] = mockDraggableIds;
    expect(firstCopyId).not.toBe(secondCopyId);

    await act(async () => {
      mockOnDragStart!({ active: { id: firstCopyId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstCopyId }, over: { id: 'mission-under-0' } });
    });
    // #740 keeps the hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const reopenHand = screen.queryByRole('button', { name: /^hand, 2 cards, tap to open$/i });
    if (reopenHand) {
      await act(async () => {
        fireEvent.click(reopenHand);
      });
    }

    // The second copy's drop lands on the first copy's crew zone, same as dropping on a
    // different ship above; it must land on the row as its own card, not aboard the first.
    await act(async () => {
      mockOnDragStart!({ active: { id: secondCopyId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondCopyId }, over: { id: `crew-${firstCopyId}` } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-0"]') as HTMLElement;
    expect(shipRow.querySelectorAll('[data-card-id]')).toHaveLength(2);
    expect(shipRow.querySelector(`[data-card-id="${firstCopyId}"]`)).not.toBeNull();
    expect(shipRow.querySelector(`[data-card-id="${secondCopyId}"]`)).not.toBeNull();

    // Board the personnel card onto the first copy specifically: its crew badge goes to 1, and
    // the second copy's crew stays at 0 (no badge).
    // #740 keeps the hand open after a drag out of it, so this tap only runs when the hand is
    // closed.
    const reopenHand2 = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (reopenHand2) {
      await act(async () => {
        fireEvent.click(reopenHand2);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${firstCopyId}` } });
    });

    expect(document.body.querySelector(`[data-zone="crew-${firstCopyId}"] [aria-label*="crew, 1 card"]`)).not.toBeNull();
    expect(document.body.querySelector(`[data-zone="crew-${secondCopyId}"] [aria-label*="crew, 0 cards"]`)).not.toBeNull();

    // Drag the first copy (with its crew) to a different mission: its crew goes with it, and
    // the second copy, still on mission 0, is unaffected.
    await act(async () => {
      mockOnDragStart!({ active: { id: firstCopyId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstCopyId }, over: { id: 'mission-under-3' } });
    });

    const originRow = document.body.querySelector('[data-zone="ship-row-0"]') as HTMLElement;
    const destinationRow = document.body.querySelector('[data-zone="ship-row-3"]') as HTMLElement;
    expect(originRow.querySelector(`[data-card-id="${firstCopyId}"]`)).toBeNull();
    expect(originRow.querySelector(`[data-card-id="${secondCopyId}"]`)).not.toBeNull();
    expect(destinationRow.querySelector(`[data-card-id="${firstCopyId}"]`)).not.toBeNull();
    expect(destinationRow.querySelector('[aria-label*="crew, 1 card"]')).not.toBeNull();
    expect(document.body.querySelector(`[data-zone="crew-${secondCopyId}"] [aria-label*="crew, 0 cards"]`)).not.toBeNull();
  });

  it('does not change the ship row when a ship is dropped back on the mission it already occupies (#601)', async () => {
    await setupOpenHand([mockShipCard]);
    const [shipId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-under-2' } });
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-under-2' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-2"]');
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });
});

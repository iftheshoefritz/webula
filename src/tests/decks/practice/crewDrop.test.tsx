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

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
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

const deckOf = (...cards: any[]) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

describe('Practice draw: dropping a card on a ship or its crew badge', () => {
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

  // Renders the page with the given deck and opens the hand, so its cards are draggable.
  const setupOpenHand = async (cards: any[]) => {
    localStorage.setItem('currentDeck', JSON.stringify(deckOf(...cards)));
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

  // Places the first draggable id (a ship dealt into the hand) onto the given mission's ship
  // row, then re-opens the (drag-start-closed) hand so the rest of the hand is draggable again.
  const placeShipOnMission = async (shipDraggableId: string, missionIndex: number, remainingCount: number) => {
    await act(async () => {
      mockOnDragStart!({ active: { id: shipDraggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipDraggableId }, over: { id: `mission-on-${missionIndex}` } });
    });
    const label = new RegExp(`^hand, ${remainingCount} cards?, tap to open$`, 'i');
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: label });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  it("moves a dragged personnel card off the hand and aboard a ship when dropped on its crew badge", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    // Gone from the hand...
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();

    // ...and now shown as crew: the ship's own personnel badge shows 1. A tap on the ship itself
    // (not the badge, which is not interactive) opens a panel listing its crew, and no preview.
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 1 card"]')).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });

  it("moves a dragged equipment card off the hand and aboard a ship when dropped on its crew badge", async () => {
    await setupOpenHand([mockShipCard, mockEquipmentCard]);
    const [shipId, equipmentId] = mockDraggableIds;
    await placeShipOnMission(shipId, 1, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: equipmentId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: equipmentId }, over: { id: `crew-badge-${shipId}` } });
    });

    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 1 card"]')).not.toBeNull();
  });

  it("routes a ship dropped on another ship's crew slot onto that ship's own row instead of aboard it (#668)", async () => {
    await setupOpenHand([mockShipCard, mockOtherShipCard]);
    const [shipId, otherShipId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 1);

    // The pointer lands on the first ship's crew zone (it covers almost the whole row, #668),
    // not on the row or the mission card itself, but the dropped card is a ship, not crew.
    await act(async () => {
      mockOnDragStart!({ active: { id: otherShipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: otherShipId }, over: { id: `crew-${shipId}` } });
    });

    // Gone from the hand, and now on mission 0's ship row alongside the first ship, not aboard
    // it as crew.
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
    const shipRow = document.body.querySelector('[data-zone="ship-row-0"]') as HTMLElement;
    expect(shipRow.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
    expect(shipRow.contains(screen.getByRole('button', { name: 'i.k.s. somraw' }))).toBe(true);
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 0 cards"]')).not.toBeNull();
  });

  it("drags a crew card from the ship's crew panel to the discard pile, removing it from the crew and keeping the panel on the ship (#832)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 4, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    // Tap the ship: it opens the crew panel, listing the crew member.
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

    // The crew member is gone from the crew (and now in the discard pile). The panel stays open
    // on the ship, with an empty crew (#832).
    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(0);
    expect(screen.getByTestId('card-list-panel-crew-ship')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'data' })).not.toBeInTheDocument();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 0 cards"]')).not.toBeNull();
  });

  it("tapping a crew card in the ship's crew panel selects it, keeping the panel open (#764)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 3, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });

    expect(screen.getByRole('button', { name: 'Deselect data' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'data' })).toHaveClass('ring-2');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'data' }));
    });
    expect(screen.getByRole('button', { name: 'Select data' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it("keeps the ship's crew panel open, showing the remaining crew member, after one is dragged out of it (#675)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard, mockEquipmentCard]);
    const [shipId, personnelId, equipmentId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 2);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
    await act(async () => {
      mockOnDragStart!({ active: { id: equipmentId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: equipmentId }, over: { id: `crew-badge-${shipId}` } });
    });

    // Tap the ship: it opens the crew panel, listing both crew members.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    let panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(2);

    // Drag one crew member out to the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'discard' } });
    });

    // The panel is still open, now showing only the crew member still aboard.
    panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(1);
    expect(panel.querySelector(`[data-card-id="${equipmentId}"]`)).not.toBeNull();

    // Drag the last crew member out too: the panel stays open on the ship, with an empty crew
    // (#832).
    await act(async () => {
      mockOnDragStart!({ active: { id: equipmentId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: equipmentId }, over: { id: 'discard' } });
    });
    panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(0);
    expect(screen.getByTestId('card-list-panel-crew-ship')).toBeInTheDocument();
  });

  it("keeps the ship's crew panel open after a drag out of it is cancelled (#675)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragCancel!();
    });

    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]');
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll('[data-card-id]')).toHaveLength(1);
  });

  it('tapping a ship with crew opens its crew panel and no preview (#764)', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });

    expect(screen.queryByTestId('card-preview')).toBeNull();
    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
  });

  it('tapping a ship with no crew opens its panel with the ship and an empty crew, and no preview (#764, #832)', async () => {
    await setupOpenHand([mockShipCard]);
    const [shipId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });

    expect(screen.queryByTestId('card-preview')).toBeNull();
    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(0);
    const shipSection = screen.getByTestId('card-list-panel-crew-ship');
    expect(shipSection.querySelector('img[alt="u.s.s. relativity"]')).not.toBeNull();
  });

  it('shows the ship in its own section of the crew panel, outside the crew grid (#832)', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });

    const panel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    const shipSection = screen.getByTestId('card-list-panel-crew-ship');
    // The ship's section shows the ship's whole card image, and sits outside the crew grid.
    expect(shipSection.querySelector('img[alt="u.s.s. relativity"]')).not.toBeNull();
    expect(panel.contains(shipSection)).toBe(false);
    // The crew grid still holds exactly the crew.
    expect(panel.querySelectorAll('[data-card-id]')).toHaveLength(1);
    expect(panel.querySelector(`[data-card-id="${personnelId}"]`)).not.toBeNull();
    // The ship's section is not a drag source, not a drop target and not a card button.
    expect(shipSection.querySelector('[data-card-id]')).toBeNull();
    expect(shipSection.querySelector('[data-zone]')).toBeNull();
    expect(shipSection.querySelector('button')).toBeNull();

    // A tap on the ship in the panel selects nothing, and the panel stays open.
    await act(async () => {
      fireEvent.click(shipSection.querySelector('img[alt="u.s.s. relativity"]')!);
    });
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();
  });

  it("closing the ship's crew panel leaves no preview", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });

    const closeButton = document.body.querySelector('button[aria-label="Close crew"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(closeButton);
    });

    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).toBeNull();
    expect(screen.queryByTestId('card-preview')).toBeNull();
  });
  it("boards a card dropped on the ship's crew badge into that ship's crew (#811)", async () => {
    const secondPersonnel = { ...mockPersonnelCard, collectorsinfo: '2C003', originalName: 'Worf', name: 'worf', imagefile: 'worf' };
    await setupOpenHand([mockShipCard, mockPersonnelCard, secondPersonnel]);
    const [shipId, personnelId, secondId] = mockDraggableIds;
    await placeShipOnMission(shipId, 2, 2);

    // The badge shows with an empty crew too (#812), so the first card boards through it.
    expect(document.body.querySelector(`[data-zone="crew-badge-${shipId}"]`)).not.toBeNull();
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-badge-${shipId}` } });
    });
    expect(document.body.querySelector(`[data-zone="crew-badge-${shipId}"]`)).not.toBeNull();

    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: `crew-badge-${shipId}` } });
    });

    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 2 cards"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Away team, [1-9]/i })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    expect(screen.getByRole('button', { name: 'worf' })).toBeInTheDocument();
  });

  // #645 filed this card into the away team; #886 removed that route, and the ship row holds ships.
  it('leaves a card dropped on a ship row, off any ship, out of both the away team and the crew (#645, #811, #886)', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'ship-row-0' } });
    });

    expect(screen.queryByRole('button', { name: /Away team, 1 card/i })).toBeNull();
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 0 cards"]')).not.toBeNull();
  });
  it("places a card dropped on a ship's art on the ship, and leaves its crew alone (#812)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 1);

    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });

    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 0 cards"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'u.s.s. relativity, 1 card on it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Away team, [1-9]/i })).toBeNull();
  });

  it('opens the cards on a ship from its counter, and its crew from the ship (#812)', async () => {
    const secondPersonnel = { ...mockPersonnelCard, collectorsinfo: '2C003', originalName: 'Worf', name: 'worf', imagefile: 'worf' };
    await setupOpenHand([mockShipCard, mockPersonnelCard, secondPersonnel]);
    const [shipId, onId, crewId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 2);

    await act(async () => {
      mockOnDragStart!({ active: { id: onId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: onId }, over: { id: `crew-${shipId}` } });
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: crewId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: crewId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity, 1 card on it' }));
    });
    const onPanel = document.body.querySelector('[data-testid="card-list-panel-on"]') as HTMLElement;
    expect(onPanel).not.toBeNull();
    expect(onPanel.querySelector(`[data-card-id="${onId}"]`)).not.toBeNull();
    expect(onPanel.querySelector(`[data-card-id="${crewId}"]`)).toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'u.s.s. relativity' }));
    });
    const crewPanel = document.body.querySelector('[data-testid="card-list-panel-crew"]') as HTMLElement;
    expect(crewPanel).not.toBeNull();
    expect(crewPanel.querySelector(`[data-card-id="${crewId}"]`)).not.toBeNull();
    expect(crewPanel.querySelector(`[data-card-id="${onId}"]`)).toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-on"]')).toBeNull();
  });

  it('carries the crew and the cards on it of a ship moved to another mission (#812, #872)', async () => {
    const secondPersonnel = { ...mockPersonnelCard, collectorsinfo: '2C003', originalName: 'Worf', name: 'worf', imagefile: 'worf' };
    await setupOpenHand([mockShipCard, mockPersonnelCard, secondPersonnel]);
    const [shipId, onId, crewId] = mockDraggableIds;
    await placeShipOnMission(shipId, 0, 2);

    await act(async () => {
      mockOnDragStart!({ active: { id: onId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: onId }, over: { id: `crew-${shipId}` } });
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: crewId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: crewId }, over: { id: `crew-badge-${shipId}` } });
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'ship-row-3' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-3"]') as HTMLElement;
    expect(shipRow.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
    expect(document.body.querySelector('[aria-label="u.s.s. relativity crew, 1 card"]')).not.toBeNull();
    // The card placed on the ship travels with it (#872); before, it went to the discard pile.
    expect(screen.getByRole('button', { name: 'u.s.s. relativity, 1 card on it' })).not.toBeNull();
    expect(screen.queryByAltText('Discard pile')).toBeNull();
  });
});

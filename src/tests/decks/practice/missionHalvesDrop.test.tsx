// Mock next/navigation hooks (required for App Router hooks in Jest/jsdom)
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('react-icons/fa', () => ({
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// See discardDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`/
// `onDragCancel` directly.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: any) => void) | null = null;
let mockOnDragEnd: ((event: any) => void) | null = null;
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
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const card = (collectorsinfo: string, name: string, type: string, pile: string) => ({
  collectorsinfo,
  originalName: name,
  type,
  name,
  imagefile: name.replace(/ /g, '_'),
  pile,
  count: 1,
});

const mockPersonnel = card('1U001', 'worf', 'personnel', 'drawDeck');
const mockEvent = card('1U002', 'distress call', 'event', 'drawDeck');
const mockShip = card('1U003', 'i.k.s. somraw', 'ship', 'drawDeck');
const mockMission = card('1R100', 'first contact', 'mission', 'mission');
const mockDilemma = card('1R200', 'cardassian trap', 'dilemma', 'dilemmaPile');

const mockDeck = Object.fromEntries(
  [mockPersonnel, mockEvent, mockShip, mockMission, mockDilemma].map((c) => [c.collectorsinfo, { count: 1, row: c }])
);

// Issue #871: the mission card has two drop halves. Since #917 the bottom half (`mission-on-<i>`)
// places a dilemma on the mission card, the top half (`mission-under-<i>`) puts it under the mission.
// Every other type routes the same way from either half.
describe('Practice table: the two drop halves of a mission card (#871)', () => {
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

    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue([mockPersonnel, mockEvent, mockShip]);
  });

  const setup = async () => {
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

  const cardId = (name: string) => {
    const id = screen.getByRole('button', { name }).closest('[data-card-id]')?.getAttribute('data-card-id');
    expect(id).toBeTruthy();
    return id!;
  };

  // Draws the dilemma into the dilemma hand and opens it, and returns the dilemma's id.
  const drawDilemma = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma pile top, tap to draw' }));
    });
    const closedDilemmaHand = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
    if (closedDilemmaHand) {
      await act(async () => {
        fireEvent.click(closedDilemmaHand);
      });
    }
    return cardId('cardassian trap');
  };

  const drop = async (id: string, overId: string) => {
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: overId } });
    });
  };

  const underButton = () => screen.queryByRole('button', { name: /Under the mission pile, 1 card, tap to open/i });
  const onPill = () => screen.queryByRole('button', { name: 'first contact, 1 event on it' });
  // #1081: a dilemma placed on the mission counts in a badge of its own.
  const dilemmaPill = () => screen.queryByRole('button', { name: 'first contact, 1 dilemma on it' });

  it('renders both halves as drop zones, and no whole-card mission zone', async () => {
    await setup();
    expect(document.body.querySelector('[data-zone="mission-on-0"]')).not.toBeNull();
    expect(document.body.querySelector('[data-zone="mission-under-0"]')).not.toBeNull();
    expect(document.body.querySelector('[data-zone="mission-0"]')).toBeNull();
  });

  it('places a dilemma dropped on the bottom half on the mission card, not under it', async () => {
    await setup();
    await drop(await drawDilemma(), 'mission-on-0');

    expect(dilemmaPill()).toBeInTheDocument();
    expect(onPill()).toBeNull();
    expect(underButton()).toBeNull();
  });

  it('puts a dilemma dropped on the top half under the mission, face up', async () => {
    await setup();
    await drop(await drawDilemma(), 'mission-under-0');

    expect(underButton()).toBeInTheDocument();
    expect(onPill()).toBeNull();
    expect(dilemmaPill()).toBeNull();
    expect(screen.getAllByAltText('cardassian trap').length).toBeGreaterThan(0);
  });

  // #1081: the dilemmas and the other cards placed on a mission count in two badges, and each badge
  // opens a panel of only its own cards.
  it('splits the cards placed on a mission into an events badge and a dilemma badge', async () => {
    await setup();
    await drop(cardId('distress call'), 'mission-on-0');
    await drop(await drawDilemma(), 'mission-on-0');

    expect(onPill()).toBeInTheDocument();
    expect(dilemmaPill()).toBeInTheDocument();
    expect(onPill()).toHaveAttribute('data-testid', 'mission-on-events-0');
    expect(dilemmaPill()).toHaveAttribute('data-testid', 'mission-on-dilemmas-0');

    const panelNames = (testId: string) =>
      Array.from(document.body.querySelectorAll(`[data-testid="${testId}"] img`)).map((img) => img.getAttribute('alt'));

    await act(async () => {
      fireEvent.click(onPill()!);
    });
    expect(panelNames('card-list-panel-onEvents')).toEqual(['distress call']);
    expect(screen.getByRole('button', { name: 'Close events on the card' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(dilemmaPill()!);
    });
    expect(document.body.querySelector('[data-testid="card-list-panel-onEvents"]')).toBeNull();
    expect(panelNames('card-list-panel-onDilemmas')).toEqual(['cardassian trap']);
  });

  // A saved game keeps the placed cards in one list, so the split needs no migration: a restore
  // shows each placed card in its own badge.
  it('restores the placed cards of a saved game into their own badges', async () => {
    await setup();
    await drop(cardId('distress call'), 'mission-on-0');
    await drop(await drawDilemma(), 'mission-on-0');
    expect(localStorage.getItem('practiceGame')).not.toBeNull();

    cleanup();
    await setup();

    expect(onPill()).toBeInTheDocument();
    expect(dilemmaPill()).toBeInTheDocument();
  });

  it('puts a dilemma dropped on the bottom half of a slot with no mission card under the mission', async () => {
    await setup();
    await drop(await drawDilemma(), 'mission-on-1');

    expect(underButton()).toBeInTheDocument();
  });

  it.each(['mission-on-0', 'mission-under-0'])('files a personnel dropped on %s into the away team', async (overId) => {
    await setup();
    await drop(cardId('worf'), overId);

    expect(screen.getByRole('button', { name: /Away team, 1 card, tap to open/i })).toBeInTheDocument();
  });

  it.each(['mission-on-0', 'mission-under-0'])('places an event dropped on %s on the mission card', async (overId) => {
    await setup();
    await drop(cardId('distress call'), overId);

    expect(onPill()).toBeInTheDocument();
  });

  it.each(['mission-on-0', 'mission-under-0'])('puts a ship dropped on %s in the ship row', async (overId) => {
    await setup();
    await drop(cardId('i.k.s. somraw'), overId);

    const shipRow = document.body.querySelector('[data-zone="ship-row-0"]')!;
    expect(shipRow.querySelector('img[alt="i.k.s. somraw"]')).not.toBeNull();
  });
});

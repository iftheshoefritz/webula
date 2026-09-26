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
  expandDeck: jest.fn(),
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
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { LANDED_CUE_MS } from '../../../app/decks/practice/LandedZoneContext';
import { landedZoneKey } from '../../../app/decks/practice/landedZoneKey';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockEquipmentCard = {
  collectorsinfo: '1U001',
  originalName: 'Tricorder',
  type: 'equipment',
  name: 'tricorder',
  imagefile: 'tricorder',
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

const mockDeck = {
  [mockEquipmentCard.collectorsinfo]: { count: 1, row: mockEquipmentCard },
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
};

describe('landedZoneKey (#778)', () => {
  it('keys a flat zone by its own name', () => {
    expect(landedZoneKey('discard')).toBe('discard');
    expect(landedZoneKey('pile')).toBe('pile');
    expect(landedZoneKey('dilemmaPile')).toBe('dilemmaPile');
    expect(landedZoneKey('hand')).toBe('hand');
  });

  it('keys a ship row, a crew, and each mission pile by its drop id', () => {
    expect(landedZoneKey({ zone: 'shipRow', missionIndex: 2 })).toBe('ship-row-2');
    expect(landedZoneKey({ zone: 'crew', shipId: 'card-4' })).toBe('crew-card-4');
    expect(landedZoneKey({ zone: 'missionPile', missionIndex: 1, pile: 'personnel' })).toBe('mission-pile-personnel-1');
    expect(landedZoneKey({ zone: 'missionPile', missionIndex: 1, pile: 'event' })).toBe('mission-pile-event-1');
    expect(landedZoneKey({ zone: 'missionPile', missionIndex: 0, pile: 'underMission' })).toBe(
      'mission-pile-underMission-0'
    );
  });
});

describe('Practice table: the zone a dropped card lands in plays a cue (#778)', () => {
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
    (expandDeck as jest.Mock).mockReturnValue([mockEquipmentCard, mockEventCard]);
  });

  afterEach(() => {
    jest.useRealTimers();
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

  // The id of the open hand's card with this name.
  const handCardId = (name: string) => {
    const button = screen.getByRole('button', { name });
    const id = button.closest('[data-card-id]')?.getAttribute('data-card-id');
    expect(id).toBeTruthy();
    return id!;
  };

  const drop = async (id: string, overId: string | null) => {
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: overId === null ? null : { id: overId } });
    });
  };

  const landedElements = () => Array.from(document.body.querySelectorAll('[data-landed]'));
  const zone = (name: string) => document.body.querySelector(`[data-zone="${name}"]`);

  it('marks the personnel badge a personnel-pile card creates on a mission, and not the event badge', async () => {
    await setup();
    await drop(handCardId('tricorder'), 'mission-0');

    const badge = zone('mission-pile-personnel-0');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('data-landed');
    expect(badge!.querySelector('[data-testid="landed-ring"]')).not.toBeNull();
    expect(zone('mission-pile-event-0')).toBeNull();
    expect(zone('mission-0')).not.toHaveAttribute('data-landed');
    expect(landedElements()).toHaveLength(1);
  });

  it('marks the event badge for an event dropped on a mission', async () => {
    await setup();
    await drop(handCardId('distress call'), 'mission-0');

    expect(zone('mission-pile-event-0')).toHaveAttribute('data-landed');
    expect(zone('mission-pile-personnel-0')).toBeNull();
  });

  it('marks the badge a card is dropped on directly, overriding the mission routing', async () => {
    await setup();
    await drop(handCardId('tricorder'), 'mission-pile-event-0');

    expect(zone('mission-pile-event-0')).toHaveAttribute('data-landed');
    expect(zone('mission-pile-personnel-0')).toBeNull();
  });

  it.each(['discard', 'core', 'draw-pile-top', 'draw-pile-bottom'])('marks the zone for a drop on %s', async (overId) => {
    await setup();
    await drop(handCardId('tricorder'), overId);

    const landed = landedElements();
    expect(landed).toHaveLength(1);
    if (overId.startsWith('draw-pile')) {
      // The cue belongs on the pile as a whole, the box holding both drop halves.
      expect(landed[0].querySelector('[data-zone="draw-pile-top"]')).not.toBeNull();
      expect(landed[0].querySelector('[data-zone="draw-pile-bottom"]')).not.toBeNull();
    } else {
      expect(landed[0]).toBe(zone(overId));
    }
  });

  it('marks the closed hand for a card dropped on it from the core', async () => {
    await setup();
    const id = handCardId('tricorder');
    await drop(id, 'core');
    await drop(id, 'hand');

    expect(zone('hand')).toHaveAttribute('data-landed');
    expect(landedElements()).toHaveLength(1);
  });

  it('marks nothing for a drop over no target, over a target that takes no card, or a cancel', async () => {
    await setup();
    const id = handCardId('tricorder');

    await drop(id, null);
    expect(landedElements()).toHaveLength(0);

    await drop(id, 'nowhere');
    expect(landedElements()).toHaveLength(0);

    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragCancel!();
    });
    expect(landedElements()).toHaveLength(0);
  });

  it('marks nothing for a release inside the dead rectangle', async () => {
    await setup();
    const id = handCardId('tricorder');
    const element = document.body.querySelector(`[data-card-id="${id}"]`) as HTMLElement;
    const rect = { left: 370, top: 503, right: 443, bottom: 607, width: 73, height: 104, x: 370, y: 503 };
    element.getBoundingClientRect = () => ({ ...rect, toJSON: () => ({}) }) as DOMRect;

    await act(async () => {
      mockOnDragStart!({ active: { id }, activatorEvent: { clientX: 406.5, clientY: 555, target: element } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: 'discard' }, delta: { x: 5, y: -8 } });
    });

    expect(zone('discard')).not.toHaveAttribute('data-landed');
    expect(landedElements()).toHaveLength(0);
  });

  it('clears the cue after its duration, and a second drop on the same zone restarts it', async () => {
    jest.useFakeTimers();
    await setup();
    await drop(handCardId('tricorder'), 'discard');

    const firstRing = zone('discard')!.querySelector('[data-testid="landed-ring"]');
    expect(firstRing).not.toBeNull();

    await drop(handCardId('distress call'), 'discard');
    const secondRing = zone('discard')!.querySelector('[data-testid="landed-ring"]');
    expect(secondRing).not.toBeNull();
    // A new element, so its animation starts again.
    expect(secondRing).not.toBe(firstRing);

    await act(async () => {
      jest.advanceTimersByTime(LANDED_CUE_MS - 1);
    });
    expect(zone('discard')).toHaveAttribute('data-landed');

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(zone('discard')).not.toHaveAttribute('data-landed');
    expect(landedElements()).toHaveLength(0);
  });

});

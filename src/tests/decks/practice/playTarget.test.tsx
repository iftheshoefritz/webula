// The Play drop target (#1729): during a drag of an event that resolves at once from the hand, a target
// above the bottom row plays it into the resolving zone. `?fixture=costs` ends its hand with These Are
// The Voyages (cost 1) and At What Cost? (cost 0), and holds Surprise Party, which plays in the core.
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
const mockData: any[] = (() => {
  const { readFileSync } = jest.requireActual('fs');
  const { join } = jest.requireActual('path');
  const [head, ...rows] = (readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8') as string)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    return row;
  });
})();
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// Just enough of dnd-kit to drive the drag handlers directly: jsdom has no pointer geometry.
let mockOnDragStart: ((event: any) => void) | null = null;
let mockOnDragMove: ((event: any) => void) | null = null;
let mockOnDragEnd: ((event: any) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragMove, onDragEnd }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragMove = onDragMove;
      mockOnDragEnd = onDragEnd;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, act, screen } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { PLAY_TARGET_MARGIN, playTargetEligible, playTargetLine } from '../../../app/decks/practice/playTarget';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const event = (gametext: string): CardInstance => ({ id: 'e', key: 'e', card: { type: 'event', gametext } as any, faceUp: true } as any);
const resolving = event('Draw two cards.');

describe('playTargetEligible (#1729)', () => {
  const base = {
    resolveEvents: true,
    table: { segment: 'playAndDraw' as const, attempt: undefined, resolving: null },
    group: [resolving],
    fromHand: true,
  };

  it('is true for one event that resolves at once, from the hand, in play and draw, with the setting on', () => {
    expect(playTargetEligible(base)).toBe(true);
  });

  it.each([
    ['the setting is off', { resolveEvents: false }],
    ['the segment is orders', { table: { ...base.table, segment: 'orders' as const } }],
    ['an attempt is in progress', { table: { ...base.table, attempt: {} as any } }],
    ['an event is resolving', { table: { ...base.table, resolving } }],
    ['the drag is not from the hand', { fromHand: false }],
    ['the drag carries two cards', { group: [resolving, resolving] }],
    ['the event plays in the core', { group: [event('Plays in your core.')] }],
  ])('is false when %s', (_, change) => {
    expect(playTargetEligible({ ...base, ...change })).toBe(false);
  });
});

describe('playTargetLine (#1729)', () => {
  it('is the margin above the highest top', () => {
    expect(playTargetLine([500, 420])).toBe(420 - PLAY_TARGET_MARGIN);
    expect(playTargetLine([500, null])).toBe(500 - PLAY_TARGET_MARGIN);
    expect(playTargetLine([undefined, null])).toBeNull();
  });
});

const KEY = 'practiceGame:fixture=costs';
const saved = () => JSON.parse(localStorage.getItem(KEY)!);
const handIdOf = (name: string): string =>
  saved().table.hand.find((c: any) => saved().dealtDeck[c.key].row.originalName === name).id;

// Every element sits at a top of 500 in this test, so the line is 500 less the margin.
const LINE = 500 - PLAY_TARGET_MARGIN;
const PRESS = { clientX: 300, clientY: 560 };

const startDrag = (id: string) =>
  act(() => {
    mockOnDragStart!({ active: { id, data: { current: {} } }, activatorEvent: PRESS });
  });
const moveTo = (id: string, y: number) =>
  act(() => {
    mockOnDragMove!({ active: { id }, delta: { x: 0, y: y - PRESS.clientY } });
  });
const dropOn = (id: string, overId: string, y: number) =>
  act(() => {
    mockOnDragEnd!({ active: { id }, over: { id: overId }, delta: { x: 0, y: y - PRESS.clientY } });
  });

describe('the Play target on ?fixture=costs (#1729)', () => {
  let rectSpy: jest.SpyInstance;

  const renderTable = async (resolveEvents: boolean) => {
    localStorage.clear();
    localStorage.setItem('practice-turn-counters', 'true');
    localStorage.setItem('practice-resolve-events', String(resolveEvents));
    mockSearchParamsValue = new URLSearchParams('fixture=costs&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      bottom: 580,
      left: 0,
      right: 800,
      width: 800,
      height: 80,
      x: 0,
      y: 500,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => rectSpy.mockRestore());

  it('shows above the line only, and a drop on it plays These Are The Voyages into the resolving panel', async () => {
    await renderTable(true);
    const id = handIdOf('These Are The Voyages');
    startDrag(id);
    moveTo(id, LINE + 4);
    expect(screen.queryByTestId('play-target')).toBeNull();
    moveTo(id, LINE - 4);
    const target = screen.getByTestId('play-target');
    expect(target).toHaveAttribute('data-zone', 'resolving');
    expect(target).toHaveTextContent('Play');
    moveTo(id, LINE + 4);
    expect(screen.queryByTestId('play-target')).toBeNull();
    moveTo(id, 100);
    dropOn(id, 'resolving', 100);
    expect(screen.queryByTestId('play-target')).toBeNull();
    expect(saved().table.resolving.id).toBe(id);
    expect(screen.getByTestId('resolving-panel')).toBeInTheDocument();
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('1/7');
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Played These Are The Voyages (cost 1)');
  });

  it('leaves a drop on the discard pile uncharged', async () => {
    await renderTable(true);
    const id = handIdOf('These Are The Voyages');
    startDrag(id);
    moveTo(id, LINE + 40);
    expect(screen.queryByTestId('play-target')).toBeNull();
    dropOn(id, 'discard', LINE + 40);
    expect(saved().table.discard.map((c: any) => c.id)).toEqual([id]);
    expect(saved().table.resolving).toBeNull();
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('0/7');
  });

  it('never shows for Surprise Party, which plays in the core', async () => {
    await renderTable(true);
    const id = handIdOf('Surprise Party');
    startDrag(id);
    moveTo(id, 100);
    expect(screen.queryByTestId('play-target')).toBeNull();
    dropOn(id, 'resolving', 100);
    expect(saved().table.resolving).toBeNull();
  });

  it('never shows with the setting off', async () => {
    await renderTable(false);
    const id = handIdOf('These Are The Voyages');
    startDrag(id);
    moveTo(id, 100);
    expect(screen.queryByTestId('play-target')).toBeNull();
  });
});

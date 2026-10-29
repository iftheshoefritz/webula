// Issue #1342: in the facing phase, a drag from the row of the attempting personnel that holds over
// View full table for `PLACE_ON_HOLD_MS` switches to the full table without ending the drag. The
// attempt layout stays parked, hidden, with only the row, until the drag ends.
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

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// See placedOnDrop.test.tsx: drives the drag callbacks directly, and records whether each droppable
// is disabled at its last render.
type DragEvent = { active: { id: string }; over: { id: string } | null };
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragOver: ((event: DragEvent) => void) | null = null;
let mockOnDragEnd: ((event: DragEvent) => void) | null = null;
let mockOnDragCancel: (() => void) | null = null;
const mockDroppableDisabled = new Map<string, boolean>();
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragOver, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragOver = onDragOver;
      mockOnDragEnd = onDragEnd;
      mockOnDragCancel = onDragCancel;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
      mockDroppableDisabled.set(id, disabled === true);
      return { setNodeRef: () => {}, isOver: false };
    },
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { VIEW_FULL_TABLE_HOLD_ID } from '../../../app/decks/practice/AttemptLayout';
import { attemptCrewDropId } from '../../../app/decks/practice/AttemptPersonnelRow';
import { PLACE_ON_HOLD_MS } from '../../../app/decks/practice/useCardHold';
import type { SavedTable } from '../../../app/decks/practice/savedGame';

// The deck of the attempt fixture (#1169): Bilana System, slot 2, is a space mission with the
// crewed ship; slot 0 is a planet mission.
const mockAttemptDeck = () => {
  const row = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    collectorsinfo: id,
    originalName: `Card ${id}`,
    name: `card ${id}`,
    imagefile: `card_${id}`,
    type,
    pile: type === 'mission' ? 'mission' : type === 'dilemma' ? 'dilemmaPile' : 'drawDeck',
    count: 1,
    ...extra,
  });
  const rows = [
    ...['p', 'p', 's', 'h', 'p'].map((t, i) => row(`M${i}`, 'mission', { missiontype: t })),
    ...Array.from({ length: 20 }, (_, i) => row(`P${i}`, 'personnel')),
    row('S0', 'ship'),
    ...Array.from({ length: 6 }, (_, i) => row(`E${i}`, 'event')),
    ...Array.from({ length: 10 }, (_, i) => row(`K${i}`, 'equipment')),
    ...Array.from({ length: 10 }, (_, i) => row(`D${i}`, 'dilemma')),
  ];
  (deckFromTsv as jest.Mock).mockReturnValue(Object.fromEntries(rows.map((r) => [r.collectorsinfo, { count: 1, row: r }])));
  (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
    Object.values(deck)
      .map((entry) => (entry as { row: { pile: string } }).row)
      .filter((r) => r.pile === 'drawDeck'),
  );
};

const renderFixture = async (fixture: string) => {
  mockSearchParamsValue = new URLSearchParams(`fixture=${fixture}&reset=1&menu=0`);
  await act(async () => {
    render(<PracticeDrawPage />);
  });
};

const savedTable = (fixture = 'attempt'): SavedTable =>
  JSON.parse(localStorage.getItem(`practiceGame:fixture=${fixture}`)!).table;
const ship = () => savedTable().missions[2].ships[0];
const crewIds = () => (ship().crew ?? []).map((c) => c.id);
const undoLabel = () => screen.getByTestId('undo-button').getAttribute('aria-label');

const start = async (id: string) => {
  await act(async () => {
    mockOnDragStart!({ active: { id } });
  });
};
const over = async (id: string, overId: string | null) => {
  await act(async () => {
    mockOnDragOver!({ active: { id }, over: overId ? { id: overId } : null });
  });
};
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
const end = async (id: string, overId: string | null) => {
  await act(async () => {
    mockOnDragEnd!({ active: { id }, over: overId ? { id: overId } : null });
  });
};

// A drag from the crew row held over View full table until the switch.
const holdOverViewFullTable = async (id: string) => {
  await start(id);
  await over(id, VIEW_FULL_TABLE_HOLD_ID);
  await wait(PLACE_ON_HOLD_MS);
};

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  mockDroppableDisabled.clear();
  (getSession as jest.Mock).mockResolvedValue(null);
  (useDataFetching as jest.Mock).mockReturnValue({ data: [{ collectorsinfo: 'x' }], loading: false });
  mockAttemptDeck();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a hold over View full table during a drag from the attempt row (#1342)', () => {
  it('switches to the full table mid-drag, and a drop on the hand moves the card in one log entry', async () => {
    await renderFixture('attempt');
    const [id] = crewIds();
    const handBefore = savedTable().hand.length;
    const drawSpend = screen.getByTestId('attempt-draw-spend').textContent;
    expect(mockDroppableDisabled.get(VIEW_FULL_TABLE_HOLD_ID)).toBe(true);

    await start(id);
    expect(mockDroppableDisabled.get(VIEW_FULL_TABLE_HOLD_ID)).toBe(false);
    await over(id, VIEW_FULL_TABLE_HOLD_ID);
    await wait(PLACE_ON_HOLD_MS);

    // The full table shows, and the drag goes on: the overlay is still drawn.
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    expect(screen.getByTestId('attempt-back-to-attempt')).toBeInTheDocument();
    expect(screen.getByTestId('drag-overlay-card')).toBeInTheDocument();
    // The parked layout keeps the row, with the pressed card, and none of its other droppables.
    const parked = screen.getByTestId('attempt-layout-parked');
    expect(parked.querySelector(`[data-card-id="${id}"]`)).not.toBeNull();
    expect(mockDroppableDisabled.get(attemptCrewDropId(ship().id))).toBe(true);
    for (const target of ['mission-on-2', 'mission-under-2', 'ship-row-2', `crew-${ship().id}`, 'dilemmaStack']) {
      expect(parked.querySelector(`[data-zone="${target}"]`)).toBeNull();
      expect(document.querySelectorAll(`[data-zone="${target}"]`).length).toBeLessThanOrEqual(1);
    }

    await over(id, 'hand');
    await end(id, 'hand');
    expect(savedTable().hand.length).toBe(handBefore + 1);
    expect(crewIds()).not.toContain(id);
    expect(screen.queryByTestId('attempt-layout-parked')).toBeNull();
    expect(screen.getByTestId('attempt-back-to-attempt')).toBeInTheDocument();

    // One undo takes the move back.
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(crewIds()).toContain(id);
    expect(savedTable().hand.length).toBe(handBefore);

    // Back to attempt: the numbers of the attempt did not change.
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-back-to-attempt'));
    });
    expect(screen.getByTestId('attempt-draw-spend').textContent).toBe(drawSpend);
  });

  it('drops on another mission after the switch: its away team gains the card, and the row loses it', async () => {
    await renderFixture('attempt');
    const [id] = crewIds();
    const drawSpend = screen.getByTestId('attempt-draw-spend').textContent;
    const teamBefore = savedTable().missions[0].awayTeam.length;
    await holdOverViewFullTable(id);
    await over(id, 'mission-on-0');
    await end(id, 'mission-on-0');
    expect(savedTable().missions[0].awayTeam.map((c) => c.id)).toContain(id);
    expect(savedTable().missions[0].awayTeam.length).toBe(teamBefore + 1);

    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-back-to-attempt'));
    });
    expect(screen.getByTestId('attempt-draw-spend').textContent).toBe(drawSpend);
    const row = document.querySelector(`[data-zone="${attemptCrewDropId(ship().id)}"]`)!;
    expect(row.querySelector(`[data-card-id="${id}"]`)).toBeNull();
  });

  it('does not switch on a pass shorter than the hold, and a release on the button moves nothing', async () => {
    await renderFixture('attempt');
    const [id] = crewIds();
    const before = crewIds();
    const label = undoLabel();
    await start(id);
    await over(id, VIEW_FULL_TABLE_HOLD_ID);
    await wait(PLACE_ON_HOLD_MS - 100);
    await over(id, 'hand');
    await wait(PLACE_ON_HOLD_MS);
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    await over(id, VIEW_FULL_TABLE_HOLD_ID);
    await end(id, VIEW_FULL_TABLE_HOLD_ID);
    await wait(PLACE_ON_HOLD_MS);
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    expect(crewIds()).toEqual(before);
    expect(undoLabel()).toBe(label);
  });

  it('leaves the card in the row on a cancel after the switch, and stays on the full table', async () => {
    await renderFixture('attempt');
    const [id] = crewIds();
    const before = crewIds();
    await holdOverViewFullTable(id);
    await act(async () => {
      mockOnDragCancel!();
    });
    expect(crewIds()).toEqual(before);
    expect(screen.queryByTestId('attempt-layout-parked')).toBeNull();
    expect(screen.getByTestId('attempt-back-to-attempt')).toBeInTheDocument();
  });

  it('never switches for a drag that did not start in the row', async () => {
    await renderFixture('attempt');
    const [id] = savedTable().hand.map((c) => c.id);
    await start(id);
    expect(mockDroppableDisabled.get(VIEW_FULL_TABLE_HOLD_ID)).toBe(true);
    await over(id, VIEW_FULL_TABLE_HOLD_ID);
    await wait(PLACE_ON_HOLD_MS);
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    await end(id, null);
  });

  it('never switches in the dilemma choice', async () => {
    await renderFixture('attempt-choose');
    const shipId = savedTable('attempt-choose').missions[2].ships[0];
    const [id] = (shipId.crew ?? []).map((c) => c.id);
    await start(id);
    expect(mockDroppableDisabled.get(VIEW_FULL_TABLE_HOLD_ID)).toBe(true);
    await over(id, VIEW_FULL_TABLE_HOLD_ID);
    await wait(PLACE_ON_HOLD_MS);
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    await end(id, null);
  });
});

// Issue #1192: the phase button of the attempt strip, Face dilemmas in the dilemma choice and Back to
// choosing in the facing phase.
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

jest.mock('react-icons/fa', () => ({
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
  FaTrash: () => null,
  FaFolder: () => null,
  FaFolderOpen: () => null,
  FaFolderPlus: () => null,
  FaSignInAlt: () => null,
  FaEdit: () => null,
  FaCheck: () => null,
  FaTimes: () => null,
  FaArrowLeft: () => null,
  FaExchangeAlt: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// See crewDrop.test.tsx: drives `onDragStart`/`onDragEnd` directly.
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import type { Attempt, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import type { SavedCardInstance, SavedTable } from '../../../app/decks/practice/savedGame';

// The deck of the attempt fixture (#1169), as in savedGamePage.test.tsx.
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
    row('S1', 'ship'),
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

const KEY = 'practiceGame:fixture=attempt-choose';
const savedTable = (): SavedTable => JSON.parse(localStorage.getItem(KEY)!).table;

const renderPage = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PracticeDrawPage />);
  });
  return result!;
};

// Deals the choice fixture, an attempt at Bilana System (slot 2) with its crewed ship, and with
// `stack` moves that many dilemmas from the dilemma pile into the stack, face up, before a remount.
const dealChoice = async (stack = 0) => {
  mockSearchParamsValue = new URLSearchParams('fixture=attempt-choose&reset=1');
  const first = await renderPage();
  if (!stack) return;
  first.unmount();
  const save = JSON.parse(localStorage.getItem(KEY)!);
  const moved: SavedCardInstance[] = save.table.dilemmaPile.splice(0, stack);
  save.table.dilemmaStack = moved.map((c) => ({ ...c, face: 'up' }));
  localStorage.setItem(KEY, JSON.stringify(save));
  mockSearchParamsValue = new URLSearchParams('fixture=attempt-choose');
  await renderPage();
};

const slot: MissionSlot = {
  mission: { id: 'm2', card: { name: 'Bilana System', originalName: 'Bilana System', imagefile: 'm2' }, face: 'up' } as any,
  ships: [],
  awayTeam: [],
  underMission: [],
};

const face = computeAttemptLayout(667, 280, false, 0, 1);
const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, true) };

const renderLayout = (attempt: Attempt, onSetPhase: (phase: Attempt['phase']) => void) => {
  const noop = () => {};
  return render(
    <AttemptLayout
      attempt={attempt}
      slot={slot}
      sizes={sizes}
      personnelCount={12}
      desktop={false}
      dilemmaStack={null}
      layoutRef={noop}
      stripRef={noop}
      onViewFullTable={noop}
      onEndAttempt={noop}
      onOpenPile={noop}
      onShipClick={noop}
      onOpenShipRow={noop}
      onOpenPlacedOn={noop}
      onFlipMission={noop}
      onSetMissionCompleted={noop}
      selectedIds={[]}
      onToggleSelect={noop}
      onSetStopped={noop}
      onShuffle={noop}
      canDrawDilemma
      onDrawDilemma={noop}
      onSetPhase={onSetPhase}
    />,
  );
};

const attempt = (phase: Attempt['phase']): Attempt => ({ missionIndex: 2, personnel: 12, subtract: 3, phase, drawn: 0 });

describe('AttemptLayout: the phase button (#1192)', () => {
  it('shows Face dilemmas in the dilemma choice, which asks for the facing phase', () => {
    const onSetPhase = jest.fn();
    renderLayout(attempt('choose'), onSetPhase);
    expect(screen.queryByTestId('attempt-back-to-choosing')).toBeNull();
    const button = screen.getByTestId('attempt-face-dilemmas');
    expect(button).toHaveTextContent('Face dilemmas');
    fireEvent.click(button);
    expect(onSetPhase).toHaveBeenCalledWith('face');
  });

  it('shows Back to choosing in the facing phase, which asks for the dilemma choice', () => {
    const onSetPhase = jest.fn();
    renderLayout(attempt('face'), onSetPhase);
    expect(screen.queryByTestId('attempt-face-dilemmas')).toBeNull();
    const button = screen.getByTestId('attempt-back-to-choosing');
    expect(button).toHaveTextContent('Back to choosing');
    fireEvent.click(button);
    expect(onSetPhase).toHaveBeenCalledWith('choose');
  });
});

describe('the phase button on the table (#1192)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [{ collectorsinfo: '1U001', originalName: 'X', type: 'equipment', name: 'x', imagefile: 'x', pile: 'drawDeck', count: 1 }], loading: false });
    (getSession as jest.Mock).mockResolvedValue(null);
    mockAttemptDeck();
  });

  it('faces the dilemmas, closing the dilemma hand, and goes back to the choice', async () => {
    await dealChoice(2);
    const pileBefore = savedTable().dilemmaPile.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-draw-dilemma'));
    });
    const left = savedTable().dilemmaHand.map((c) => c.id);
    expect(left).toHaveLength(1);
    expect(screen.getByTestId('dilemmaHand-arc')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-face-dilemmas'));
    });
    let table = savedTable();
    expect(table.attempt?.phase).toBe('face');
    expect(table.dilemmaStack.map((c) => c.face)).toEqual(['down', 'down']);
    expect(table.dilemmaHand).toHaveLength(0);
    expect(table.dilemmaPile).toHaveLength(pileBefore);
    const bottom = table.dilemmaPile[table.dilemmaPile.length - 1];
    expect(bottom.id).toBe(left[0]);
    expect(bottom.face).toBe('up');
    expect(screen.queryByTestId('dilemmaHand-arc')).toBeNull();
    expect(screen.queryByTestId('attempt-face-dilemmas')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-back-to-choosing'));
    });
    table = savedTable();
    expect(table.attempt?.phase).toBe('choose');
    expect(table.dilemmaStack.map((c) => c.face)).toEqual(['up', 'up']);
    expect(screen.getByTestId('attempt-personnel-pile')).toBeInTheDocument();
    expect(screen.getByTestId('attempt-face-dilemmas')).toBeInTheDocument();
  });
});


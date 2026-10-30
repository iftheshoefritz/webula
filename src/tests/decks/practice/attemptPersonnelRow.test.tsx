// Issue #1165: in the attempt layout the attempting personnel show as a row of cards, the away team
// at a planet mission and the crew of the attempting ship at a space mission.
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
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import {
  attemptAwayTeamDropId,
  attemptCrewDropId,
  missionIndexFromAttemptAwayTeamDropId,
  shipIdFromAttemptCrewDropId,
} from '../../../app/decks/practice/AttemptPersonnelRow';
import { missionIndexFromDropId, shipIdFromCrewDropId } from '../../../app/decks/practice/MissionRow';
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

const KEY = 'practiceGame:fixture=attempt';
// A save names each card by its deck key, and the first letter of a key here is its type.
const savedTable = (): SavedTable => JSON.parse(localStorage.getItem(KEY)!).table;
const TYPE_LETTER: Record<string, string> = { personnel: 'P', equipment: 'K', event: 'E', ship: 'S' };
const isType = (c: SavedCardInstance, type: string) => c.key[0] === TYPE_LETTER[type];

const renderPage = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PracticeDrawPage />);
  });
  return result!;
};

// Deals the attempt fixture, an attempt at Bilana System (slot 2) with its crewed ship, and with
// `planet` turns the save into an attempt at the planet mission of slot 0 before a remount.
const dealAttempt = async (planet = false) => {
  mockSearchParamsValue = new URLSearchParams('fixture=attempt&reset=1');
  const first = await renderPage();
  if (!planet) return;
  first.unmount();
  const save = JSON.parse(localStorage.getItem(KEY)!);
  const team: SavedCardInstance[] = save.table.missions[0].awayTeam;
  save.table.attempt = { missionIndex: 0, personnel: team.length, subtract: 0 };
  localStorage.setItem(KEY, JSON.stringify(save));
  mockSearchParamsValue = new URLSearchParams('fixture=attempt');
  await renderPage();
};

const rowIds = (dropId: string) =>
  Array.from(document.querySelectorAll(`[data-zone="${dropId}"] [data-card-id]`)).map((el) => el.getAttribute('data-card-id'));

const drag = async (id: string, over: string) => {
  await act(async () => {
    mockOnDragStart!({ active: { id } });
  });
  await act(async () => {
    mockOnDragEnd!({ active: { id }, over: { id: over } });
  });
};

describe('the row of the attempting personnel (#1165)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [{ collectorsinfo: '1U001', originalName: 'X', type: 'equipment', name: 'x', imagefile: 'x', pile: 'drawDeck', count: 1 }], loading: false });
    (getSession as jest.Mock).mockResolvedValue(null);
    mockAttemptDeck();
  });

  it('shows the away team, in order and face up, in place of the badge at a planet mission', async () => {
    await dealAttempt(true);
    const team = savedTable().missions[0].awayTeam;
    expect(team.length).toBeGreaterThan(0);
    expect(rowIds(attemptAwayTeamDropId(0))).toEqual(team.map((c) => c.id));
    expect(screen.queryByTestId('mission-pile-awayTeam-0')).toBeNull();
    const first = document.querySelector(`[data-zone="attempt-away-team-0"] [data-card-id="${team[0].id}"] img`)!;
    expect(first.getAttribute('src')).not.toMatch(/cardback/);
  });

  it('shows the crew of the attempting ship at a space mission, with no away team badge (#1365)', async () => {
    await dealAttempt();
    const ship = savedTable().missions[2].ships[0];
    expect(rowIds(attemptCrewDropId(ship.id))).toEqual((ship.crew ?? []).map((c) => c.id));
    expect(screen.queryByTestId('mission-pile-awayTeam-2')).toBeNull();
    expect(document.querySelector('[data-zone^="attempt-away-team-"]')).toBeNull();
  });

  it('stops and unstops the selection, and stops all, from the row', async () => {
    await dealAttempt(true);
    const [a, b] = savedTable().missions[0].awayTeam;
    expect(screen.queryByTestId('attempt-row-stop')).toBeNull();
    const card = (id: string) => document.querySelector(`[data-zone="attempt-away-team-0"] [data-card-id="${id}"]`)!;
    await act(async () => {
      fireEvent.click(card(a.id));
      fireEvent.click(card(b.id));
    });
    expect(screen.getByTestId('attempt-row-stop')).toHaveTextContent(/^Stop$/);
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-stop'));
    });
    const stopped = () => savedTable().missions[0].awayTeam.filter((c) => c.stopped).map((c) => c.id);
    expect(stopped()).toEqual([a.id, b.id]);
    expect(card(a.id).querySelector('img')!.className).toMatch(/grayscale/);
    expect(screen.getByTestId('attempt-row-stop')).toHaveTextContent(/^Unstop$/);
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-stop'));
    });
    expect(stopped()).toEqual([]);
    // The frozen numbers of the attempt do not change.
    expect(savedTable().attempt?.personnel).toBe(savedTable().missions[0].awayTeam.length);

    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-stop-all'));
    });
    const team = savedTable().missions[0].awayTeam;
    expect(team.filter((c) => isType(c, 'personnel')).every((c) => c.stopped)).toBe(true);
    expect(screen.queryByTestId('attempt-row-stop-all')).toBeNull();
  });

  it('shuffles the crew of the attempting ship from the row (#1179)', async () => {
    await dealAttempt();
    const shipId = savedTable().missions[2].ships[0].id;
    const before = rowIds(attemptCrewDropId(shipId));
    (shuffleArray as jest.Mock).mockImplementationOnce((arr: unknown[]) => [...arr].reverse());
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-shuffle'));
    });
    expect(shuffleArray).toHaveBeenCalledTimes(1);
    expect(rowIds(attemptCrewDropId(shipId))).toEqual([...before].reverse());
    expect((savedTable().missions[2].ships[0].crew ?? []).map((c) => c.id)).toEqual([...before].reverse());
  });

  it('shuffles the away team from the row at a planet mission (#1179)', async () => {
    await dealAttempt(true);
    const before = rowIds(attemptAwayTeamDropId(0));
    (shuffleArray as jest.Mock).mockImplementationOnce((arr: unknown[]) => [...arr].reverse());
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-shuffle'));
    });
    expect(rowIds(attemptAwayTeamDropId(0))).toEqual([...before].reverse());
    expect(savedTable().missions[0].awayTeam.map((c) => c.id)).toEqual([...before].reverse());
  });

  it('shows no Shuffle on an empty row (#1179)', async () => {
    await dealAttempt(true);
    for (const c of savedTable().missions[0].awayTeam) await drag(c.id, 'brig');
    expect(rowIds(attemptAwayTeamDropId(0))).toEqual([]);
    expect(screen.queryByTestId('attempt-row-shuffle')).toBeNull();
  });

  it('routes a drop on the away team row as a drop on the mission bottom half', async () => {
    await dealAttempt(true);
    const table = savedTable();
    const event = table.hand.find((c) => isType(c, 'event'))!;
    const ship = table.hand.find((c) => isType(c, 'ship')) ?? table.drawDeck.find((c) => isType(c, 'ship'));
    const tricorder = table.hand.find((c) => isType(c, 'equipment'))!;

    await drag(tricorder.id, attemptAwayTeamDropId(0));
    expect(savedTable().missions[0].awayTeam.map((c) => c.id)).toContain(tricorder.id);
    expect(rowIds(attemptAwayTeamDropId(0))).toContain(tricorder.id);

    await drag(event.id, attemptAwayTeamDropId(0));
    const mission = savedTable().missions[0].mission!;
    expect(mission.placedOn?.map((c) => c.id)).toContain(event.id);

    expect(ship).toBeDefined();
    await drag(ship!.id, attemptAwayTeamDropId(0));
    expect(savedTable().missions[0].ships.map((c) => c.id)).toContain(ship!.id);

    // A drag out of the row moves the card where the drop routes it, and out of the row.
    const first = savedTable().missions[0].awayTeam[0];
    await drag(first.id, 'brig');
    expect(savedTable().brig.map((c) => c.id)).toContain(first.id);
    expect(rowIds(attemptAwayTeamDropId(0))).not.toContain(first.id);
  });

  it('routes a drop on the crew row as a drop on the ship', async () => {
    await dealAttempt();
    const table = savedTable();
    const shipId = table.missions[2].ships[0].id;
    const tricorder = table.hand.find((c) => isType(c, 'equipment'))!;
    const event = table.hand.find((c) => isType(c, 'event'))!;

    await drag(tricorder.id, attemptCrewDropId(shipId));
    expect(savedTable().missions[2].ships[0].crew?.map((c) => c.id)).toContain(tricorder.id);
    expect(rowIds(attemptCrewDropId(shipId))).toContain(tricorder.id);

    await drag(event.id, attemptCrewDropId(shipId));
    expect(savedTable().missions[2].ships[0].placedOn?.map((c) => c.id)).toContain(event.id);
  });

  it('moves the whole selection when a selected row card is dragged', async () => {
    await dealAttempt(true);
    const [a, b] = savedTable().missions[0].awayTeam;
    const card = (id: string) => document.querySelector(`[data-zone="attempt-away-team-0"] [data-card-id="${id}"]`)!;
    await act(async () => {
      fireEvent.click(card(a.id));
      fireEvent.click(card(b.id));
    });
    await drag(a.id, 'brig');
    expect(savedTable().brig.map((c) => c.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});

describe('Move to… of the attempt row (#1341)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [{ collectorsinfo: '1U001', originalName: 'X', type: 'equipment', name: 'x', imagefile: 'x', pile: 'drawDeck', count: 1 }], loading: false });
    (getSession as jest.Mock).mockResolvedValue(null);
    mockAttemptDeck();
  });

  const crewCard = (shipId: string, id: string) =>
    document.querySelector(`[data-zone="${attemptCrewDropId(shipId)}"] [data-card-id="${id}"]`)!;

  it('shows only while a card of the row is selected, and moves it to the hand', async () => {
    await dealAttempt();
    const ship = savedTable().missions[2].ships[0];
    const [a] = ship.crew ?? [];
    const drawSpend = screen.getByTestId('attempt-draw-spend').textContent;
    expect(screen.queryByTestId('attempt-row-move-to')).toBeNull();
    await act(async () => {
      fireEvent.click(crewCard(ship.id, a.id));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-move-to'));
    });
    expect(screen.getByTestId('attempt-move-to-menu')).toBeInTheDocument();
    // Nothing at the attempted mission: neither its away team nor the attempting ship's crew.
    expect(screen.queryByTestId('attempt-move-to-awayTeam-2')).toBeNull();
    expect(screen.queryByTestId(`attempt-move-to-crew-${ship.id}`)).toBeNull();
    expect(screen.getByTestId('attempt-move-to-awayTeam-0')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-move-to-hand'));
    });
    expect(screen.queryByTestId('attempt-move-to-menu')).toBeNull();
    expect(rowIds(attemptCrewDropId(ship.id))).not.toContain(a.id);
    expect(savedTable().hand.map((c) => c.id)).toContain(a.id);
    // The selection is empty, so the button is gone.
    expect(screen.queryByTestId('attempt-row-move-to')).toBeNull();
    expect(screen.getByTestId('attempt-draw-spend').textContent).toBe(drawSpend);
  });

  it('moves two cards to the top of the draw deck in row order, in one log entry that one undo takes back', async () => {
    await dealAttempt();
    const ship = savedTable().missions[2].ships[0];
    const [a, b] = ship.crew ?? [];
    const before = rowIds(attemptCrewDropId(ship.id));
    const drawSpend = screen.getByTestId('attempt-draw-spend').textContent;
    const undoLabel = () => screen.getByTestId('undo-button').getAttribute('aria-label');
    const lastEntry = undoLabel();
    await act(async () => {
      fireEvent.click(crewCard(ship.id, b.id));
      fireEvent.click(crewCard(ship.id, a.id));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-move-to'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-move-to-drawDeck-top'));
    });
    expect(savedTable().drawDeck.slice(0, 2).map((c) => c.id)).toEqual([a.id, b.id]);
    expect(rowIds(attemptCrewDropId(ship.id))).toEqual(before.filter((id) => id !== a.id && id !== b.id));
    expect(undoLabel()).toMatch(/^Undo: Moved .* to the top of the draw deck/);
    expect(screen.getByTestId('attempt-draw-spend').textContent).toBe(drawSpend);
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(rowIds(attemptCrewDropId(ship.id))).toEqual(before);
    expect(undoLabel()).toBe(lastEntry);
  });

  it("moves a card to another mission's away team", async () => {
    await dealAttempt();
    const ship = savedTable().missions[2].ships[0];
    const [a] = ship.crew ?? [];
    const team = savedTable().missions[0].awayTeam.length;
    await act(async () => {
      fireEvent.click(crewCard(ship.id, a.id));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-move-to'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-move-to-awayTeam-0'));
    });
    expect(savedTable().missions[0].awayTeam.length).toBe(team + 1);
    expect(savedTable().missions[0].awayTeam.map((c) => c.id)).toContain(a.id);
    expect(rowIds(attemptCrewDropId(ship.id))).not.toContain(a.id);
  });

  it('closes the list with no move on a tap on the backdrop', async () => {
    await dealAttempt(true);
    const [a] = savedTable().missions[0].awayTeam;
    await act(async () => {
      fireEvent.click(document.querySelector(`[data-zone="attempt-away-team-0"] [data-card-id="${a.id}"]`)!);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('attempt-row-move-to'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close the Move to list'));
    });
    expect(screen.queryByTestId('attempt-move-to-menu')).toBeNull();
    expect(rowIds(attemptAwayTeamDropId(0))).toContain(a.id);
  });
});

describe('the drop ids of the rows (#1165)', () => {
  it('parse back, and do not read as a crew or a mission drop id', () => {
    expect(missionIndexFromAttemptAwayTeamDropId(attemptAwayTeamDropId(3))).toBe(3);
    expect(shipIdFromAttemptCrewDropId(attemptCrewDropId('card-39'))).toBe('card-39');
    expect(shipIdFromCrewDropId(attemptCrewDropId('card-39'))).toBeNull();
    expect(missionIndexFromDropId(attemptAwayTeamDropId(3))).toBeNull();
    expect(shipIdFromAttemptCrewDropId('crew-card-39')).toBeNull();
    expect(missionIndexFromAttemptAwayTeamDropId('mission-on-3')).toBeNull();
  });
});

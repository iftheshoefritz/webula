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
    useDraggable: ({ id, data, disabled }: { id: string; data?: { showBack?: boolean }; disabled?: boolean }) => {
      // The top card of the draw deck and the dilemma pile (#814) is left out, so the ids here
      // stay the table cards' ids, in the order these tests expect. So is a card that cannot be
      // dragged, the mission card of the attempt (#1170).
      if (!data?.showBack && !disabled) mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { enterAttempt, mockAttemptMission } from '../../fixtures/enterAttempt';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';

// Issue #1519: in a bot game's facing phase, the revealed top card of the dilemma stack shows the
// bot's choice for it, and a tap dismisses it for the rest of the attempt.

const mockLabelled = {
  collectorsinfo: '17V017',
  originalName: '"Well-Prepared Defenses"',
  type: 'dilemma',
  name: 'well-prepared defenses',
  imagefile: 'wpd',
  pile: 'dilemmaPile',
  count: 1,
};
const mockOther = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 1,
};

// The play of a dilemma reads its group, so the away team holds one personnel.
const mockPersonnel = {
  collectorsinfo: '1C001',
  originalName: 'Alpha',
  type: 'personnel',
  name: 'alpha',
  imagefile: 'alpha',
  skills: 'Physics',
  integrity: 5,
  cunning: 5,
  strength: 5,
  pile: 'drawDeck',
  count: 1,
};

const mockDeck = {
  [mockPersonnel.collectorsinfo]: { count: 1, row: mockPersonnel },
  [mockLabelled.collectorsinfo]: { count: 1, row: mockLabelled },
  [mockOther.collectorsinfo]: { count: 1, row: mockOther },
  [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
};

// Issue #1552: Vault of Tomorrow names the dilemma it takes from the bot's pile.
const mockVault = {
  collectorsinfo: '9P001',
  originalName: 'Vault of Tomorrow',
  type: 'dilemma',
  name: 'vault of tomorrow',
  imagefile: 'vault_of_tomorrow',
  pile: 'dilemmaPile',
  count: 1,
};
const mockCheap = {
  collectorsinfo: '9P002',
  originalName: 'Unconventional Consideration',
  type: 'dilemma',
  name: 'unconventional consideration',
  imagefile: 'unconventional_consideration',
  pile: 'dilemmaPile',
  count: 1,
};
// Of cost 3, too dear for Vault of Tomorrow to take.
const mockDear = {
  collectorsinfo: '9P003',
  originalName: 'Hard Time',
  type: 'dilemma',
  name: 'hard time',
  imagefile: 'hard_time',
  pile: 'dilemmaPile',
  count: 1,
};

const label = () => screen.queryByTestId('dilemma-bot-label');

describe('Practice table: the bot label on the dilemma faced (#1519)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    (extractDrawDeck as jest.Mock).mockReturnValue([mockPersonnel]);
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });
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

  // Deals the deck, puts both dilemmas into the stack, Well-Prepared Defenses first, and enters an
  // attempt at mission 0 with `fields`. Returns the ids of the two dilemmas.
  const setup = async (fields: Record<string, unknown>, labelledFace: 'up' | 'down' = 'up') => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const save = JSON.parse(localStorage.getItem('practiceGame')!);
    // A save names each card by its key in the deck.
    const pile: { id: string; key: string }[] = save.table.dilemmaPile;
    const labelled = pile.find((c) => c.key === mockLabelled.collectorsinfo)!;
    const other = pile.find((c) => c !== labelled)!;
    save.table.dilemmaPile = [];
    save.table.missions[0].awayTeam = save.table.drawDeck;
    save.table.drawDeck = [];
    save.table.dilemmaStack = [
      { ...labelled, face: labelledFace },
      { ...other, face: 'down' },
    ];
    localStorage.setItem('practiceGame', JSON.stringify(save));
    await enterAttempt(<PracticeDrawPage />, 0, { drawn: 0, ...fields });
    return { labelledId: labelled.id, otherId: other.id };
  };
  const bot = { phase: 'face', botDraw: 2, botSpend: 2 };

  const drop = async (id: string, over: string) => {
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: over } });
    });
  };

  it('shows the label of the revealed top card, and a tap dismisses it for the rest of the attempt', async () => {
    const { labelledId, otherId } = await setup(bot);
    expect(label()).toHaveTextContent("Bot's missions: more points");
    expect(label()).toHaveAttribute('aria-label', "Bot's choice: Bot's missions: more points, tap to dismiss");
    await act(async () => {
      fireEvent.click(label()!);
    });
    expect(label()).toBeNull();
    // The panel did not open.
    expect(screen.queryByTestId('card-list-panel-dilemmaStack')).toBeNull();

    // Another card becomes the top, then Well-Prepared Defenses comes back and is revealed again.
    await drop(labelledId, 'discard');
    await drop(otherId, 'discard');
    await drop(labelledId, 'dilemmaStack');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reveal top dilemma' }));
    });
    expect(screen.getByRole('button', { name: /^Dilemma stack, 1 card/ })).toBeInTheDocument();
    expect(label()).toBeNull();
  });

  it('shows no label while the top card is face down, and shows it once revealed', async () => {
    await setup(bot, 'down');
    expect(label()).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reveal top dilemma' }));
    });
    expect(label()).toHaveTextContent("Bot's missions: more points");
  });

  it('shows no label in the dilemma choice', async () => {
    await setup({ ...bot, phase: 'choose' });
    expect(label()).toBeNull();
  });

  it('shows no label outside a bot game', async () => {
    await setup({ phase: 'face' });
    expect(label()).toBeNull();
  });

  // Deals Vault of Tomorrow and `inPile`, puts Vault of Tomorrow face up into the stack, leaves
  // `inPile` in the dilemma pile, and enters a bot attempt at mission 0 in the facing phase.
  // `fields` sets more of the attempt (#1556), the spend among them.
  const setupVault = async (inPile: (typeof mockCheap)[], fields: Record<string, unknown> = { botSpend: 3 }) => {
    const deck: Record<string, { count: number; row: unknown }> = {
      [mockPersonnel.collectorsinfo]: { count: 1, row: mockPersonnel },
      [mockVault.collectorsinfo]: { count: 1, row: mockVault },
      [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
    };
    for (const row of inPile) deck[row.collectorsinfo] = { count: 1, row };
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const save = JSON.parse(localStorage.getItem('practiceGame')!);
    const pile: { id: string; key: string }[] = save.table.dilemmaPile;
    const vault = pile.find((c) => c.key === mockVault.collectorsinfo)!;
    save.table.dilemmaPile = pile.filter((c) => c !== vault);
    save.table.missions[0].awayTeam = save.table.drawDeck;
    save.table.drawDeck = [];
    save.table.dilemmaStack = [{ ...vault, face: 'up' }];
    localStorage.setItem('practiceGame', JSON.stringify(save));
    await enterAttempt(<PracticeDrawPage />, 0, { drawn: 0, ...bot, ...fields });
  };

  it('names on Vault of Tomorrow the dilemma of cost 2 or less it takes from the bot\'s pile (#1552)', async () => {
    await setupVault([mockDear, mockCheap]);
    expect(label()).toHaveTextContent('Added Unconventional Consideration');
  });

  it('shows no label on Vault of Tomorrow when the bot\'s pile holds nothing it can take (#1552)', async () => {
    await setupVault([mockDear]);
    expect(label()).toBeNull();
  });

  it('shows no label on Vault of Tomorrow when the spend leaves no room for any candidate (#1556)', async () => {
    // Vault of Tomorrow costs 1, so at spend 2 the cost-2 Unconventional Consideration is over the spend.
    await setupVault([mockDear, mockCheap], { botSpend: 2 });
    expect(label()).toBeNull();
  });

  // Issue #1556: of cost 2, revealed before Vault of Tomorrow; and of cost 0 and 2, in the bot's pile.
  const mockConduit = { ...mockCheap, collectorsinfo: '9P004', originalName: 'Temporal Conduit', name: 'temporal conduit', imagefile: 'temporal_conduit' };
  const mockFree = { ...mockCheap, collectorsinfo: '9P005', originalName: 'Nose to Nose', name: 'nose to nose', imagefile: 'nose_to_nose' };
  const mockHarmful = { ...mockCheap, collectorsinfo: '9P006', originalName: 'No Kill I', name: 'no kill i', imagefile: 'no_kill_i' };

  it('names on Vault of Tomorrow revealed after a cost-2 dilemma at spend 3 the cost-0 dilemma, through a reload (#1556)', async () => {
    const beta = { ...mockPersonnel, collectorsinfo: '1C002', originalName: 'Beta', name: 'beta', imagefile: 'beta' };
    const gamma = { ...mockPersonnel, collectorsinfo: '1C003', originalName: 'Gamma', name: 'gamma', imagefile: 'gamma' };
    (extractDrawDeck as jest.Mock).mockReturnValue([mockPersonnel, beta, gamma]);
    const deck: Record<string, { count: number; row: unknown }> = {
      [mockPersonnel.collectorsinfo]: { count: 1, row: mockPersonnel },
      [beta.collectorsinfo]: { count: 1, row: beta },
      [gamma.collectorsinfo]: { count: 1, row: gamma },
      [mockVault.collectorsinfo]: { count: 1, row: mockVault },
      [mockConduit.collectorsinfo]: { count: 1, row: mockConduit },
      [mockFree.collectorsinfo]: { count: 1, row: mockFree },
      [mockHarmful.collectorsinfo]: { count: 1, row: mockHarmful },
      [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
    };
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const save = JSON.parse(localStorage.getItem('practiceGame')!);
    const pile: { id: string; key: string }[] = save.table.dilemmaPile;
    const vault = pile.find((c) => c.key === mockVault.collectorsinfo)!;
    const conduit = pile.find((c) => c.key === mockConduit.collectorsinfo)!;
    save.table.dilemmaPile = pile.filter((c) => c !== vault && c !== conduit);
    save.table.missions[0].awayTeam = save.table.drawDeck;
    save.table.missions[0].underMission = [{ ...conduit, face: 'up' }];
    save.table.drawDeck = [];
    save.table.dilemmaStack = [{ ...vault, face: 'up' }];
    localStorage.setItem('practiceGame', JSON.stringify(save));
    const fields = { drawn: 0, ...bot, botSpend: 3, botStack: [conduit.id, vault.id], botRevealed: [conduit.id, vault.id] };
    await enterAttempt(<PracticeDrawPage />, 0, fields);
    expect(label()).toHaveTextContent('Added Nose to Nose');

    // A reload restores the record of the reveals, and the label with it.
    cleanup();
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const resume = screen.queryByRole('button', { name: 'Continue' });
    if (resume) {
      await act(async () => {
        fireEvent.click(resume);
      });
    }
    expect(label()).toHaveTextContent('Added Nose to Nose');

    // With nothing revealed before it, the more harmful No Kill I fits the spend.
    await enterAttempt(<PracticeDrawPage />, 0, { ...fields, botRevealed: [vault.id] });
    expect(label()).toHaveTextContent('Added No Kill I');
  });
});

// Issue #1204: in the dilemma choice, the face-up row of the dilemma stack labels its two ends, and
// a drop on one of its cards puts the dilemma at the marked place: a card of the stack moves there,
// and a dilemma from the dilemma hand goes in before that card, or last on the end.
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
  FaRedo: () => null,
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

let mockDndContext: { active: { id: string } | null; over: { id: string } | null } = { active: null, over: null };
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
    DragOverlay: () => null,
    useDndContext: () => mockDndContext,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { enterAttempt, mockAttemptMission } from '../../fixtures/enterAttempt';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { DILEMMA_STACK_ROW_END, dilemmaStackRowSlotId } from '../../../app/decks/practice/dilemmaStackInsert';

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 6,
};

const mockDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 6, row: mockDilemmaCard },
  [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
};

const KEY = 'practiceGame';
const saved = () => JSON.parse(localStorage.getItem(KEY)!);
const stackIds = (): string[] => saved().table.dilemmaStack.map((c: { id: string }) => c.id);
const handIds = (): string[] => saved().table.dilemmaHand.map((c: { id: string }) => c.id);

// Deals the deck, moves 3 dilemmas of the pile into the stack and 2 into the dilemma hand, and starts
// an attempt in `phase`. `revealTop` turns the top card of the stack face up, as the fan's Reveal does.
async function dealChoice(phase: 'choose' | 'face' = 'choose', revealTop = false) {
  localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
  await act(async () => {
    render(<PracticeDrawPage />);
  });
  const save = saved();
  const pile = save.table.dilemmaPile;
  save.table.dilemmaStack = pile
    .slice(0, 3)
    .map((c: object, i: number) => ({ ...c, face: phase === 'choose' || (revealTop && i === 0) ? 'up' : 'down' }));
  save.table.dilemmaHand = pile.slice(3, 5).map((c: object) => ({ ...c, face: 'up' }));
  save.table.dilemmaPile = pile.slice(5);
  localStorage.setItem(KEY, JSON.stringify(save));
  await enterAttempt(<PracticeDrawPage />, 0, { personnel: 1, phase, drawn: 0 });
}

async function drag(id: string, overId: string) {
  await act(async () => {
    mockOnDragStart!({ active: { id } });
  });
  await act(async () => {
    mockOnDragEnd!({ active: { id }, over: { id: overId } });
  });
}

describe('Practice table: the dilemma stack of the dilemma choice (#1204)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDndContext = { active: null, over: null };
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    (extractDrawDeck as jest.Mock).mockReturnValue([]);
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

  it('labels the two ends of the row "First" and "Last"', async () => {
    await dealChoice();
    const labels = screen.getByTestId('dilemma-stack-end-labels');
    expect(labels.children[0]).toHaveTextContent('First');
    expect(labels.children[1]).toHaveTextContent('Last');
  });

  it('moves a card of the stack to the place of the card it drops on, as the panel does', async () => {
    await dealChoice();
    const [a, b, c] = stackIds();
    await drag(c, dilemmaStackRowSlotId(a));
    expect(stackIds()).toEqual([c, a, b]);
    await drag(c, DILEMMA_STACK_ROW_END);
    expect(stackIds()).toEqual([a, b, c]);
    await drag(a, dilemmaStackRowSlotId(b));
    expect(stackIds()).toEqual([b, a, c]);
  });

  it('puts a dilemma from the dilemma hand before the card it drops on, face up', async () => {
    await dealChoice();
    const [a, b, c] = stackIds();
    const [d, e] = handIds();
    await drag(d, dilemmaStackRowSlotId(b));
    expect(stackIds()).toEqual([a, d, b, c]);
    expect(saved().table.dilemmaStack[1].face).toBe('up');

    await drag(e, dilemmaStackRowSlotId(a));
    expect(stackIds()).toEqual([e, a, d, b, c]);
  });

  it('puts a dilemma from the dilemma hand last on the end of the row', async () => {
    await dealChoice();
    const [a, b, c] = stackIds();
    const [d] = handIds();
    await drag(d, DILEMMA_STACK_ROW_END);
    expect(stackIds()).toEqual([a, b, c, d]);
  });

  it('makes the drop one log entry, which one undo takes back', async () => {
    await dealChoice();
    const [a, b, c] = stackIds();
    const [d] = handIds();
    await drag(d, dilemmaStackRowSlotId(a));
    expect(stackIds()).toEqual([d, a, b, c]);
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(stackIds()).toEqual([a, b, c]);
    expect(handIds()).toContain(d);
  });

  it('labels the panel of the stack by the phase', async () => {
    await dealChoice('choose');
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Dilemma stack, 3 cards/ })[0]);
    });
    const choosing = screen.getByTestId('card-list-panel-dilemmaStack');
    expect(within(choosing).getByText('First')).toBeInTheDocument();
    expect(within(choosing).getByText('Last')).toBeInTheDocument();
  });

  it('keeps the labels of the panel in the facing phase', async () => {
    await dealChoice('face');
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Dilemma stack, 3 cards/ })[0]);
    });
    const facing = screen.getByTestId('card-list-panel-dilemmaStack');
    expect(within(facing).getByText('Top (revealed first)')).toBeInTheDocument();
    expect(within(facing).getByText('Bottom (revealed last)')).toBeInTheDocument();
    expect(within(facing).queryByText('First')).toBeNull();
  });

  it('marks where a dragged dilemma lands: before the card it is over, or at the end', async () => {
    await dealChoice();
    const [a, b] = stackIds();
    const [d] = handIds();
    expect(screen.queryByTestId('dilemma-stack-insert-indicator')).toBeNull();

    mockDndContext = { active: { id: d }, over: { id: dilemmaStackRowSlotId(b) } };
    await act(async () => {
      mockOnDragStart!({ active: { id: d } });
    });
    expect(screen.getByTestId('dilemma-stack-insert-indicator')).toHaveAttribute('data-slot', '1');

    mockDndContext = { active: { id: a }, over: { id: DILEMMA_STACK_ROW_END } };
    await act(async () => {
      mockOnDragStart!({ active: { id: a } });
    });
    expect(screen.getByTestId('dilemma-stack-insert-indicator')).toHaveAttribute('data-slot', '2');
  });

  // #1221: the row draws each card as the art crop of a table card, and the marker is as tall as one.
  it('draws each card of the row as the art crop of a table card', async () => {
    await dealChoice();
    const [, b] = stackIds();
    const zone = document.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    const cards = stackIds().map((id) => zone.querySelector(`[data-card-id="${id}"]`) as HTMLElement);
    expect(cards.every(Boolean)).toBe(true);
    for (const card of cards) {
      const img = card.querySelector('img')!;
      expect(img).toHaveClass('object-cover', 'object-top');
      expect(img).not.toHaveClass('h-auto');
    }
    const cropHeight = (cards[0].querySelector('img')!.parentElement!.parentElement as HTMLElement).style.height;
    expect(parseFloat(cropHeight)).toBeGreaterThan(0);

    const [d] = handIds();
    mockDndContext = { active: { id: d }, over: { id: dilemmaStackRowSlotId(b) } };
    await act(async () => {
      mockOnDragStart!({ active: { id: d } });
    });
    expect(screen.getByTestId('dilemma-stack-insert-indicator').style.height).toBe(cropHeight);
  });

  it('keeps the whole card for the revealed top card of the facing fan', async () => {
    await dealChoice('face', true);
    const [a] = stackIds();
    const img = document.querySelector(`[data-zone="dilemmaStack"] [data-card-id="${a}"] img`)!;
    expect(img).toHaveClass('h-auto');
    expect(img).not.toHaveClass('object-top');
  });
});

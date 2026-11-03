// Issue #1498: with a fine pointer, the dilemma choice draws every card of the face-up dilemma stack
// as the whole card; on touch it keeps the art crops of #1221.
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

import React from 'react';
import { render, act } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { enterAttempt, mockAttemptMission } from '../../fixtures/enterAttempt';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { dilemmaStackRowSlotId, DILEMMA_STACK_ROW_END } from '../../../app/decks/practice/dilemmaStackInsert';

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

function mockPointer(fine: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: fine && (query.includes('pointer: fine') || query.includes('hover: hover')),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Deals the deck, moves 3 dilemmas of the pile into the stack face up, and starts an attempt in
// the dilemma choice.
async function dealChoice() {
  localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
  await act(async () => {
    render(<PracticeDrawPage />);
  });
  const save = saved();
  const pile = save.table.dilemmaPile;
  save.table.dilemmaStack = pile.slice(0, 3).map((c: object) => ({ ...c, face: 'up' }));
  save.table.dilemmaPile = pile.slice(3);
  localStorage.setItem(KEY, JSON.stringify(save));
  await enterAttempt(<PracticeDrawPage />, 0, { personnel: 1, phase: 'choose', drawn: 0 });
  return save.table.dilemmaStack.map((c: { id: string }) => c.id) as string[];
}

const stackCards = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-zone="dilemmaStack"] [data-card-id]'));

describe('the cards of the dilemma choice stack (#1498)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    (extractDrawDeck as jest.Mock).mockReturnValue([]);
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });
  });

  it('draws each card whole with a fine pointer, and keeps the drop slots', async () => {
    mockPointer(true);
    const ids = await dealChoice();
    const cards = stackCards();
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      const img = card.querySelector('img')!;
      // The whole-card image: the card image's own 120 x 167, sized by its width.
      expect(img).toHaveAttribute('width', '120');
      expect(img).toHaveAttribute('height', '167');
      expect(img).toHaveClass('h-auto');
    }
    for (const id of ids) {
      expect(document.querySelector(`[data-zone="${dilemmaStackRowSlotId(id)}"]`)).not.toBeNull();
    }
    expect(document.querySelector(`[data-zone="${DILEMMA_STACK_ROW_END}"]`)).not.toBeNull();
  });

  it('draws each card as the art crop on touch (#1221)', async () => {
    mockPointer(false);
    await dealChoice();
    const cards = stackCards();
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.querySelector('img')).not.toHaveAttribute('height', '167');
    }
  });
});

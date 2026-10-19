// Issue #1191: on the practice table, the Draw dilemma button of the dilemma choice draws one dilemma
// into the dilemma hand as the counted draw (#1189), and opens the dilemma hand.
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

jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children }: any) => children,
    DragOverlay: () => null,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { enterAttempt, mockAttemptMission } from '../../fixtures/enterAttempt';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 2,
};

const mockDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
  [mockAttemptMission.collectorsinfo]: { count: 1, row: mockAttemptMission },
};

describe('Practice table: the Draw dilemma button (#1191)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  const savedAttempt = () => JSON.parse(localStorage.getItem('practiceGame')!).table.attempt;

  it('draws a counted dilemma into the dilemma hand, opens the hand, and disables itself on an empty pile', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await enterAttempt(<PracticeDrawPage />, 0, { personnel: 1, phase: 'choose', drawn: 0 });

    expect(screen.getByTestId('attempt-drawn-count')).toHaveTextContent(/^Drawn 0 of 1$/);
    expect(screen.queryByTestId('dilemmaHand-arc')).toBeNull();

    const button = screen.getByTestId('attempt-draw-dilemma');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByTestId('attempt-drawn-count')).toHaveTextContent(/^Drawn 1 of 1$/);
    expect(screen.getByTestId('dilemmaHand-arc')).toBeInTheDocument();
    expect(savedAttempt().drawn).toBe(1);

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByTestId('attempt-drawn-count')).toHaveTextContent(/^Drawn 2 of 1$/);
    expect(screen.getByTestId('attempt-drawn-count')).toHaveAttribute('data-over', 'true');
    expect(button).toBeDisabled();
  });
});

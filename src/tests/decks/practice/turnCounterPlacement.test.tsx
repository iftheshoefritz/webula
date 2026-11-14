jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// One stable array: a fresh `data` each render would rerun the page's deck load forever.
const mockData: unknown[] = [];
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
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

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { SCORE_STEP } from '../../../app/decks/practice/tableReducer';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: row('1P001', 'Test Personnel', 'personnel') },
};

const mockMatchMedia = (fine: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: fine && query.includes('pointer: fine'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
};

// Issue #1337: on a touch screen the turn and score controls sit in the column left of the
// missions, and no counter shows above the draw deck or the discard.
describe('the turn and score controls in the left column on a touch screen (#1337)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    mockMatchMedia(false);
  });

  it('sits in the left column, and not in the bottom row', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const column = screen.getByTestId('turn-score-column');
    expect(within(column).getByTestId('turn-counter')).toBeInTheDocument();
    expect(within(column).getByTestId('score-counter')).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Go to orders' })).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Decrease score' })).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Increase score' })).toBeInTheDocument();

    expect(screen.getAllByTestId('turn-counter')).toHaveLength(1);
    expect(screen.getAllByTestId('score-counter')).toHaveLength(1);
    const drawColumn = screen.getByTestId('draw-deck-column');
    expect(within(drawColumn).queryByTestId('turn-counter')).not.toBeInTheDocument();
    expect(within(drawColumn).getByTestId('draw-pile')).toBeInTheDocument();
  });

  it('shows the turn number on the next-turn button, and a press adds 1 to it (#1449)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const column = screen.getByTestId('turn-score-column');
    const button = within(column).getByRole('button', { name: 'Go to orders' });
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('1');
    expect(screen.getAllByTestId('turn-counter')).toHaveLength(1);
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Next turn');
    fireEvent.click(button);
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });

  it('shows the segment under the turn, and the button says what a tap does (#1605)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const column = screen.getByTestId('turn-score-column');
    const button = within(column).getByRole('button', { name: 'Go to orders' });
    expect(button).toHaveAttribute('title', 'Go to orders');
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Play');
    fireEvent.click(button);
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Orders');
    expect(button).toHaveAttribute('title', 'Next turn');
    fireEvent.click(button);
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Play');
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });

  it('keeps the round 24 px corner buttons (#1497)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const corner = screen.getByTestId('corner-buttons');
    for (const button of within(corner).getAllByRole('button')) {
      expect(button).toHaveClass('btn-system', 'w-6', 'h-6');
      expect(button).not.toHaveClass('w-full');
    }
  });

  it('still raises the turn and changes the score by SCORE_STEP within 0 to 140', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Go to orders' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');

    expect(screen.getByTestId('score-counter')).toHaveTextContent('Score 0');
    expect(screen.getByRole('button', { name: 'Decrease score' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase score' }));
    expect(screen.getByTestId('score-counter')).toHaveTextContent(`Score ${SCORE_STEP}`);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease score' }));
    expect(screen.getByTestId('score-counter')).toHaveTextContent('Score 0');
  });
});

// Issue #1451: a desktop shows the same column, in the look of its corner buttons, below five of
// them, and the bottom row holds no turn or score.
describe('the turn and score controls in the left column on a desktop (#1451)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    mockMatchMedia(true);
  });

  it('sits in the left column, and not in the bottom row', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const column = screen.getByTestId('turn-score-column');
    expect(within(column).getByTestId('turn-counter')).toBeInTheDocument();
    expect(within(column).getByTestId('score-counter')).toBeInTheDocument();
    for (const name of ['Go to orders', 'Decrease score', 'Increase score']) {
      const button = within(column).getByRole('button', { name });
      expect(button).toHaveClass('btn-icon');
      expect(button).not.toHaveClass('btn-system');
    }

    expect(screen.getAllByTestId('turn-counter')).toHaveLength(1);
    expect(screen.getAllByTestId('score-counter')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Go to orders' })).toHaveLength(1);
    const drawColumn = screen.getByTestId('draw-deck-column');
    expect(within(drawColumn).queryByTestId('turn-counter')).not.toBeInTheDocument();
    expect(within(drawColumn).getByTestId('draw-pile')).toBeInTheDocument();
    // #1489: the bottom row has no hand slot; the closed hand is a small fan on top of it.
    expect(screen.queryByTestId('hand-column')).not.toBeInTheDocument();
  });

  it('shows the turn number on the next-turn button, and a press adds 1 to it (#1449)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const button = screen.getByRole('button', { name: 'Go to orders' });
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Next turn');
    fireEvent.click(button);
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });

  it('starts below five corner buttons, and the corner column takes its width', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    // `top-2`, five 28 px buttons 4 px apart (#1497), then 8 px clear: 8 + 156 + 8.
    expect(screen.getByTestId('turn-score-column').style.top).toBe('172px');
    expect(screen.getByTestId('corner-buttons').style.width).toBe(
      screen.getByTestId('turn-score-column').style.width,
    );
  });

  it('draws the corner buttons as wide and as tall as the next-turn button (#1497)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const next = screen.getByRole('button', { name: 'Go to orders' });
    expect(next).toHaveClass('w-full', 'h-7');
    const corner = screen.getByTestId('corner-buttons');
    for (const button of within(corner).getAllByRole('button')) {
      expect(button).toHaveClass('btn-icon', 'w-full', 'h-7');
      expect(button).not.toHaveClass('btn-icon-sm');
    }
    // The undo and redo column stretches to the column's width, so its full-width buttons do too.
    expect(screen.getByTestId('undo-redo')).toHaveClass('flex-col', 'self-stretch');
  });

  it('still raises the turn and changes the score', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Go to orders' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');
    fireEvent.click(screen.getByRole('button', { name: 'Increase score' }));
    expect(screen.getByTestId('score-counter')).toHaveTextContent(`Score ${SCORE_STEP}`);
  });
});

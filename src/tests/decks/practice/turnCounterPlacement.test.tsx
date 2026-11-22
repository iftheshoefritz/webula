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

// Renders a new game and draws its opening hand, so the turn controls show (#1736).
const renderPage = async () => {
  await act(async () => {
    render(<PracticeDrawPage />);
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId('draw-opening-hand'));
  });
};

// Issue #1736: a new game shows one "Draw 7" button in place of the turn controls. A tap draws the
// opening hand at no cost, and one undo takes it back.
describe('the opening hand of a new game (#1736)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
  });

  for (const fine of [false, true]) {
    it(`shows Draw 7 in place of the turn controls, and keeps the score (${fine ? 'desktop' : 'touch'})`, async () => {
      mockMatchMedia(fine);
      await act(async () => {
        render(<PracticeDrawPage />);
      });
      const column = screen.getByTestId('turn-score-column');
      const draw7 = within(column).getByTestId('draw-opening-hand');
      expect(draw7).toHaveTextContent('Draw 7');
      expect(draw7).toHaveClass(fine ? 'btn-icon' : 'btn-system', 'w-full');
      expect(within(column).queryByTestId('turn-counter')).toBeNull();
      expect(within(column).queryByTestId('turn-segment-list')).toBeNull();
      expect(within(column).getByTestId('score-counter')).toBeInTheDocument();
      expect(within(column).getByRole('button', { name: 'Increase score' })).toBeInTheDocument();
    });
  }

  it('draws 7 cards into the hand, then shows turn 1, and one undo brings the button back', async () => {
    mockMatchMedia(false);
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const hand = (n: number) => screen.getByRole('button', { name: new RegExp(`^hand, ${n} cards?, tap to open$`, 'i') });
    expect(hand(0)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('draw-opening-hand'));
    });
    expect(hand(7)).toBeInTheDocument();
    expect(screen.queryByTestId('draw-opening-hand')).toBeNull();
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    expect(screen.getByTestId('turn-segment')).toHaveTextContent('Play');
    expect(JSON.parse(localStorage.getItem('practiceGame')!).table.drawDeck).toHaveLength(1);

    const undo = screen.getByTestId('undo-button');
    expect(undo).toHaveAttribute('aria-label', 'Undo: Drew the opening hand (7 cards)');
    await act(async () => {
      fireEvent.click(undo);
    });
    expect(hand(0)).toBeInTheDocument();
    expect(screen.getByTestId('draw-opening-hand')).toBeInTheDocument();
    expect(screen.queryByTestId('turn-counter')).toBeNull();
  });
});

// Issue #1337: on a touch screen the turn and score controls sit in the column left of the
// missions, and no counter shows above the draw deck or the discard.
describe('the turn and score controls in the left column on a touch screen (#1337)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    mockMatchMedia(false);
  });

  it('sits in the left column, and not in the bottom row', async () => {
    await renderPage();
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
    await renderPage();
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
    await renderPage();
    const column = screen.getByTestId('turn-score-column');
    const button = within(column).getByRole('button', { name: 'Go to orders' });
    expect(button).toHaveAttribute('title', 'Go to orders');
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Play');
    const list = within(column).getByTestId('turn-segment-list');
    expect(Array.from(list.children).map((row) => row.querySelector('[data-testid="turn-segment-name"]')!.textContent)).toEqual([
      'Play',
      'Orders',
      'Discard',
    ]);
    expect(list.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(within(column).getByTestId('turn-segment')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(button);
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Orders');
    expect(list.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(list.querySelector('[aria-current="step"]')).toHaveAttribute('data-segment', 'orders');
    expect(button).toHaveAttribute('title', 'Next turn');
    fireEvent.click(button);
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Play');
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });

  it('shows the counters between Play and Orders, and keeps the row muted in orders (#1848)', async () => {
    localStorage.setItem('practice-turn-counters', 'true');
    await renderPage();
    const column = screen.getByTestId('turn-score-column');
    const list = within(column).getByTestId('turn-segment-list');
    const at = (s: string) => list.querySelector(`[data-segment="${s}"] [data-testid="turn-segment-name"]`)!;
    const order = [
      within(column).getByRole('button', { name: 'Go to orders' }),
      at('playAndDraw'),
      within(column).getByTestId('turn-counters'),
      at('orders'),
      at('discard'),
      within(column).getByTestId('score-counter'),
    ];
    expect(order[2]).toHaveTextContent('0/7');
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Three segments still, one current; the counters are no fourth.
    expect(list.children).toHaveLength(3);
    expect(list.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(list.querySelector('[aria-current="step"] [data-testid="turn-segment-name"]')).toHaveClass('bg-white/15');
    expect(within(column).getByTestId('turn-counters-row')).not.toHaveClass('bg-white/15');

    const row = within(column).getByTestId('turn-counters-row');
    fireEvent.click(order[0]);
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Orders');
    expect(within(column).getByTestId('turn-counters-row')).toBe(row);
    expect(within(column).getByTestId('turn-counters')).toHaveAttribute('data-muted', 'true');
  });

  it('keeps the counters row mounted and empty with Counters off (#1848)', async () => {
    await renderPage();
    const column = screen.getByTestId('turn-score-column');
    expect(within(column).getByTestId('turn-counters-row')).toBeEmptyDOMElement();
    expect(within(column).queryByTestId('turn-counters')).toBeNull();
  });

  it('keeps the round 24 px corner buttons (#1497)', async () => {
    await renderPage();
    const corner = screen.getByTestId('corner-buttons');
    for (const button of within(corner).getAllByRole('button')) {
      expect(button).toHaveClass('btn-system', 'w-6', 'h-6');
      expect(button).not.toHaveClass('w-full');
    }
  });

  it('still raises the turn and changes the score by SCORE_STEP within 0 to 140', async () => {
    await renderPage();
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
    await renderPage();
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
    await renderPage();
    const button = screen.getByRole('button', { name: 'Go to orders' });
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Next turn');
    fireEvent.click(button);
    expect(within(button).getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });

  it('starts below five corner buttons, and the corner column takes its width', async () => {
    await renderPage();
    // `top-2`, five 28 px buttons 4 px apart (#1497), then 8 px clear: 8 + 156 + 8.
    expect(screen.getByTestId('turn-score-column').style.top).toBe('172px');
    expect(screen.getByTestId('corner-buttons').style.width).toBe(
      screen.getByTestId('turn-score-column').style.width,
    );
  });

  it('draws the corner buttons as wide as the next-turn button, which is 32 px tall or more (#1497, #1790)', async () => {
    await renderPage();
    const next = screen.getByRole('button', { name: 'Go to orders' });
    expect(next).toHaveClass('w-full');
    expect(parseInt(next.style.height, 10)).toBeGreaterThanOrEqual(32);
    const corner = screen.getByTestId('corner-buttons');
    for (const button of within(corner).getAllByRole('button')) {
      expect(button).toHaveClass('btn-icon', 'w-full', 'h-7');
      expect(button).not.toHaveClass('btn-icon-sm');
    }
    // The undo and redo column stretches to the column's width, so its full-width buttons do too.
    expect(screen.getByTestId('undo-redo')).toHaveClass('flex-col', 'self-stretch');
  });

  it('still raises the turn and changes the score', async () => {
    await renderPage();
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Go to orders' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');
    fireEvent.click(screen.getByRole('button', { name: 'Increase score' }));
    expect(screen.getByTestId('score-counter')).toHaveTextContent(`Score ${SCORE_STEP}`);
  });
});

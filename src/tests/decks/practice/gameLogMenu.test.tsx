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

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  shuffleArray: jest.fn((arr) => arr),
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
import { EMPTY_LOG_TEXT } from '../../../app/decks/practice/gameLog';
import { shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { FINE_POINTER_QUERY } from '../../../app/decks/practice/useFinePointer';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

// Eight draw deck cards, so the draw deck still holds one after seven opening draws.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: row('1P001', 'Test Personnel', 'personnel') },
};

describe('the game log button of the corner column (#1065, #1399)', () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  const openMenu = () => {
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    return screen.getByTestId('game-menu-splash');
  };

  it('is not an item of the game menu', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(within(openMenu()).queryByRole('button', { name: 'Game log' })).not.toBeInTheDocument();
  });

  it('sits under the undo button, last in the corner column', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const buttons = Array.from(screen.getByTestId('corner-buttons').querySelectorAll('button'));
    const labels = buttons.map((b) => b.getAttribute('data-testid') ?? b.getAttribute('aria-label'));
    expect(labels.filter((l) => l !== 'fullscreen-button')).toEqual(['Game menu', 'undo-button', 'redo-button', 'game-log-button']);
  });

  it('centres the single buttons on the undo and redo row (#1423)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('corner-buttons').className).toMatch(/\bitems-center\b/);
  });

  it('closes the open splash and opens an empty log on a new game', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('game-menu-splash')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('game-log-button'));
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();
    const panel = screen.getByRole('dialog', { name: 'Game log' });
    expect(within(panel).getByText(EMPTY_LOG_TEXT)).toBeInTheDocument();
  });

  it('opens the log with the menu closed', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('game-log-button'));
    expect(screen.getByRole('dialog', { name: 'Game log' })).toBeInTheDocument();
  });

  it('shows a draw under Turn 1, and Copy writes the log grouped by turn', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));

    fireEvent.click(screen.getByTestId('game-log-button'));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    expect(within(within(panel).getByTestId('game-log-turn-1')).getByText('Drew a card from the draw deck into the hand')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('game-log-turn-2')).getByText('Started turn 2')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(
      'Turn 1\n- Drew a card from the draw deck into the hand\n\nTurn 2\n- Started turn 2'
    );
    expect(within(panel).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  const drawAndNextTurn = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
  };

  it('keeps the log and undo across a remount from the save (#1400, #1401)', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<PracticeDrawPage />);
    });
    drawAndNextTurn();
    expect(screen.getByTestId('undo-button')).not.toBeDisabled();
    expect(JSON.parse(localStorage.getItem('practiceGame')!).log).toHaveLength(2);
    view!.unmount();

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Started turn 2');
    fireEvent.click(screen.getByTestId('game-log-button'));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    expect(within(within(panel).getByTestId('game-log-turn-1')).getByText('Drew a card from the draw deck into the hand')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('game-log-turn-2')).getByText('Started turn 2')).toBeInTheDocument();
  });

  it('keeps the log with undo disabled when the save has no history (#1400, #1401)', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<PracticeDrawPage />);
    });
    drawAndNextTurn();
    view!.unmount();
    localStorage.removeItem('practiceGame:history');

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('undo-button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('game-log-button'));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    expect(within(within(panel).getByTestId('game-log-turn-2')).getByText('Started turn 2')).toBeInTheDocument();
  });

  // A shuffle's order is in the saved history, so undo and redo after a reload bring back the same
  // orders (#1401).
  it('undoes and redoes a shuffle of the draw deck after a remount', async () => {
    const drawOrder = () => JSON.parse(localStorage.getItem('practiceGame')!).table.drawDeck.map((c: { id: string }) => c.id);
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const before = drawOrder();
    (shuffleArray as jest.Mock).mockImplementationOnce((arr: unknown[]) => [...arr].reverse());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    });
    const shuffled = drawOrder();
    expect(shuffled).toEqual([...before].reverse());
    view!.unmount();

    await act(async () => {
      view = render(<PracticeDrawPage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(drawOrder()).toEqual(before);
    view!.unmount();

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('redo-button')).toHaveAttribute('aria-label', 'Redo: Shuffled the draw deck');
    await act(async () => {
      fireEvent.click(screen.getByTestId('redo-button'));
    });
    expect(drawOrder()).toEqual(shuffled);
  });

  it('deals no hand, and seven taps on the draw deck draw a hand of 7 that the log lists in turn 1 (#1115)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: /^hand, 0 cards?, tap to open$/i })).toBeInTheDocument();

    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    }
    expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('game-log-button'));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    const turn1 = within(panel).getByTestId('game-log-turn-1');
    expect(within(turn1).getAllByText('Drew a card from the draw deck into the hand')).toHaveLength(7);
  });

  it('has an undo button that names the last entry, and a tap takes the entry back (#1194)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const undo = screen.getByTestId('undo-button');
    expect(undo).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();
    expect(undo).toBeEnabled();
    expect(undo).toHaveAttribute('aria-label', 'Undo: Drew a card from the draw deck into the hand');
    expect(undo).toHaveAttribute('title', 'Undo: Drew a card from the draw deck into the hand');

    fireEvent.click(undo);
    expect(screen.getByRole('button', { name: /^hand, 0 cards?, tap to open$/i })).toBeInTheDocument();
    expect(undo).toBeDisabled();
    fireEvent.click(screen.getByTestId('game-log-button'));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    expect(within(panel).getByText(EMPTY_LOG_TEXT)).toBeInTheDocument();
  });

  it('has a redo button that names the undone entry, and a tap does it again (#1403)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const undo = screen.getByTestId('undo-button');
    const redo = screen.getByTestId('redo-button');
    expect(redo).toBeDisabled();
    expect(redo).toHaveAttribute('title', 'Nothing to redo');

    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    expect(redo).toBeDisabled();
    fireEvent.click(undo);
    expect(redo).toBeEnabled();
    expect(redo).toHaveAttribute('aria-label', 'Redo: Drew a card from the draw deck into the hand');
    expect(redo).toHaveAttribute('title', 'Redo: Drew a card from the draw deck into the hand');

    fireEvent.click(redo);
    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();
    expect(redo).toBeDisabled();
    expect(undo).toHaveAttribute('aria-label', 'Undo: Drew a card from the draw deck into the hand');

    // A new action after an undo empties the redo history.
    fireEvent.click(undo);
    expect(redo).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    expect(redo).toBeDisabled();
  });

  it('redoes on Ctrl+Shift+Z and Ctrl+Y with a fine pointer (#1403)', async () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === FINE_POINTER_QUERY,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    const hand = (n: number) => screen.getByRole('button', { name: new RegExp(`^hand, ${n} cards?, tap to open$`, 'i') });
    expect(hand(1)).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(hand(0)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(hand(1)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(hand(0)).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(hand(1)).toBeInTheDocument();
  });
});

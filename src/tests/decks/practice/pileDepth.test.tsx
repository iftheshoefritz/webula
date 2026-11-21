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
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { PILE_DEPTH_MAX, PILE_MAX_LAYERS, pileDepth, pileLayers } from '../../../app/decks/practice/pileDepth';
import { planeTiltStyle } from '../../../app/decks/practice/table3d';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

// Eight draw deck cards, so the draw deck still holds one after seven opening draws.
// The personnel cost 2.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: { ...row('1P001', 'Test Personnel', 'personnel'), cost: '2' } },
};

describe('pileDepth', () => {
  it('gives a pile of one card, or none, no height and no layers', () => {
    expect(pileDepth(0)).toBe(0);
    expect(pileDepth(1)).toBe(0);
    expect(pileLayers(1)).toEqual([]);
  });

  it('grows with the pile, and a taller pile has a longer side', () => {
    expect(pileDepth(10)).toBeGreaterThan(0);
    expect(pileDepth(40)).toBeGreaterThan(pileDepth(10));
  });

  it('stops at its maximum, and grows with the bottom-row scale', () => {
    expect(pileDepth(500)).toBe(PILE_DEPTH_MAX);
    expect(pileDepth(500, 1.5)).toBe(PILE_DEPTH_MAX * 1.5);
  });
});

describe('pileLayers', () => {
  it('draws more cards under a taller pile, never more than the pile holds or the cap', () => {
    expect(pileLayers(3).length).toBeLessThanOrEqual(2);
    expect(pileLayers(40).length).toBeGreaterThan(pileLayers(5).length);
    expect(pileLayers(500).length).toBe(PILE_MAX_LAYERS);
  });

  it('puts each card lower and darker than the one above it, the bottom one at the full height', () => {
    const layers = pileLayers(40);
    for (let k = 1; k < layers.length; k++) {
      expect(layers[k].y).toBeGreaterThan(layers[k - 1].y);
      expect(layers[k].brightness).toBeLessThan(layers[k - 1].brightness);
    }
    expect(layers[layers.length - 1].y).toBe(pileDepth(40));
  });

  it('sets the cards askew, the same way on every call', () => {
    const layers = pileLayers(40);
    expect(layers.some((l) => l.rotate !== 0)).toBe(true);
    expect(pileLayers(40)).toEqual(layers);
  });
});

describe('the 3D table setting', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
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

  it('draws the pile layers and the tilted board by default, and the setting turns both off', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const drawDeck = screen.getByTestId('draw-pile');
    const side = drawDeck.querySelector('[data-testid="pile-depth"]');
    expect(side).not.toBeNull();
    expect(Number(side!.getAttribute('data-depth'))).toBe(pileDepth(8));
    // The pile stands on the baseline: its top card rises by the pile's height.
    expect((drawDeck.querySelector('[data-testid="pile-lift"]') as HTMLElement).style.transform).toBe(`translateY(${-pileDepth(8)}px)`);
    // Each layer is a card back of the game.
    const backs = side!.querySelectorAll('img');
    expect(backs.length).toBe(pileLayers(8).length);
    backs.forEach((img) => expect(img).toHaveAttribute('src', '/cardimages/cardback.jpg'));

    expect(screen.getByTestId('tilted-board')).toBeInTheDocument();
    expect(screen.getByTestId('practice-game-layer')).toHaveClass('table-3d');

    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    fireEvent.click(screen.getByTestId('game-menu-settings-item'));
    const toggle = screen.getByTestId('game-menu-table-3d');
    expect(toggle).toHaveTextContent('3D table: On');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveTextContent('3D table: Off');
    expect(localStorage.getItem('practice-3d-table')).toBe('false');
    expect(screen.getByTestId('draw-pile').querySelector('[data-testid="pile-depth"]')).toBeNull();
    expect(screen.queryByTestId('tilted-board')).toBeNull();
    expect((screen.getByTestId('draw-pile').querySelector('[data-testid="pile-lift"]') as HTMLElement).style.transform).toBe('');
    expect(screen.getByTestId('practice-game-layer')).not.toHaveClass('table-3d');
  });
});

describe('planeTiltStyle', () => {
  it('turns two parts of the table about the same point on screen, so they lie in one plane', () => {
    const hinge = { x: 640, y: 700 };
    const board = planeTiltStyle(hinge, 100, 40);
    const row = planeTiltStyle(hinge, 60, 600);
    expect(board.transform).toBe(row.transform);
    const origin = (s: string | number | undefined) => String(s).split(' ').map((v) => parseFloat(v));
    const [bx, by] = origin(board.transformOrigin);
    const [rx, ry] = origin(row.transformOrigin);
    expect([100 + bx, 40 + by]).toEqual([hinge.x, hinge.y]);
    expect([60 + rx, 600 + ry]).toEqual([hinge.x, hinge.y]);
  });
});

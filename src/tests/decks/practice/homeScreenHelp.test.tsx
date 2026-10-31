let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParams,
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
import { homeScreenPlatform } from '../../../app/decks/practice/HomeScreenHelp';

const setDocument = (key: string, value: unknown) =>
  Object.defineProperty(document, key, { configurable: true, writable: true, value });

describe('homeScreenPlatform (#1127)', () => {
  it('tells iOS Safari, another iOS browser, Android and the rest apart', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(homeScreenPlatform(iphone)).toBe('iosSafari');
    expect(homeScreenPlatform(iphone.replace('Version/17.0', 'CriOS/120.0'))).toBe('iosOther');
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(homeScreenPlatform(ipad, 5)).toBe('iosSafari');
    expect(homeScreenPlatform(ipad, 0)).toBe('other');
    expect(homeScreenPlatform('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36')).toBe('android');
  });
});

describe('the fullscreen button where fullscreen is not available (#1127)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('menu=0');
    localStorage.clear();
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

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
  });

  it('opens the home screen instructions, which close with the Close button or the backdrop', async () => {
    setDocument('fullscreenEnabled', false);
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const button = screen.getByTestId('fullscreen-button');
    expect(button).toHaveAccessibleName('How to add to the home screen');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(() => fireEvent.click(button)).not.toThrow();
    const help = screen.getByRole('dialog', { name: 'Add to Home Screen' });
    expect(help).toHaveTextContent('Add to Home Screen');

    fireEvent.click(within(help).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('home-screen-help')).not.toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Close home screen instructions' }));
    expect(screen.queryByTestId('home-screen-help')).not.toBeInTheDocument();
  });

  it('still goes fullscreen where fullscreen is available', async () => {
    setDocument('fullscreenEnabled', true);
    const request = jest.fn(() => Promise.resolve());
    const original = HTMLElement.prototype.requestFullscreen;
    HTMLElement.prototype.requestFullscreen = request;
    try {
      await act(async () => {
        render(<PracticeDrawPage />);
      });
      fireEvent.click(screen.getByTestId('fullscreen-button'));
      expect(request).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('home-screen-help')).not.toBeInTheDocument();
    } finally {
      HTMLElement.prototype.requestFullscreen = original;
    }
  });
});

// iPadOS draws its own close X over the top-left corner of a fullscreen element, so the corner
// column moves below it there, and only there (#1207).
const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

// A deck, so the table and its turn and score column render.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: row('1P001', 'Test Personnel', 'personnel') },
};

describe('the corner column in fullscreen (#1207)', () => {
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const originalRequest = HTMLElement.prototype.requestFullscreen;

  const setNavigator = (userAgent: string, maxTouchPoints: number) => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams('menu=0');
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
    setDocument('fullscreenEnabled', true);
    setDocument('fullscreenElement', null);
    HTMLElement.prototype.requestFullscreen = function (this: HTMLElement) {
      setDocument('fullscreenElement', this);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    setDocument('exitFullscreen', () => {
      setDocument('fullscreenElement', null);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
  });

  afterEach(() => {
    HTMLElement.prototype.requestFullscreen = originalRequest;
    for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
      delete (document as unknown as Record<string, unknown>)[key];
    }
    delete (navigator as unknown as Record<string, unknown>).userAgent;
    delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
  });

  const enterAndLeave = async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const column = screen.getByTestId('corner-buttons');
    const button = screen.getByTestId('fullscreen-button');
    const before = { column: column.className, button: button.className };
    fireEvent.click(button);
    const during = { column: column.className, button: button.className };
    return { column, button, before, during };
  };

  // #1394: iPadOS draws its own close X over the fullscreen table, so the table's button hides.
  it('moves the column below the system controls on an iPad, and hides the fullscreen button there', async () => {
    setNavigator(ipad, 5);
    const { column, before } = await enterAndLeave();
    const turnScoreTop = (el: HTMLElement) => parseFloat(el.style.top);
    expect(before.column).toMatch(/\btop-2\b/);
    expect(column.className).toMatch(/\btop-14\b/);
    expect(column.className).not.toMatch(/\btop-2\b/);
    expect(screen.queryByTestId('fullscreen-button')).not.toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Game menu' })).toBeInTheDocument();
    expect(screen.getByTestId('undo-button')).toBeInTheDocument();
    // Three corner buttons (3 × 24 + 2 × 4) below `top-14` (56), and 8 px clear of them.
    expect(turnScoreTop(screen.getByTestId('turn-score-column'))).toBe(56 + 80 + 8);
    // #1395: jsdom measures no layout, so the column has room enough and keeps its labels.
    const turnScore = screen.getByTestId('turn-score-column');
    expect(within(turnScore).getByText('Turn')).not.toHaveClass('sr-only');
    expect(within(turnScore).getByText('Score')).not.toHaveClass('sr-only');

    // The system X leaves fullscreen: the button comes back.
    await act(async () => {
      await (document as Document & { exitFullscreen: () => Promise<void> }).exitFullscreen();
    });
    const back = screen.getByTestId('fullscreen-button');
    expect(back).toHaveAccessibleName('Enter fullscreen');
    expect(column.className).toBe(before.column);
    expect(turnScoreTop(screen.getByTestId('turn-score-column'))).toBe(8 + 108 + 8);
  });

  it('keeps the column where it is in fullscreen on every other browser', async () => {
    setNavigator(chrome, 0);
    const { column, button, before, during } = await enterAndLeave();
    expect(button).toHaveAccessibleName('Exit fullscreen');
    expect(before.column).toMatch(/\btop-2\b/);
    expect(during.column).toBe(before.column);
    expect(during.button).toBe(before.button);
    expect(parseFloat(screen.getByTestId('turn-score-column').style.top)).toBe(8 + 108 + 8);
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Enter fullscreen');
    expect(column.className).toBe(before.column);
  });
});

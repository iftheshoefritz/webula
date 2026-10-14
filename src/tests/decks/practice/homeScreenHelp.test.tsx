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

const mockReloadPage = jest.fn();
jest.mock('../../../app/decks/practice/reloadPage', () => ({ reloadPage: () => mockReloadPage() }));

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

// #1104: when a new build takes control of an open page, the game menu offers a reload, and a dot
// on the menu button says so. The prompt never covers the table.
describe('the update prompt of the game menu (#1104)', () => {
  const nav = navigator as { serviceWorker?: unknown };
  const hadServiceWorker = 'serviceWorker' in nav;
  let controllerChange: EventTarget;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
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
    controllerChange = new EventTarget();
    Object.defineProperty(nav, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: jest.fn().mockResolvedValue(undefined),
        addEventListener: controllerChange.addEventListener.bind(controllerChange),
        removeEventListener: controllerChange.removeEventListener.bind(controllerChange),
      },
    });
    window.serwist = { register: jest.fn().mockResolvedValue(undefined) } as unknown as Window['serwist'];
    mockReloadPage.mockClear();
  });

  afterEach(() => {
    delete (window as Partial<Window>).serwist;
    if (!hadServiceWorker) delete nav.serviceWorker;
  });

  const renderWithNewBuild = async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    act(() => {
      controllerChange.dispatchEvent(new Event('controllerchange'));
    });
  };

  it('shows nothing before a new build takes control', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.queryByTestId('update-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('update-dot')).not.toBeInTheDocument();
  });

  it('shows the prompt in the menu and a dot on the menu button', async () => {
    await renderWithNewBuild();
    const prompt = within(screen.getByTestId('game-menu-splash')).getByTestId('update-prompt');
    expect(prompt).toHaveTextContent('A new version of Webula is available');
    expect(screen.getByTestId('update-dot')).toBeInTheDocument();
  });

  it('shows the prompt on the top level only, not in the Settings & help sub-view (#1437)', async () => {
    await renderWithNewBuild();
    fireEvent.click(screen.getByRole('button', { name: 'Settings & help' }));
    expect(screen.getByTestId('game-menu-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('update-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('update-dot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('update-prompt')).toBeInTheDocument();
  });

  it('reloads the page on Reload', async () => {
    await renderWithNewBuild();
    fireEvent.click(within(screen.getByTestId('update-prompt')).getByRole('button', { name: 'Reload' }));
    expect(mockReloadPage).toHaveBeenCalledTimes(1);
  });

  // #1134: the new page can take a while to come, so the first tap shows that it was taken.
  it('shows Reloading and disables both buttons after the first tap, and reloads only once', async () => {
    await renderWithNewBuild();
    const prompt = screen.getByTestId('update-prompt');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Reload' }));
    const reloading = within(prompt).getByRole('button', { name: 'Reloading…' });
    expect(reloading).toBeDisabled();
    expect(within(prompt).getByTestId('update-reload-spinner')).toBeInTheDocument();
    expect(within(prompt).getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    fireEvent.click(reloading);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Dismiss' }));
    expect(mockReloadPage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('update-prompt')).toBeInTheDocument();
  });

  it('hides the prompt and the dot on Dismiss', async () => {
    await renderWithNewBuild();
    fireEvent.click(within(screen.getByTestId('update-prompt')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('update-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('update-dot')).not.toBeInTheDocument();
    expect(mockReloadPage).not.toHaveBeenCalled();
  });
});

// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('react-icons/fa', () =>
  new Proxy({}, { get: () => () => null })
);

jest.mock('react-tooltip', () => ({ Tooltip: () => null }));

jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([]),
}));

jest.mock('../../components/SearchResults', () =>
  function MockSearchResults({ viewMode }: { viewMode?: string }) {
    return <div data-testid="search-results" data-view-mode={viewMode} />;
  }
);
jest.mock('../../components/SearchBar', () => () => null);
jest.mock('../../components/SearchPills', () => () => null);
jest.mock('../../components/DeckListPile', () => () => null);
jest.mock('../../components/DeckUploader', () => () => null);
jest.mock('../../components/Help', () => () => null);
jest.mock('../../components/SkillsChart', () => () => null);
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: () => null,
}));

jest.mock('next/link', () =>
  function MockLink({ children, href, ...rest }: { children: React.ReactNode; href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────
import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – the search view mode (#1453)', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
  });

  async function renderAndOpenSearch() {
    const view = await act(async () => render(<DeckBuilderClient data={[]} columns={[]} />));
    // The desktop tab bar's Search tab.
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /^search$/i })[0]); });
    return view;
  }

  function viewModes() {
    return screen.getAllByTestId('search-results').map((el) => el.getAttribute('data-view-mode'));
  }

  it('shows the list on a wide screen with nothing saved', async () => {
    await renderAndOpenSearch();
    expect(viewModes()).toContain('list');
    expect(viewModes()).not.toContain('image');
  });

  it('ignores the old search-view-mode key', async () => {
    localStorage.setItem('search-view-mode', JSON.stringify('image'));
    await renderAndOpenSearch();
    expect(viewModes()).not.toContain('image');
  });

  it('keeps a switch to images under the new key, across a remount', async () => {
    const { unmount } = await renderAndOpenSearch();
    await act(async () => { fireEvent.click(screen.getAllByLabelText('Switch to image view')[0]); });
    expect(viewModes()).not.toContain('list');
    expect(localStorage.getItem('search-view-mode-v2')).toBe(JSON.stringify('image'));
    unmount();

    await renderAndOpenSearch();
    expect(viewModes()).not.toContain('list');
    expect(screen.getAllByLabelText('Switch to list view').length).toBeGreaterThan(0);
  });
});

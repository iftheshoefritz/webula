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

jest.mock('../../components/SearchResults', () => () => null);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function storeDeck(type: string, pile: string) {
  localStorage.setItem(
    'currentDeck',
    JSON.stringify({
      'test-card-1': {
        count: 1,
        row: { collectorsinfo: 'test-card-1', count: 1, type, pile, name: 'Test Card', originalName: 'Test Card', imagefile: 'test' },
      },
    })
  );
}

/** The page renders more than one header; each toolbar copy carries the tooltip, each compact menu copy does not. */
function practiceLinks() {
  const links = screen.getAllByRole('link', { name: 'Practice game' });
  const toolbar = links.filter((l) => l.getAttribute('data-tooltip-content') === 'Practice game');
  const menu = links.filter((l) => !l.hasAttribute('data-tooltip-content'));
  expect(toolbar.length).toBeGreaterThan(0);
  expect(menu.length).toBeGreaterThan(0);
  return { toolbar, menu };
}

async function renderAndOpenMenu() {
  await act(async () => {
    render(<DeckBuilderClient data={[]} columns={[]} />);
  });
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'More deck actions' })[0]);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – practice game button (#1187)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  beforeEach(() => {
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = savedEnv;
  });

  it('shows both copies of the button to a signed-out user who is not on the early access list', async () => {
    storeDeck('personnel', 'drawDeck');
    await renderAndOpenMenu();

    const { toolbar, menu } = practiceLinks();
    toolbar.forEach((link) => {
      expect(link).toHaveAttribute('aria-label', 'Practice game');
      expect(link).toHaveAttribute('href', '/decks/practice');
      expect(link).toHaveAttribute('aria-disabled', 'false');
    });
    menu.forEach((link) => {
      expect(link).toHaveTextContent('Practice game');
      expect(link).toHaveAttribute('href', '/decks/practice');
      expect(link).toHaveAttribute('aria-disabled', 'false');
    });
  });

  it('disables both copies when the deck has no draw deck card', async () => {
    storeDeck('mission', 'mission');
    await renderAndOpenMenu();

    const { toolbar, menu } = practiceLinks();
    [...toolbar, ...menu].forEach((link) => {
      expect(link).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('no longer uses the old labels', async () => {
    storeDeck('personnel', 'drawDeck');
    await renderAndOpenMenu();

    expect(screen.queryByText('Practice draw')).toBeNull();
    expect(document.querySelector('[data-tooltip-content="Practice drawing from your draw pile"]')).toBeNull();
  });
});

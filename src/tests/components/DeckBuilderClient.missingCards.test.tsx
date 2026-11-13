// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
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
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// Invented names only: no playtest card is ever committed (#1616).
const CARD_DATA = [
  {
    collectorsinfo: 'test-card-1',
    name: 'Test Card',
    originalName: 'Test Card',
    imagefile: 'test',
    type: 'Personnel',
    count: 1,
    dilemmatype: '',
    missiontype: '' as const,
    unique: 'n' as const,
  },
];

// A card of the invented playtest set TestSetB, still in testing; TestSetA was removed (#1644), so
// the card data the page holds has none of its cards.
const SET_B_CARD = {
  ...CARD_DATA[0],
  collectorsinfo: 'pt-9201',
  name: 'invented b one',
  originalName: 'Invented B One',
  imagefile: 'PT9201',
  set: 'testsetb',
};

const loadShared = async (content: string, data: typeof CARD_DATA = CARD_DATA) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content, title: 'Shared Deck' }),
  });
  window.history.replaceState({}, '', '/decks?share=TESTID');
  await act(async () => {
    render(<DeckBuilderClient data={data} columns={[]} />);
  });
  await act(async () => {});
};

describe('DeckBuilderClient – the warning of cards not found (#1616)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/decks');
  });

  it('names the count of the cards a shared deck dropped, and still loads the rest', async () => {
    await loadShared('Deck:\n2\tTest Card\n2\tImaginary Card\n\nDilemmas:\n1\tInvented Dilemma');
    expect(screen.getByTestId('deck-missing-cards-warning')).toHaveTextContent('3 cards in this deck were not found');
    const stored = JSON.parse(localStorage.getItem('currentDeck') ?? '{}');
    expect(stored['test-card-1'].count).toBe(2);
  });

  it('says "1 card" for one card', async () => {
    await loadShared('Deck:\n1\tTest Card\n1\tImaginary Card');
    expect(screen.getByTestId('deck-missing-cards-warning')).toHaveTextContent('1 card in this deck was not found');
  });

  it('shows no warning for a deck whose every card is found', async () => {
    await loadShared('Deck:\n2\tTest Card');
    expect(screen.queryByTestId('deck-missing-cards-warning')).toBeNull();
  });

  it('drops the cards of a removed playtest set with the warning, and keeps those of a set in testing (#1644)', async () => {
    await loadShared('Deck:\n2\tInvented B One\n3\tInvented A One', [...CARD_DATA, SET_B_CARD]);
    expect(screen.getByTestId('deck-missing-cards-warning')).toHaveTextContent('3 cards in this deck were not found');
    const stored = JSON.parse(localStorage.getItem('currentDeck') ?? '{}');
    expect(stored['pt-9201'].count).toBe(2);
  });

  it('hides the warning on Dismiss', async () => {
    await loadShared('Deck:\n1\tImaginary Card');
    const warning = screen.getByTestId('deck-missing-cards-warning');
    fireEvent.click(warning.querySelector('button[aria-label="Dismiss"]')!);
    expect(screen.queryByTestId('deck-missing-cards-warning')).toBeNull();
  });
});

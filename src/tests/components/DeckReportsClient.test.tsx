// ── Mocks (must precede imports) ────────────────────────────────────────────

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('react-icons/fa', () =>
  new Proxy({}, { get: () => () => null })
);

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// Capture the props passed to SkillsChart so we can assert on the loaded rows.
let capturedSkillsChartRows: unknown[] | null = null;
jest.mock('../../components/SkillsChart', () => ({
  __esModule: true,
  default: (props: { currentDeckRows: unknown[] }) => {
    capturedSkillsChartRows = props.currentDeckRows;
    return null;
  },
}));

jest.mock('../../components/PileAggregate', () => () => null);
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/PileAggregateAttributeChart', () => () => null);

// Capture the onSignIn/mode/onConfirmSelection/preSelectedFiles props passed to DrivePickerModal.
let capturedOnSignIn: (() => void) | null = null;
let capturedMode: string | null = null;
let capturedOnConfirmSelection: ((files: { id: string; name: string }[]) => void) | null = null;
let capturedPreSelectedFiles: { id: string; name: string }[] | null = null;
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: (props: {
    onSignIn?: () => void;
    mode?: string;
    onConfirmSelection?: (files: { id: string; name: string }[]) => void;
    preSelectedFiles?: { id: string; name: string }[];
  }) => {
    capturedOnSignIn = props.onSignIn ?? null;
    capturedMode = props.mode ?? null;
    capturedOnConfirmSelection = props.onConfirmSelection ?? null;
    capturedPreSelectedFiles = props.preSelectedFiles ?? null;
    return null;
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import DeckReportsClient from '../../components/DeckReportsClient';

// ── Test data ────────────────────────────────────────────────────────────────

const testData = [
  {
    collectorsinfo: '1',
    originalName: 'Test Card',
    name: 'test card',
    type: 'personnel',
    imagefile: 'testcard',
    missiontype: '',
    dilemmatype: '',
    unique: 'n',
    skills: '',
    keywords: '',
    species: '',
    icons: '',
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckReportsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    capturedOnSignIn = null;
    capturedMode = null;
    capturedOnConfirmSelection = null;
    capturedPreSelectedFiles = null;
    capturedSkillsChartRows = null;
  });

  it('shows an empty state before any deck is picked', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('No deck selected.')).toBeInTheDocument();
  });

  it('opens the picker in multi-select ("compare-multi") mode with a drive-scoped signIn callback', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    const pickButton = screen.getByRole('button', { name: /pick a deck/i });
    await act(async () => {
      fireEvent.click(pickButton);
    });

    expect(capturedMode).toBe('compare-multi');
    expect(capturedOnSignIn).not.toBeNull();

    act(() => {
      capturedOnSignIn!();
    });

    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/decks/reports?openPicker=true' }),
      expect.objectContaining({
        scope: expect.stringContaining('https://www.googleapis.com/auth/drive.appdata'),
        include_granted_scopes: 'true',
      })
    );
  });

  it('loads a single picked deck into the report charts and clears the empty state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    expect(capturedOnConfirmSelection).not.toBeNull();
    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'My Deck' }]);
    });

    expect(screen.queryByText('No deck selected.')).not.toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(capturedSkillsChartRows).toHaveLength(1);
  });

  it('shows a list of deck names (no charts) when 2+ decks are selected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([
        { id: 'file-1', name: 'Deck One' },
        { id: 'file-2', name: 'Deck Two' },
      ]);
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(screen.getByText('Deck Two')).toBeInTheDocument();
    expect(capturedSkillsChartRows).toBeNull();
  });

  it('falls back to the chart view when removing down to 1 deck', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([
        { id: 'file-1', name: 'Deck One' },
        { id: 'file-2', name: 'Deck Two' },
      ]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove deck two/i }));
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(screen.queryByText('Deck Two')).not.toBeInTheDocument();
    expect(capturedSkillsChartRows).toHaveLength(1);
  });

  it('falls back to the empty state when removing down to 0 decks', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'Deck One' }]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove deck one/i }));
    });

    expect(screen.getByText('No deck selected.')).toBeInTheDocument();
    expect(screen.queryByText('Deck One')).not.toBeInTheDocument();
  });

  it('pre-checks the current deck when re-opening the picker via "Change deck"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'Deck One' }]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /change deck/i }));
    });

    expect(capturedPreSelectedFiles).toEqual([{ id: 'file-1', name: 'Deck One' }]);
  });

  it('re-opens the picker with previously-chosen files pre-checked when adding more decks', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([
        { id: 'file-1', name: 'Deck One' },
        { id: 'file-2', name: 'Deck Two' },
      ]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add deck/i }));
    });

    expect(capturedPreSelectedFiles).toEqual([
      { id: 'file-1', name: 'Deck One' },
      { id: 'file-2', name: 'Deck Two' },
    ]);
  });
});

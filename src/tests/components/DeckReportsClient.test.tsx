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

// Capture the onSignIn/mode/loadDriveFile props passed to DrivePickerModal.
let capturedOnSignIn: (() => void) | null = null;
let capturedMode: string | null = null;
let capturedLoadDriveFile: ((file: { id: string; name: string }) => void) | null = null;
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: (props: {
    onSignIn?: () => void;
    mode?: string;
    loadDriveFile: (file: { id: string; name: string }) => void;
  }) => {
    capturedOnSignIn = props.onSignIn ?? null;
    capturedMode = props.mode ?? null;
    capturedLoadDriveFile = props.loadDriveFile;
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
    capturedLoadDriveFile = null;
    capturedSkillsChartRows = null;
  });

  it('shows an empty state before any deck is picked', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('No deck selected.')).toBeInTheDocument();
  });

  it('opens the picker in single-select ("compare") mode with a drive-scoped signIn callback', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    const pickButton = screen.getByRole('button', { name: /pick a deck/i });
    await act(async () => {
      fireEvent.click(pickButton);
    });

    expect(capturedMode).toBe('compare');
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

  it('loads the picked deck into the report charts and clears the empty state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pick a deck/i }));
    });

    expect(capturedLoadDriveFile).not.toBeNull();
    await act(async () => {
      await capturedLoadDriveFile!({ id: 'file-1', name: 'My Deck' });
    });

    expect(screen.queryByText('No deck selected.')).not.toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(capturedSkillsChartRows).toHaveLength(1);
  });
});

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

// Capture the props passed to SkillsCompareTable so we can assert on the loaded decks.
let capturedSkillsCompareTableDecks: { id: string; name: string; rows: unknown[] }[] | null = null;
jest.mock('../../components/SkillsCompareTable', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[] }) => {
    capturedSkillsCompareTableDecks = props.decks;
    return null;
  },
}));

// Capture the props passed to CharacteristicCompareTable (Keywords/Species) so we can
// assert on the loaded decks.
let capturedCharacteristicCompareTableDecks: { id: string; name: string; rows: unknown[] }[][] = [];
jest.mock('../../components/CharacteristicCompareTable', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[] }) => {
    capturedCharacteristicCompareTableDecks.push(props.decks);
    return null;
  },
}));

// Capture the props passed to IconCompareTable (Icons) so we can assert on the loaded decks.
let capturedIconCompareTableDecks: { id: string; name: string; rows: unknown[] }[][] = [];
jest.mock('../../components/IconCompareTable', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[] }) => {
    capturedIconCompareTableDecks.push(props.decks);
    return null;
  },
}));

// Capture the props passed to CardsInCommonTable so we can assert on the loaded decks.
let capturedCardsInCommonDecks: { id: string; name: string; rows: unknown[] }[] | null = null;
jest.mock('../../components/CardsInCommonTable', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[] }) => {
    capturedCardsInCommonDecks = props.decks;
    return null;
  },
}));

let capturedCostChartDecks: { id: string; name: string; rows: unknown[] }[] | null = null;
let capturedCostChartTypes: (string | undefined)[] = [];
jest.mock('../../components/PileAggregateCostChart', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[]; type?: string }) => {
    capturedCostChartDecks = props.decks;
    capturedCostChartTypes.push(props.type);
    return null;
  },
}));

let capturedAttributeChartDecks: { id: string; name: string; rows: unknown[] }[] | null = null;
let capturedAttributeChartTypes: (string | undefined)[] = [];
jest.mock('../../components/PileAggregateAttributeChart', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[]; type?: string }) => {
    capturedAttributeChartDecks = props.decks;
    capturedAttributeChartTypes.push(props.type);
    return null;
  },
}));

let capturedRadarChartDecks: { id: string; name: string; rows: unknown[] }[] | null = null;
jest.mock('../../components/PileAggregateRadarChart', () => ({
  __esModule: true,
  default: (props: { decks: { id: string; name: string; rows: unknown[] }[] }) => {
    capturedRadarChartDecks = props.decks;
    return null;
  },
}));

// Capture the onSignIn/mode/onConfirmSelection/preSelectedFiles props passed to DrivePickerModal.
// Also keep a copy of every DrivePickerModal instance's full props keyed by mode, since
// DeckReportsClient renders a separate instance for the deck picker ('compare-multi') and the
// Reports picker ('reports').
let capturedOnSignIn: (() => void) | null = null;
let capturedMode: string | null = null;
let capturedOnConfirmSelection: ((files: { id: string; name: string }[]) => void) | null = null;
let capturedPreSelectedFiles: { id: string; name: string }[] | null = null;
let capturedPropsByMode: Record<string, any> = {};
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
    capturedPropsByMode[props.mode ?? 'load'] = props;
    return null;
  },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import DeckReportsClient from '../../components/DeckReportsClient';

const fakeSession = {
  accessToken: 'tok',
  session: { user: { name: 'Test', email: 'test@example.com' } },
  user: { name: 'Test', email: 'test@example.com' },
  expires: new Date(Date.now() + 100000).toISOString(),
  hasDriveScope: true,
};

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
    window.history.pushState({}, '', '/decks/reports');
    capturedOnSignIn = null;
    capturedMode = null;
    capturedOnConfirmSelection = null;
    capturedPreSelectedFiles = null;
    capturedPropsByMode = {};
    capturedSkillsCompareTableDecks = null;
    capturedCostChartDecks = null;
    capturedCostChartTypes = [];
    capturedAttributeChartDecks = null;
    capturedAttributeChartTypes = [];
    capturedRadarChartDecks = null;
    capturedCardsInCommonDecks = null;
    capturedCharacteristicCompareTableDecks = [];
    capturedIconCompareTableDecks = [];
  });

  it('shows an empty state before any deck is picked, and renders the skills/cards-in-common tables with 0 decks', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('No deck selected.')).toBeInTheDocument();
    expect(capturedSkillsCompareTableDecks).toEqual([]);
    expect(screen.getByText('Mission cards in common')).toBeInTheDocument();
    expect(capturedCardsInCommonDecks).toEqual([]);
  });

  it('renders the Keywords/Species/Icons tables unconditionally, including with 0 decks', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('Keywords')).toBeInTheDocument();
    expect(screen.getByText('Species')).toBeInTheDocument();
    expect(screen.getByText('Icons')).toBeInTheDocument();
    expect(capturedCharacteristicCompareTableDecks).toEqual([[], []]);
    expect(capturedIconCompareTableDecks).toEqual([[]]);
  });

  it('renders the Costs and Attributes sections with 0 decks', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Costs')).toBeInTheDocument();
    expect(screen.getByText('Attributes')).toBeInTheDocument();
    expect(capturedCostChartDecks).toEqual([]);
    expect(capturedAttributeChartDecks).toEqual([]);
    expect(capturedRadarChartDecks).toEqual([]);
  });

  it('requests line rendering from the Costs and Attributes charts', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(capturedCostChartTypes).toEqual(['line', 'line']);
    expect(capturedAttributeChartTypes).toEqual(['line', 'line', 'line']);
  });

  it('opens the picker in multi-select ("compare-multi") mode with a drive-scoped signIn callback', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    const pickButton = screen.getByRole('button', { name: /select decks/i });
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

  it('loads a single picked deck into the skills table and clears the empty state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });

    expect(capturedOnConfirmSelection).not.toBeNull();
    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'My Deck' }]);
    });

    expect(screen.queryByText('No deck selected.')).not.toBeInTheDocument();
    expect(screen.getByText('My Deck')).toBeInTheDocument();
    expect(capturedSkillsCompareTableDecks).toHaveLength(1);
    expect(screen.getByText('Costs')).toBeInTheDocument();
    expect(screen.getByText('Attributes')).toBeInTheDocument();
    expect(capturedCostChartDecks).toHaveLength(1);
    expect(capturedAttributeChartDecks).toHaveLength(1);
    expect(capturedRadarChartDecks).toHaveLength(1);
    expect(screen.getByText('Mission cards in common')).toBeInTheDocument();
    expect(capturedCardsInCommonDecks).toHaveLength(1);
  });

  it('shows a list of deck names and a skills table with a column per deck when 2+ decks are selected', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([
        { id: 'file-1', name: 'Deck One' },
        { id: 'file-2', name: 'Deck Two' },
      ]);
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(screen.getByText('Deck Two')).toBeInTheDocument();
    expect(capturedSkillsCompareTableDecks).toHaveLength(2);
    expect(screen.getByText('Costs')).toBeInTheDocument();
    expect(screen.getByText('Attributes')).toBeInTheDocument();
    expect(capturedCostChartDecks).toHaveLength(2);
    expect(capturedAttributeChartDecks).toHaveLength(2);
    expect(capturedRadarChartDecks).toHaveLength(2);
    expect(screen.getByText('Mission cards in common')).toBeInTheDocument();
    expect(capturedCardsInCommonDecks).toHaveLength(2);
  });

  it('keeps the skills table at 1 column when removing down to 1 deck', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
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
    expect(capturedSkillsCompareTableDecks).toHaveLength(1);
    expect(screen.getByText('Mission cards in common')).toBeInTheDocument();
    expect(capturedCardsInCommonDecks).toHaveLength(1);
  });

  it('falls back to the empty state and a 0-column skills table when removing down to 0 decks', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'Deck One' }]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove deck one/i }));
    });

    expect(screen.getByText('No deck selected.')).toBeInTheDocument();
    expect(screen.queryByText('Deck One')).not.toBeInTheDocument();
    expect(capturedSkillsCompareTableDecks).toEqual([]);
  });

  it('pre-checks the current deck when re-opening the picker via "Select decks"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });

    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'Deck One' }]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
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
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
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

  it('loads 2 decks and shows Cards in common when ?fixture=1 is present', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(capturedSkillsCompareTableDecks).toHaveLength(2);
    expect(screen.getByText('Mission cards in common')).toBeInTheDocument();
    expect(capturedCardsInCommonDecks).toHaveLength(2);
  });
});

describe('DeckReportsClient – saved Reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    window.history.pushState({}, '', '/decks/reports');
    capturedOnSignIn = null;
    capturedMode = null;
    capturedOnConfirmSelection = null;
    capturedPreSelectedFiles = null;
    capturedPropsByMode = {};
    capturedSkillsCompareTableDecks = null;
  });

  it('opens the reports picker in "reports" mode', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /my reports/i }));
    });

    expect(capturedMode).toBe('reports');
  });

  it('shows a disabled Save as Report button until a name is entered, once a deck is loaded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => '1\tTest Card',
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });
    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'My Deck' }]);
    });

    const saveButton = screen.getByRole('button', { name: /save as report/i });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Report name'), { target: { value: 'My Report' } });
    expect(saveButton).toBeEnabled();
  });

  it('does not show the Save as Report control before any deck is loaded', async () => {
    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.queryByLabelText('Report name')).not.toBeInTheDocument();
  });

  it('POSTs the current decks to /api/drive/reports when Save as Report is confirmed', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(fakeSession);
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/drive/file-1') {
        return Promise.resolve({ ok: true, json: async () => '1\tTest Card' });
      }
      if (url === '/api/drive/reports') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'new-report-id' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ files: [] }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });
    await act(async () => {
      await capturedOnConfirmSelection!([{ id: 'file-1', name: 'My Deck' }]);
    });

    fireEvent.change(screen.getByLabelText('Report name'), { target: { value: 'My Report' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save as report/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/drive/reports',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'My Report', decks: [{ id: 'file-1', name: 'My Deck' }] }),
      })
    );
  });

  it("loads a Report's decks via the reports picker's load action", async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(fakeSession);
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/drive/reports') {
        return Promise.resolve({ ok: true, json: async () => ({ files: [{ id: 'report-1', name: 'My Report' }] }) });
      }
      if (url === '/api/drive/report-1') {
        return Promise.resolve({ ok: true, json: async () => ({ decks: [{ id: 'file-1', name: 'Deck One' }] }) });
      }
      if (url === '/api/drive/file-1') {
        return Promise.resolve({ ok: true, json: async () => '1\tTest Card' });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /my reports/i }));
    });

    expect(capturedPropsByMode['reports']?.driveFiles).toEqual([{ id: 'report-1', name: 'My Report' }]);

    await act(async () => {
      await capturedPropsByMode['reports']!.loadDriveFile({ id: 'report-1', name: 'My Report' });
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
  });

  it('renames a saved Report via the reports picker', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(fakeSession);
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/drive/reports') {
        return Promise.resolve({ ok: true, json: async () => ({ files: [{ id: 'report-1', name: 'My Report' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /my reports/i }));
    });

    await act(async () => {
      await capturedPropsByMode['reports']!.onRenameFile({ id: 'report-1', name: 'My Report' }, 'Renamed Report');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/drive/report-1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ fileName: 'Renamed Report' }) })
    );
  });

  it('surfaces a per-deck load error for a stale deck ref without discarding the rest', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/drive/file-1') {
        return Promise.resolve({ ok: true, json: async () => '1\tTest Card' });
      }
      if (url === '/api/drive/missing') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Google API error' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /select decks/i }));
    });
    await act(async () => {
      await capturedOnConfirmSelection!([
        { id: 'file-1', name: 'Deck One' },
        { id: 'missing', name: 'Deleted Deck' },
      ]);
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
    expect(screen.getByText('Deleted Deck')).toBeInTheDocument();
    expect(screen.getByText(/failed to load this deck/i)).toBeInTheDocument();
  });

  it('loads a Report from the ?report=<id> URL param on mount', async () => {
    window.history.pushState({}, '', '/decks/reports?report=report-1');
    (getSession as jest.Mock).mockResolvedValueOnce(fakeSession);
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/drive/report-1') {
        return Promise.resolve({ ok: true, json: async () => ({ decks: [{ id: 'file-1', name: 'Deck One' }] }) });
      }
      if (url === '/api/drive/file-1') {
        return Promise.resolve({ ok: true, json: async () => '1\tTest Card' });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await act(async () => {
      render(<DeckReportsClient data={testData} />);
    });

    expect(screen.getByText('Deck One')).toBeInTheDocument();
  });
});

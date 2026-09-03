// ── Mocks (must precede imports) ────────────────────────────────────────────

// jsdom doesn't provide TextEncoder/TextDecoder globally; the bulk-import flow uses them to
// read the /api/drive/bulk endpoint's streamed NDJSON response body.
import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
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

// jsdom's FileReader doesn't read real contents from a File built in tests, so this stubs it
// to synchronously resolve with the content stashed on the File by makeFile() below.
class MockFileReader {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  result: string | null = null;

  readAsText(file: File & { __content?: string }) {
    this.result = file.__content ?? '';
    this.onload?.({ target: { result: this.result } });
  }
}

function makeFile(name: string, content: string): File {
  const file = new File([content], name, { type: 'text/plain' }) as File & { __content?: string };
  file.__content = content;
  return file;
}

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const cardData = [
  { collectorsinfo: '1R000', originalName: 'Card 1', name: 'card 1', type: 'event' },
  { collectorsinfo: '2C001', originalName: 'Card 2', name: 'card 2', type: 'event' },
];

function mockSession() {
  (getSession as jest.Mock).mockResolvedValue({
    user: { name: 'Test User', email: 'test@example.com' },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    accessToken: 'mock-token',
  });
}

function driveListResponse(files: unknown[] = []) {
  return { ok: true, json: async () => ({ files }) };
}

function ndjsonResponse(objects: unknown[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i < objects.length) {
              const chunk = encoder.encode(JSON.stringify(objects[i]) + '\n');
              i++;
              return { done: false, value: chunk };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}

function selectFiles(files: File[]) {
  const input = document.getElementById('fileInput') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

const originalFileReader = global.FileReader;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – bulk import from disk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    (global as any).FileReader = MockFileReader;
  });

  afterEach(() => {
    global.FileReader = originalFileReader;
  });

  it('selecting a single file loads it into the builder without prompting for a destination', async () => {
    mockSession();
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={cardData} columns={[]} />);
    });

    await act(async () => {
      selectFiles([makeFile('Deck A.txt', '1\tCard 1')]);
    });

    expect(screen.queryByText(/decks" to/)).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('selecting multiple files opens the destination picker, then saves each and shows per-file results', async () => {
    mockSession();

    const mockFetch = jest.fn()
      .mockResolvedValueOnce(driveListResponse())
      .mockResolvedValueOnce(
        ndjsonResponse([
          { title: 'Deck A', status: 'created' },
          { title: 'Deck B', status: 'created' },
        ])
      );
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={cardData} columns={[]} />);
    });

    await act(async () => {
      selectFiles([makeFile('Deck A.txt', '1\tCard 1'), makeFile('Deck B.txt', '1\tCard 2')]);
    });

    expect(await screen.findByRole('button', { name: 'Save to Root' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save to Root' }));
    });

    expect(await screen.findByText('Deck A')).toBeInTheDocument();
    expect(screen.getByText('Deck B')).toBeInTheDocument();
    expect(screen.getAllByText('created')).toHaveLength(2);

    const bulkPostCalls = mockFetch.mock.calls.filter(([url]) => url === '/api/drive/bulk');
    expect(bulkPostCalls).toHaveLength(1);
    expect(JSON.parse(bulkPostCalls[0][1].body)).toEqual({
      decks: [
        { title: 'Deck A', content: '1\tCard 1' },
        { title: 'Deck B', content: '1\tCard 2' },
      ],
      targetParentId: 'appDataFolder',
    });
  });

  it('excludes a file that is not a recognized LackeyCCG export and reports it as skipped', async () => {
    mockSession();

    const mockFetch = jest.fn()
      .mockResolvedValueOnce(driveListResponse())
      .mockResolvedValueOnce(ndjsonResponse([{ title: 'Deck A', status: 'created' }]));
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={cardData} columns={[]} />);
    });

    await act(async () => {
      selectFiles([makeFile('Deck A.txt', '1\tCard 1'), makeFile('Not A Deck.txt', 'nonsense')]);
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Save to Root' }));
    });

    expect(await screen.findByText('Not A Deck.txt')).toBeInTheDocument();
    expect(screen.getByText('skipped')).toBeInTheDocument();

    const bulkPostCalls = mockFetch.mock.calls.filter(([url]) => url === '/api/drive/bulk');
    expect(JSON.parse(bulkPostCalls[0][1].body).decks).toEqual([{ title: 'Deck A', content: '1\tCard 1' }]);
  });

  it('triggers Drive sign-in instead of the destination picker when not signed in', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn();

    await act(async () => {
      render(<DeckBuilderClient data={cardData} columns={[]} />);
    });

    await act(async () => {
      selectFiles([makeFile('Deck A.txt', '1\tCard 1'), makeFile('Deck B.txt', '1\tCard 2')]);
    });

    expect(screen.queryByRole('button', { name: 'Save to Root' })).not.toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith(
      'google',
      expect.objectContaining({ callbackUrl: '/decks' }),
      expect.objectContaining({ scope: expect.stringContaining('drive.appdata') })
    );
  });

  it('closing the results modal clears it so a new import can be started', async () => {
    mockSession();

    const mockFetch = jest.fn()
      .mockResolvedValueOnce(driveListResponse())
      .mockResolvedValueOnce(ndjsonResponse([{ title: 'Deck A', status: 'created' }]));
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={cardData} columns={[]} />);
    });

    await act(async () => {
      selectFiles([makeFile('Deck A.txt', '1\tCard 1'), makeFile('Deck B.txt', '1\tCard 1')]);
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Save to Root' }));
    });

    expect(await screen.findByText('Close')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Close'));
    });

    expect(screen.queryByText('Importing decks from disk')).not.toBeInTheDocument();
  });
});

jest.mock('d3', () => ({
  tsvParse: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const values = line.split('\t');
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  },
}));

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import { PlaytestCardsProvider, usePlaytestCards, useWithPlaytestCards } from '../../hooks/usePlaytestCards';
import { cardImageUrl, playtestImageVersions, setPlaytestImageVersions } from '../../lib/cardImageUrl';
import { filterCards } from '../../lib/filterCards';
import type { CardData } from '../../lib/loadCards';

// Invented sets and cards only: no playtest card is ever committed (#1614, #1644).
const HEADERS = ['Name', 'Set', 'ImageFile', 'Unique', 'CollectorsInfo', 'Type', 'Keywords', 'Mission', 'DilemmaType'];
const tsvOf = (rows: string[][]) => [HEADERS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
const SET_A_TSV = tsvOf([['Zed Quill', 'TestSetA', 'PT-ZedQuill', 'Y', 'PT-1', 'Personnel', '', '', '']]);
const SET_B_TSV = tsvOf([['Widget Array', 'TestSetB', 'PT-Widget', 'N', 'PT-2', 'Equipment', '', '', '']]);
const answer = (versionA: number, versionB = 1) => ({
  sets: [
    { name: 'TestSetB', version: versionB, tsv: SET_B_TSV },
    { name: 'TestSetA', version: versionA, tsv: SET_A_TSV },
  ],
});
const zedUrl = () => cardImageUrl({ imagefile: 'PT-ZedQuill', set: 'testseta', collectorsinfo: 'pt-1' } as never);

const publicData = [
  { name: 'public one', originalName: 'Public One', collectorsinfo: '1r1', imagefile: 'p1', set: 'premiere', type: 'event' },
] as unknown as CardData[];

function Names() {
  const data = useWithPlaytestCards(publicData);
  return (
    <ul>
      {data.map((row) => (
        <li key={row.collectorsinfo} data-testid="row" data-unique={row.unique} data-set={String(row.set)}>
          {row.originalName}
        </li>
      ))}
    </ul>
  );
}

const renderTree = () => render(<PlaytestCardsProvider><Names /></PlaytestCardsProvider>);
const names = () => screen.getAllByTestId('row').map((li) => li.textContent);

const signedIn = { status: 'authenticated', data: { user: { email: 'tester@example.com' } } };

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  setPlaytestImageVersions(new Map());
  jest.restoreAllMocks();
});

describe('the playtest device flag (#1660)', () => {
  beforeEach(() => localStorage.clear());

  it('is set once a signed-in user loads a non-empty set', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => answer(5, 2) });
    renderTree();
    await waitFor(() => expect(localStorage.getItem('playtest-device')).toBe('1'));
  });

  it('is not set on a 404 or an empty answer', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const { unmount } = renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ sets: [] }) });
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(localStorage.getItem('playtest-device')).toBeNull();
  });
});

describe('PlaytestCardsProvider and useWithPlaytestCards (#1614)', () => {
  it('sends no request when signed out, and gives the public cards alone', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    renderTree();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(names()).toEqual(['Public One']);
  });

  it('gives the public cards alone on a 404, with no error and no log', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/playtest/cards'));
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(playtestImageVersions().size).toBe(0);
  });

  it('merges the playtest cards after the public cards on a 200', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => answer(5, 2) });
    renderTree();
    await waitFor(() => expect(names()).toEqual(['Public One', 'Widget Array', 'Zed Quill']));
    const rows = screen.getAllByTestId('row');
    // A playtest personnel is unique `y`, and every playtest row keeps its own set (#1644).
    expect(rows[2]).toHaveAttribute('data-unique', 'y');
    expect(rows[1]).toHaveAttribute('data-set', 'testsetb');
    expect(rows[2]).toHaveAttribute('data-set', 'testseta');
    expect(playtestImageVersions()).toEqual(new Map([['testseta', 5], ['testsetb', 2]]));
    expect(zedUrl()).toBe('/api/playtest/images/testseta/PT-ZedQuill.jpg?v=5');
  });

  it('exposes the sets by name for the picker', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => answer(5, 2) });
    function Sets() {
      return <p data-testid="sets">{JSON.stringify(usePlaytestCards().sets)}</p>;
    }
    render(<PlaytestCardsProvider><Sets /></PlaytestCardsProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByTestId('sets').textContent ?? '[]')).toEqual([
      { label: 'TestSetA', value: 'testseta', version: 5 },
      { label: 'TestSetB', value: 'testsetb', version: 2 },
    ]));
  });

  it.each([
    ['no sets, before the first upload', { sets: [] }],
    ['the { version, tsv } answer of before #1644, from an offline cache', { version: 3, tsv: SET_A_TSV }],
    ['a set with no version', { sets: [{ name: 'TestSetA', tsv: SET_A_TSV }] }],
  ])('treats %s as no playtest cards', async (_, body) => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
    expect(playtestImageVersions().size).toBe(0);
  });

  it('still gives the public cards when the request fails', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderTree();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(names()).toEqual(['Public One']);
  });

  // An iPad that wakes before its network is back fails next-auth's session refetch, and the
  // session reads as signed out with the restored game on the table (#1625).
  it('keeps the playtest cards and their image version when the session drops to signed out in place', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => answer(2) });
    const { rerender } = renderTree();
    await waitFor(() => expect(names()).toHaveLength(3));
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    rerender(<PlaytestCardsProvider><Names /></PlaytestCardsProvider>);
    await Promise.resolve();
    expect(names()).toHaveLength(3);
    expect(zedUrl()).toBe('/api/playtest/images/testseta/PT-ZedQuill.jpg?v=2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops the playtest cards on a switch to an account that is not a playtester', async () => {
    mockUseSession.mockReturnValue(signedIn);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => answer(2) });
    const { rerender } = renderTree();
    await waitFor(() => expect(names()).toHaveLength(3));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
    mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { email: 'other@example.com' } } });
    rerender(<PlaytestCardsProvider><Names /></PlaytestCardsProvider>);
    await waitFor(() => expect(names()).toEqual(['Public One']));
    expect(playtestImageVersions().size).toBe(0);
  });
});

function Settled() {
  return <p data-testid="settled">{String(usePlaytestCards().settled)}</p>;
}
const settled = () => screen.getByTestId('settled').textContent;
const renderSettled = () => render(<PlaytestCardsProvider><Settled /></PlaytestCardsProvider>);

describe('settled (#1615)', () => {
  it('is false while the session or the request is on its way, and true once the answer is in', async () => {
    mockUseSession.mockReturnValue({ status: 'loading', data: null });
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { rerender } = renderSettled();
    expect(settled()).toBe('false');
    mockUseSession.mockReturnValue(signedIn);
    rerender(<PlaytestCardsProvider><Settled /></PlaytestCardsProvider>);
    expect(settled()).toBe('false');
    answer({ ok: false, status: 404, json: async () => ({}) });
    await waitFor(() => expect(settled()).toBe('true'));
  });

  it('is true at once when signed out online, with no request', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    renderSettled();
    expect(settled()).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for the playtest cards offline, where the session reads as signed out', async () => {
    jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => answer(4) });
    renderTree();
    await waitFor(() => expect(names()).toEqual(['Public One', 'Widget Array', 'Zed Quill']));
    expect(playtestImageVersions().get('testseta')).toBe(4);
  });
});

describe('the set filter of the playtest sets (#1644)', () => {
  const merged = async () => {
    const { playtestRowsOf } = await import('../../hooks/usePlaytestCards');
    const rows = [...(await playtestRowsOf(SET_A_TSV)), ...(await playtestRowsOf(SET_B_TSV))];
    // A real set whose value is a part of a playtest set's name.
    const real = [
      ...publicData,
      { name: 'public two', originalName: 'Public Two', collectorsinfo: '2r1', imagefile: 'p2', set: 'a', type: 'event' },
      { name: 'public three', originalName: 'Public Three', collectorsinfo: '3r1', imagefile: 'p3', set: 'in', type: 'event' },
    ] as unknown as CardData[];
    return [...real, ...rows];
  };
  const find = async (query: string) =>
    filterCards(await merged(), ['name', 'set'], query).map((row) => row.originalName);

  it('finds only the rows of the set named', async () => {
    expect(await find('set:testseta')).toEqual(['Zed Quill']);
    expect(await find('set:TestSetB')).toEqual(['Widget Array']);
  });

  it('matches a playtest row on the whole set name only', async () => {
    expect(await find('set:a')).toEqual(['Public Two']);
    expect(await find('set:in')).toEqual(['Public Three']);
    expect(await find('set:testset')).toEqual([]);
  });

  it('excludes on the whole set name too', async () => {
    expect(await find('-set:testseta')).toEqual(['Public One', 'Public Two', 'Public Three', 'Widget Array']);
    expect(await find('-set:a')).toEqual(['Public One', 'Public Three', 'Zed Quill', 'Widget Array']);
  });
});

describe('settled, for a deck from the URL (#1616)', () => {
  function Settled() {
    return <p data-testid="settled">{String(usePlaytestCards().settled)}</p>;
  }
  const renderSettled = () => render(<PlaytestCardsProvider><Settled /></PlaytestCardsProvider>);
  const settled = () => screen.getByTestId('settled').textContent;

  it('has settled with no provider', () => {
    render(<Settled />);
    expect(settled()).toBe('true');
  });

  it('has not settled while the session loads', () => {
    mockUseSession.mockReturnValue({ status: 'loading', data: null });
    renderSettled();
    expect(settled()).toBe('false');
  });

  it('has settled at once for a signed-out user', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
    renderSettled();
    expect(settled()).toBe('true');
  });

  it('settles for a signed-in user once the answer is in, a 404 too', async () => {
    mockUseSession.mockReturnValue(signedIn);
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderSettled();
    expect(settled()).toBe('false');
    answer({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
    await waitFor(() => expect(settled()).toBe('true'));
  });
});

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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPills from '../../components/SearchPills';
import { PlaytestCardsProvider } from '../../hooks/usePlaytestCards';
import { setPlaytestImageVersions } from '../../lib/cardImageUrl';

// Invented sets and cards only: no playtest card is ever committed (#1614, #1644).
const tsvOf = (set: string, name: string, collectorsInfo: string) => [
  ['Name', 'Set', 'ImageFile', 'Unique', 'CollectorsInfo', 'Type', 'Keywords', 'Mission', 'DilemmaType'].join('\t'),
  [name, set, `PT-${collectorsInfo}`, 'Y', `PT-${collectorsInfo}`, 'Personnel', '', '', ''].join('\t'),
].join('\n');
const SETS_ANSWER = {
  sets: [
    { name: 'TestSetB', version: 1, tsv: tsvOf('TestSetB', 'Widget Array', '2') },
    { name: 'TestSetA', version: 3, tsv: tsvOf('TestSetA', 'Zed Quill', '1') },
  ],
};

const signedIn = { status: 'authenticated', data: { user: { email: 'tester@example.com' } } };

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});
afterEach(() => {
  setPlaytestImageVersions(new Map());
  jest.restoreAllMocks();
});

const renderPills = (searchQuery = '', setSearchQuery = jest.fn()) =>
  render(
    <PlaytestCardsProvider>
      <SearchPills searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
    </PlaytestCardsProvider>,
  );

const openSetPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
  fireEvent.click(screen.getByRole('button', { name: /^set:$/i }));
};

const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('SearchPills: the options of the playtest sets in the Set picker (#1623, #1644)', () => {
  describe('with playtest cards', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue(signedIn);
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => SETS_ANSWER });
    });

    it('lists one option per set, by name, above the real sets, and no Playtest option', async () => {
      renderPills();
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      openSetPicker();
      await waitFor(() => expect(optionLabels().slice(0, 2)).toEqual(['TestSetA', 'TestSetB']));
      expect(optionLabels().length).toBeGreaterThan(2);
      expect(screen.queryByRole('option', { name: 'Playtest' })).not.toBeInTheDocument();
    });

    it('filters with the search box', async () => {
      renderPills();
      openSetPicker();
      await waitFor(() => expect(screen.getByRole('option', { name: 'TestSetA' })).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText('Search sets...'), { target: { value: 'testsetb' } });
      expect(optionLabels()).toContain('TestSetB');
      expect(optionLabels()).not.toContain('TestSetA');
    });

    it('sets the query to set:testseta', async () => {
      const setSearchQuery = jest.fn();
      renderPills('', setSearchQuery);
      openSetPicker();
      fireEvent.click(await screen.findByRole('option', { name: 'TestSetA' }));
      expect(setSearchQuery).toHaveBeenCalledWith('set:testseta');
    });

    it('sets the query to -set:testsetb in exclude mode', async () => {
      const setSearchQuery = jest.fn();
      renderPills('', setSearchQuery);
      openSetPicker();
      fireEvent.click(screen.getByRole('button', { name: /− exclude/i }));
      fireEvent.click(await screen.findByRole('option', { name: 'TestSetB' }));
      expect(setSearchQuery).toHaveBeenCalledWith('-set:testsetb');
    });

    it("labels the pill of an active set filter with the set's name", async () => {
      renderPills('set:testseta');
      await waitFor(() => expect(screen.getByText('set:TestSetA')).toBeInTheDocument());
    });
  });

  describe('with no playtest cards', () => {
    it('has no playtest set option when signed out', async () => {
      mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
      renderPills();
      openSetPicker();
      expect(optionLabels().length).toBeGreaterThan(0);
      expect(screen.queryByRole('option', { name: 'TestSetA' })).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('has no playtest set option after a 404 from /api/playtest/cards', async () => {
      mockUseSession.mockReturnValue(signedIn);
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
      renderPills();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/playtest/cards'));
      await Promise.resolve();
      openSetPicker();
      expect(optionLabels().length).toBeGreaterThan(0);
      expect(screen.queryByRole('option', { name: 'TestSetA' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'TestSetB' })).not.toBeInTheDocument();
    });
  });
});

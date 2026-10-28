/**
 * @jest-environment node
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

import { GET as getIndex } from '../../app/api/championship-decks/route';
import { GET as getDeck } from '../../app/api/championship-decks/[file]/route';
import type { ChampionshipDeck } from '../../lib/championshipDecks';

// The real index of the top-level folder (#1327).
const rows = JSON.parse(
  readFileSync(join(process.cwd(), 'championship-decks', 'index.json'), 'utf-8'),
) as ChampionshipDeck[];
const permitted = rows.find((row) => row.authorizedUse)!;
const hidden = rows.find((row) => !row.authorizedUse)!;

const request = (path: string) => new Request(`http://localhost${path}`);
const deckRequest = (file: string) =>
  getDeck(request(`/api/championship-decks/${encodeURIComponent(file)}`), { params: Promise.resolve({ file }) });

describe('/api/championship-decks (#1327)', () => {
  const original = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    mockGetToken.mockReset();
  });
  afterAll(() => { process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = original; });

  it('has a permitted and a hidden deck in the real index to test with', () => {
    expect(permitted).toBeDefined();
    expect(hidden).toBeDefined();
  });

  it('gives an early-access caller every row', async () => {
    mockGetToken.mockResolvedValue({ email: 'early@example.com' });
    const body = await (await getIndex(request('/api/championship-decks'))).json();
    expect(body).toHaveLength(rows.length);
  });

  it('gives another caller, and a caller with no token, only the authorizedUse rows', async () => {
    const expected = rows.filter((row) => row.authorizedUse).map((row) => row.file);
    mockGetToken.mockResolvedValue({ email: 'other@example.com' });
    const signedIn = await (await getIndex(request('/api/championship-decks'))).json();
    expect(signedIn.map((row: ChampionshipDeck) => row.file)).toEqual(expected);
    mockGetToken.mockResolvedValue(null);
    const signedOut = await (await getIndex(request('/api/championship-decks'))).json();
    expect(signedOut.map((row: ChampionshipDeck) => row.file)).toEqual(expected);
  });

  it('returns a permitted deck to a signed-out caller', async () => {
    mockGetToken.mockResolvedValue(null);
    const response = await deckRequest(permitted.file);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(readFileSync(join(process.cwd(), 'championship-decks', permitted.file), 'utf-8'));
  });

  it('returns a hidden deck only to an early-access caller', async () => {
    mockGetToken.mockResolvedValue({ email: 'other@example.com' });
    expect((await deckRequest(hidden.file)).status).toBe(404);
    mockGetToken.mockResolvedValue(null);
    expect((await deckRequest(hidden.file)).status).toBe(404);
    mockGetToken.mockResolvedValue({ email: 'early@example.com' });
    expect((await deckRequest(hidden.file)).status).toBe(200);
  });

  it('returns 404 for a name that is not in the index, ../ paths too', async () => {
    mockGetToken.mockResolvedValue({ email: 'early@example.com' });
    for (const file of ['index.json', 'missing.txt', '../package.json', `../championship-decks/${permitted.file}`]) {
      expect((await deckRequest(file)).status).toBe(404);
    }
  });
});

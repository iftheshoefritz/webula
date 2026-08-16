/**
 * @jest-environment node
 */

const mockFilesList = jest.fn();
const mockFilesCreate = jest.fn();
const mockFilesUpdate = jest.fn();
const mockGetToken = jest.fn();

jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
    drive: jest.fn().mockImplementation(() => ({
      files: {
        list: (...args: unknown[]) => mockFilesList(...args),
        create: (...args: unknown[]) => mockFilesCreate(...args),
        update: (...args: unknown[]) => mockFilesUpdate(...args),
      },
    })),
  },
}));

import { POST } from '../../../app/api/drive/bulk/route';

function validToken() {
  return { accessToken: 'tok', accessTokenExpires: Date.now() + 100000, refreshToken: 'r' };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/drive/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/drive/bulk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
  });

  it('returns 401 when there is no valid session', async () => {
    mockGetToken.mockRejectedValue(new Error('no session'));

    const res = await POST(makeRequest({ decks: [{ trekccDeckId: '1', title: 'A', content: 'x' }] }));

    expect(res.status).toBe(401);
  });

  it('returns 400 when no decks are provided', async () => {
    const res = await POST(makeRequest({ decks: [] }));
    expect(res.status).toBe(400);
  });

  it('creates a new file and stores the trekccDeckId when no existing file matches', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    mockFilesCreate.mockResolvedValue({ data: { id: 'new-file-id' } });

    const res = await POST(
      makeRequest({ decks: [{ trekccDeckId: '54535', title: 'Deck One', content: '1\tPicard' }] })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([{ trekccDeckId: '54535', title: 'Deck One', status: 'created' }]);
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: 'Deck One',
          appProperties: { trekccDeckId: '54535' },
        }),
      })
    );
    expect(mockFilesUpdate).not.toHaveBeenCalled();
  });

  it('updates the existing file instead of creating a duplicate when a trekccDeckId match is found', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'existing-file-id' }] } });
    mockFilesUpdate.mockResolvedValue({ data: {} });

    const res = await POST(
      makeRequest({ decks: [{ trekccDeckId: '54535', title: 'Deck One Renamed', content: '1\tPicard' }] })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([{ trekccDeckId: '54535', title: 'Deck One Renamed', status: 'updated' }]);
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'existing-file-id', requestBody: { name: 'Deck One Renamed' } })
    );
    expect(mockFilesCreate).not.toHaveBeenCalled();
  });

  it('isolates a failure for one deck and continues saving the rest, surfacing the real error message', async () => {
    mockFilesList
      .mockRejectedValueOnce(new Error('Drive unavailable'))
      .mockResolvedValueOnce({ data: { files: [] } });
    mockFilesCreate.mockResolvedValue({ data: { id: 'second-id' } });

    const res = await POST(
      makeRequest({
        decks: [
          { trekccDeckId: '1', title: 'Broken Deck', content: 'x' },
          { trekccDeckId: '2', title: 'Good Deck', content: 'y' },
        ],
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([
      { trekccDeckId: '1', title: 'Broken Deck', status: 'failed', error: 'Drive unavailable' },
      { trekccDeckId: '2', title: 'Good Deck', status: 'created' },
    ]);
  });

  it('prefers the Gaxios response error message over the generic Error message when both are present', async () => {
    mockFilesList.mockRejectedValueOnce({
      message: 'Request failed with status code 400',
      response: { data: { error: { message: "Invalid query: 'appProperties has ...'" } } },
    });

    const res = await POST(
      makeRequest({ decks: [{ trekccDeckId: '1', title: 'Broken Deck', content: 'x' }] })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([
      { trekccDeckId: '1', title: 'Broken Deck', status: 'failed', error: "Invalid query: 'appProperties has ...'" },
    ]);
  });

  it('falls back to "Save failed" when the error has no message', async () => {
    mockFilesList.mockRejectedValueOnce({});

    const res = await POST(
      makeRequest({ decks: [{ trekccDeckId: '1', title: 'Broken Deck', content: 'x' }] })
    );
    const body = await res.json();

    expect(body.results).toEqual([
      { trekccDeckId: '1', title: 'Broken Deck', status: 'failed', error: 'Save failed' },
    ]);
  });

  it('returns drive_scope_missing with a 403 status when Google denies access', async () => {
    const scopeError = { code: 403, response: { status: 403 } };
    mockFilesList.mockRejectedValue(scopeError);

    const res = await POST(
      makeRequest({ decks: [{ trekccDeckId: '1', title: 'Deck', content: 'x' }] })
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('drive_scope_missing');
  });
});

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

import { POST } from '../../../app/api/drive/route';

function validToken() {
  return { accessToken: 'tok', accessTokenExpires: Date.now() + 100000, refreshToken: 'r' };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/drive', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/drive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
  });

  it('always creates a new file (no idempotency check) when no trekccDeckId is given', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'created-id' } });

    const res = await POST(makeRequest({ fileName: 'My Deck', content: '1\tPicard' }));

    expect(res.status).toBe(200);
    expect(mockFilesList).not.toHaveBeenCalled();
    expect(mockFilesCreate).toHaveBeenCalled();
  });

  it('updates the existing Drive file instead of creating a duplicate when trekccDeckId matches an existing file', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'existing-id' }] } });
    mockFilesUpdate.mockResolvedValue({ data: {} });

    const res = await POST(
      makeRequest({ fileName: 'My Deck', content: '1\tPicard', trekccDeckId: '54535' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ file: { id: 'existing-id' }, status: 'updated' });
    expect(mockFilesCreate).not.toHaveBeenCalled();
  });

  it('creates a file with the trekccDeckId appProperty when no existing match is found', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [] } });
    mockFilesCreate.mockResolvedValue({ data: { id: 'new-id' } });

    const res = await POST(
      makeRequest({ fileName: 'My Deck', content: '1\tPicard', trekccDeckId: '54535' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ file: { id: 'new-id' }, status: 'created' });
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ appProperties: { trekccDeckId: '54535' } }),
      })
    );
  });
});

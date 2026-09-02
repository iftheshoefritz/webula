/**
 * @jest-environment node
 */

const mockFilesList = jest.fn();
const mockFilesCreate = jest.fn();
const mockFilesUpdate = jest.fn();
const mockFilesGet = jest.fn();
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
        get: (...args: unknown[]) => mockFilesGet(...args),
      },
    })),
  },
}));

import { GET, POST } from '../../../app/api/drive/route';
import { DECK_MIME_TYPE, FOLDER_MIME_TYPE } from '../../../app/api/drive/mimeTypes';

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

  it('creates a file with the given targetParentId as parents instead of appDataFolder', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'created-id' } });

    await POST(makeRequest({ fileName: 'My Deck', content: '1\tPicard', targetParentId: 'folder-1' }));

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ parents: ['folder-1'] }),
      })
    );
  });

  it('creates a file with appDataFolder as parents when no targetParentId is given', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'created-id' } });

    await POST(makeRequest({ fileName: 'My Deck', content: '1\tPicard' }));

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ parents: ['appDataFolder'] }),
      })
    );
  });

  it('creates a folder with no media when folderName is given', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'folder-id' } });

    const res = await POST(makeRequest({ folderName: 'My Folder' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ file: { id: 'folder-id' } });
    expect(mockFilesList).not.toHaveBeenCalled();
    expect(mockFilesCreate).toHaveBeenCalledWith({
      requestBody: {
        name: 'My Folder',
        mimeType: FOLDER_MIME_TYPE,
        parents: ['appDataFolder'],
      },
      fields: 'id',
    });
    expect(mockFilesCreate.mock.calls[0][0]).not.toHaveProperty('media');
  });
});

describe('GET /api/drive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
    mockFilesGet.mockResolvedValue({ data: { id: 'real-appdata-id-123' } });
  });

  it('lists only files with the deck mimeType, excluding saved Reports', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'd1', name: 'My Deck' }] } });

    const res = await GET(new Request('http://localhost/api/drive', { method: 'GET' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ files: [{ id: 'd1', name: 'My Deck' }] });
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: `mimeType='${DECK_MIME_TYPE}'` })
    );
    expect(mockFilesList).not.toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.anything() })
    );
  });

  it('includes folders and returns mimeType/parents fields when includeFolders=true is given', async () => {
    mockFilesList.mockResolvedValue({
      data: { files: [{ id: 'd1', name: 'My Deck', mimeType: DECK_MIME_TYPE, parents: ['appDataFolder'] }] },
    });

    const res = await GET(new Request('http://localhost/api/drive?includeFolders=true', { method: 'GET' }));

    expect(res.status).toBe(200);
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        q: `mimeType='${DECK_MIME_TYPE}' or mimeType='${FOLDER_MIME_TYPE}'`,
        fields: expect.stringContaining('mimeType'),
      })
    );
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.stringContaining('parents') })
    );
  });

  it('normalizes the App Data folder\'s real resolved id back to the literal "appDataFolder" in parents', async () => {
    mockFilesList.mockResolvedValue({
      data: {
        files: [
          { id: 'd1', name: 'Root Deck', mimeType: DECK_MIME_TYPE, parents: ['real-appdata-id-123'] },
          { id: 'd2', name: 'Nested Deck', mimeType: DECK_MIME_TYPE, parents: ['folder-1'] },
        ],
      },
    });
    mockFilesGet.mockResolvedValue({ data: { id: 'real-appdata-id-123' } });

    const res = await GET(new Request('http://localhost/api/drive?includeFolders=true', { method: 'GET' }));
    const body = await res.json();

    expect(mockFilesGet).toHaveBeenCalledWith({ fileId: 'appDataFolder', fields: 'id' });
    expect(body).toEqual({
      files: [
        { id: 'd1', name: 'Root Deck', mimeType: DECK_MIME_TYPE, parents: ['appDataFolder'] },
        { id: 'd2', name: 'Nested Deck', mimeType: DECK_MIME_TYPE, parents: ['folder-1'] },
      ],
    });
  });

  it('does not resolve the App Data folder id when includeFolders is not given', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'd1', name: 'My Deck' }] } });

    await GET(new Request('http://localhost/api/drive', { method: 'GET' }));

    expect(mockFilesGet).not.toHaveBeenCalled();
  });
});

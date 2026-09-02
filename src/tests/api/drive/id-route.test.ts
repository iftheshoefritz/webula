/**
 * @jest-environment node
 */

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
        update: (...args: unknown[]) => mockFilesUpdate(...args),
      },
    })),
  },
}));

import { PUT } from '../../../app/api/drive/[id]/route';

function validToken() {
  return { accessToken: 'tok', accessTokenExpires: Date.now() + 100000, refreshToken: 'r' };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/drive/some-id', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

describe('PUT /api/drive/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
    mockFilesUpdate.mockResolvedValue({ data: { id: 'some-id' } });
  });

  it('renames a file without touching its content when no content is given', async () => {
    await PUT(makeRequest({ fileName: 'Renamed Report' }), { params: Promise.resolve({ id: 'some-id' }) });

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'some-id', requestBody: { name: 'Renamed Report' } })
    );
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('media');
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('addParents');
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('removeParents');
  });

  it('updates content and name together when content is given', async () => {
    await PUT(
      makeRequest({ fileName: 'My Deck', content: '1\tPicard' }),
      { params: Promise.resolve({ id: 'some-id' }) }
    );

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'some-id',
        requestBody: { name: 'My Deck' },
        media: { mimeType: 'application/json', body: JSON.stringify('1\tPicard') },
      })
    );
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('addParents');
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('removeParents');
  });

  it('moves a file into a folder using addParents/removeParents, without touching name/content', async () => {
    mockFilesUpdate.mockResolvedValue({ data: { id: 'some-id', parents: ['folder-2'] } });

    await PUT(
      makeRequest({ targetParentId: 'folder-2', currentParentId: 'appDataFolder' }),
      { params: Promise.resolve({ id: 'some-id' }) }
    );

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'some-id', addParents: 'folder-2', removeParents: 'appDataFolder' })
    );
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('requestBody');
    expect(mockFilesUpdate.mock.calls[0][0]).not.toHaveProperty('media');
  });

  it('moves a file back to root using appDataFolder as the target', async () => {
    mockFilesUpdate.mockResolvedValue({ data: { id: 'some-id', parents: ['appDataFolder'] } });

    await PUT(
      makeRequest({ targetParentId: 'appDataFolder', currentParentId: 'folder-1' }),
      { params: Promise.resolve({ id: 'some-id' }) }
    );

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'some-id', addParents: 'appDataFolder', removeParents: 'folder-1' })
    );
  });
});

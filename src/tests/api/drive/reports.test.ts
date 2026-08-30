/**
 * @jest-environment node
 */

const mockFilesList = jest.fn();
const mockFilesCreate = jest.fn();
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
      },
    })),
  },
}));

import { GET, POST } from '../../../app/api/drive/reports/route';
import { REPORT_MIME_TYPE } from '../../../app/api/drive/mimeTypes';

function validToken() {
  return { accessToken: 'tok', accessTokenExpires: Date.now() + 100000, refreshToken: 'r' };
}

function makeGetRequest() {
  return new Request('http://localhost/api/drive/reports', { method: 'GET' });
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/drive/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('GET /api/drive/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetToken.mockRejectedValue(new Error('no session'));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('lists only files with the Report mimeType', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [{ id: 'r1', name: 'My Report' }] } });

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ files: [{ id: 'r1', name: 'My Report' }] });
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: `mimeType='${REPORT_MIME_TYPE}'` })
    );
  });
});

describe('POST /api/drive/reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(validToken());
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetToken.mockRejectedValue(new Error('no session'));
    const res = await POST(makePostRequest({ name: 'My Report', decks: [] }));
    expect(res.status).toBe(401);
  });

  it('creates a file tagged with the Report mimeType and the given deck refs as content', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'new-report-id' } });

    const decks = [{ id: 'd1', name: 'Deck One' }, { id: 'd2', name: 'Deck Two' }];
    const res = await POST(makePostRequest({ name: 'My Report', decks }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 'new-report-id' });
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: 'My Report', mimeType: REPORT_MIME_TYPE }),
        media: expect.objectContaining({
          mimeType: REPORT_MIME_TYPE,
          body: JSON.stringify({ decks }),
        }),
      })
    );
  });
});

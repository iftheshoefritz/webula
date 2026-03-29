/**
 * @jest-environment node
 */

import { POST } from '../../app/api/gist/route';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('POST /api/gist', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, GITHUB_TOKEN: 'test-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 500 when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const req = new Request('http://localhost/api/gist', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/token not configured/i);
  });

  it('calls GitHub API with Authorization header and returns the gist id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'abc123' }),
    });

    const req = new Request('http://localhost/api/gist', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('abc123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/gists',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('returns error status when GitHub API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const req = new Request('http://localhost/api/gist', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Gist creation failed');
  });
});

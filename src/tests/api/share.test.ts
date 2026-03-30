/**
 * @jest-environment node
 */

import { POST } from '../../app/api/share/route';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('POST /api/share', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls dpaste.com API and returns the paste id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link: 'https://dpaste.com/ABC123' }),
    });

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('ABC123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://dpaste.com/api/v2/',
      expect.objectContaining({ method: 'POST' })
    );
    // No Authorization header — no token required
    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Record<string, string>)?.Authorization).toBeUndefined();
  });

  it('returns error status when dpaste API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Paste creation failed');
  });

  it('returns 500 on unexpected errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

/**
 * @jest-environment node
 */

import { GET, POST } from '../../app/api/share/route';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GET /api/share', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches paste content from dpaste and returns it as plain text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'Deck:\n1\tPicard\n',
    });

    const req = new Request('http://localhost/api/share?id=ABC123');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('Deck:\n1\tPicard\n');
    expect(mockFetch).toHaveBeenCalledWith('https://dpaste.com/ABC123.txt');
  });

  it('returns 400 when id param is missing', async () => {
    const req = new Request('http://localhost/api/share');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('propagates non-ok status from dpaste', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const req = new Request('http://localhost/api/share?id=NOTEXIST');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = new Request('http://localhost/api/share?id=ABC123');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/share', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls dpaste.com API and returns the paste id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'https://dpaste.com/ABC123\n',
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

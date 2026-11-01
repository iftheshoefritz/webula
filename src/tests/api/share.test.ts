/**
 * @jest-environment node
 */

import { GET, POST, OPTIONS } from '../../app/api/share/route';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GET /api/share', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches paste content and title from dpaste and returns them as JSON', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === 'https://dpaste.com/ABC123.txt') {
        return { ok: true, text: async () => 'Deck:\n1\tPicard\n' };
      }
      if (url === 'https://dpaste.com/api/item_detail/ABC123') {
        return { ok: true, json: async () => ({ ABC123: { title: 'My Deck' } }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const req = new Request('http://localhost/api/share?id=ABC123');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ content: 'Deck:\n1\tPicard\n', title: 'My Deck' });
    expect(mockFetch).toHaveBeenCalledWith('https://dpaste.com/ABC123.txt');
    expect(mockFetch).toHaveBeenCalledWith('https://dpaste.com/api/item_detail/ABC123');
  });

  it('returns a null title if the item_detail lookup fails', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === 'https://dpaste.com/ABC123.txt') {
        return { ok: true, text: async () => 'Deck:\n1\tPicard\n' };
      }
      if (url === 'https://dpaste.com/api/item_detail/ABC123') {
        return { ok: false, status: 500 };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const req = new Request('http://localhost/api/share?id=ABC123');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ content: 'Deck:\n1\tPicard\n', title: null });
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

  it('answers 502 upstream_unreachable when the dpaste fetch throws (#1441)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = new Request('http://localhost/api/share?id=ABC123');
    const res = await GET(req);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('upstream_unreachable');
  });

  it('answers not_found when dpaste has no paste for the id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await GET(new Request('http://localhost/api/share?id=NOTEXIST'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Paste not found', code: 'not_found' });
  });

  it.each([429, 503])('answers upstream_busy with the status when dpaste answers %i', async (status) => {
    mockFetch.mockResolvedValueOnce({ ok: false, status });

    const res = await GET(new Request('http://localhost/api/share?id=ABC123'));
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe('upstream_busy');
  });

  it('answers bad_request when the id is missing', async () => {
    const res = await GET(new Request('http://localhost/api/share'));
    expect((await res.json()).code).toBe('bad_request');
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

  it('answers 502 upstream_unreachable, with the CORS header, when the dpaste fetch throws (#1441)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('upstream_unreachable');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
  });

  it.each([429, 503])('answers upstream_busy with the status when dpaste answers %i', async (status) => {
    mockFetch.mockResolvedValueOnce({ ok: false, status, text: async () => 'busy' });

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'Paste creation failed', code: 'upstream_busy' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
  });

  it('answers upstream_error for any other dpaste status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 413, text: async () => 'too large' });

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('upstream_error');
  });

  it('answers 400 bad_request, with the CORS header, for a body that is not JSON', async () => {
    const req = new Request('http://localhost/api/share', { method: 'POST', body: 'not json' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('answers 400 bad_request for a body with no content', async () => {
    const req = new Request('http://localhost/api/share', { method: 'POST', body: JSON.stringify({ title: 'x' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });

  it('sets Access-Control-Allow-Origin for trekcc.org on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'https://dpaste.com/ABC123\n',
    });

    const req = new Request('http://localhost/api/share', {
      method: 'POST',
      body: JSON.stringify({ content: 'Deck:\n1\tPicard', title: 'My Deck' }),
    });
    const res = await POST(req);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
  });
});

describe('OPTIONS /api/share', () => {
  it('responds to a CORS preflight request for trekcc.org', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

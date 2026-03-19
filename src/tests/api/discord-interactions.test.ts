/**
 * @jest-environment node
 */

jest.mock('../../lib/loadCards', () => ({
  loadCards: jest.fn(),
}));

jest.mock('../../lib/filterCards', () => ({
  filterCards: jest.fn(),
}));

// Mock crypto.subtle.verify to bypass Ed25519 signature check in tests
const mockVerify = jest.fn().mockResolvedValue(true);
const mockImportKey = jest.fn().mockResolvedValue({});
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      verify: mockVerify,
      importKey: mockImportKey,
    },
  },
  writable: true,
});

import { POST } from '../../app/api/discord/interactions/route';
import { loadCards } from '../../lib/loadCards';
import { filterCards } from '../../lib/filterCards';
import { NextRequest } from 'next/server';

const DISCORD_PUBLIC_KEY = 'aabbccdd';

function makeInteractionRequest(body: object): NextRequest {
  const bodyStr = JSON.stringify(body);
  return new NextRequest('http://localhost/api/discord/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': 'aabb',
      'x-signature-timestamp': '1234567890',
    },
    body: bodyStr,
  });
}

const makeCard = (name: string, imagefile = 'img1') => ({
  originalName: name,
  collectorsinfo: '1R001',
  imagefile,
  name: name.toLowerCase(),
  type: 'personnel',
});

describe('POST /api/discord/interactions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, DISCORD_PUBLIC_KEY };
    (loadCards as jest.Mock).mockReturnValue({ data: [], columns: [] });
    (filterCards as jest.Mock).mockReturnValue([]);
    mockVerify.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 500 when DISCORD_PUBLIC_KEY is not set', async () => {
    delete process.env.DISCORD_PUBLIC_KEY;
    const req = makeInteractionRequest({ type: 1 });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns 401 when signature verification fails', async () => {
    mockVerify.mockResolvedValue(false);
    const req = makeInteractionRequest({ type: 1 });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('responds to PING with PONG', async () => {
    const req = makeInteractionRequest({ type: 1 });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ type: 1 });
  });

  it('returns no cards message when no results found', async () => {
    (filterCards as jest.Mock).mockReturnValue([]);
    const req = makeInteractionRequest({
      type: 2,
      data: { name: 'card2e', options: [{ name: 'query', value: 'name:nobody' }] },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.type).toBe(4);
    expect(body.data.content).toContain("No cards found for 'name:nobody'");
  });

  it('returns embed with image for a single card match', async () => {
    (filterCards as jest.Mock).mockReturnValue([makeCard('Jean-Luc Picard', 'picard')]);
    const req = makeInteractionRequest({
      type: 2,
      data: { name: 'card2e', options: [{ name: 'query', value: 'name:picard' }] },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.type).toBe(4);
    const embed = body.data.embeds[0];
    expect(embed.title).toBe('Jean-Luc Picard');
    expect(embed.thumbnail.url).toContain('picard.jpg');
    expect(embed.url).toContain('name%3Apicard');
  });

  it('omits thumbnail when single card has no imagefile', async () => {
    (filterCards as jest.Mock).mockReturnValue([makeCard('No Image Card', '')]);
    const req = makeInteractionRequest({
      type: 2,
      data: { name: 'card2e', options: [{ name: 'query', value: 'name:noimage' }] },
    });
    const res = await POST(req);
    const body = await res.json();
    const embed = body.data.embeds[0];
    expect(embed.thumbnail).toBeUndefined();
  });

  it('returns summary embed for multiple card matches', async () => {
    const cards = [makeCard('Card A'), makeCard('Card B'), makeCard('Card C')];
    (filterCards as jest.Mock).mockReturnValue(cards);
    const req = makeInteractionRequest({
      type: 2,
      data: { name: 'card2e', options: [{ name: 'query', value: 'type:personnel' }] },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.type).toBe(4);
    const embed = body.data.embeds[0];
    expect(embed.title).toBe("3 cards match 'type:personnel'");
    expect(embed.thumbnail).toBeUndefined();
    expect(embed.url).toContain('type%3Apersonnel');
  });

  it('returns 400 for unknown commands', async () => {
    const req = makeInteractionRequest({
      type: 2,
      data: { name: 'unknown', options: [] },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

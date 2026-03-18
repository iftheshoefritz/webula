/**
 * @jest-environment node
 */

jest.mock('../../lib/loadCards', () => ({
  loadCards: jest.fn(),
}));

jest.mock('../../lib/filterCards', () => ({
  filterCards: jest.fn(),
}));

import { GET } from '../../app/api/cards/route';
import { loadCards } from '../../lib/loadCards';
import { filterCards } from '../../lib/filterCards';
import { NextRequest } from 'next/server';

const makeCard = (name: string, imagefile = 'img1') => ({
  originalName: name,
  collectorsinfo: '1R001',
  imagefile,
  name: name.toLowerCase(),
  type: 'personnel',
});

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/cards');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe('GET /api/cards', () => {
  beforeEach(() => {
    (loadCards as jest.Mock).mockReturnValue({ data: [], columns: [] });
    (filterCards as jest.Mock).mockReturnValue([]);
  });

  it('returns empty results when no cards match', async () => {
    (filterCards as jest.Mock).mockReturnValue([]);
    const res = await GET(makeRequest({ q: 'name:nobody' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.cards).toEqual([]);
    expect(body.q).toBe('name:nobody');
  });

  it('returns matched cards with name, collectorsinfo, and imageUrl', async () => {
    const card = makeCard('Jean-Luc Picard', 'picard');
    (filterCards as jest.Mock).mockReturnValue([card]);

    const res = await GET(makeRequest({ q: 'name:picard' }));
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.cards[0]).toMatchObject({
      name: 'Jean-Luc Picard',
      collectorsinfo: '1R001',
      imageUrl: expect.stringContaining('picard.jpg'),
    });
  });

  it('returns null imageUrl when imagefile is empty', async () => {
    const card = makeCard('No Image', '');
    (filterCards as jest.Mock).mockReturnValue([card]);

    const res = await GET(makeRequest({ q: 'name:noimage' }));
    const body = await res.json();

    expect(body.cards[0].imageUrl).toBeNull();
  });

  it('respects the limit parameter', async () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard(`Card ${i}`));
    (filterCards as jest.Mock).mockReturnValue(cards);

    const res = await GET(makeRequest({ q: 'type:personnel', limit: '5' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(5);
    expect(body.total).toBe(20);
  });

  it('caps limit at MAX_LIMIT (50)', async () => {
    const cards = Array.from({ length: 100 }, (_, i) => makeCard(`Card ${i}`));
    (filterCards as jest.Mock).mockReturnValue(cards);

    const res = await GET(makeRequest({ q: 'type:personnel', limit: '200' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(50);
  });

  it('defaults to limit 10 when no limit is specified', async () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard(`Card ${i}`));
    (filterCards as jest.Mock).mockReturnValue(cards);

    const res = await GET(makeRequest({ q: 'type:personnel' }));
    const body = await res.json();

    expect(body.cards).toHaveLength(10);
  });

  it('includes Cache-Control header', async () => {
    const res = await GET(makeRequest());
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});

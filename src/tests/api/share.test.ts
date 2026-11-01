/**
 * @jest-environment node
 */

import { GET, POST, OPTIONS } from '../../app/api/share/route';
import {
  getShareStore,
  MAX_CONTENT_BYTES,
  newShareId,
  redisShareStore,
  SHARE_TTL_SECONDS,
  type Share,
  type ShareStore,
} from '../../lib/shareStore';

jest.mock('../../lib/shareStore', () => ({
  ...jest.requireActual('../../lib/shareStore'),
  getShareStore: jest.fn(),
}));

// An in-memory store with the behaviour of the Redis one: NX writes, reads by id.
function memoryStore(): ShareStore & { shares: Map<string, Share>; ttls: Map<string, number> } {
  const shares = new Map<string, Share>();
  const ttls = new Map<string, number>();
  return {
    shares,
    ttls,
    async create(id, share, ttlSeconds) {
      if (shares.has(id)) return false;
      shares.set(id, share);
      ttls.set(id, ttlSeconds);
      return true;
    },
    async read(id) {
      return shares.get(id) ?? null;
    },
  };
}

const failingStore: ShareStore = {
  create: async () => {
    throw new Error('connect ECONNREFUSED');
  },
  read: async () => {
    throw new Error('connect ECONNREFUSED');
  },
};

const mockGetShareStore = getShareStore as jest.MockedFunction<typeof getShareStore>;
let store: ReturnType<typeof memoryStore>;

function postShare(body: unknown) {
  return POST(
    new Request('http://localhost/api/share', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  store = memoryStore();
  mockGetShareStore.mockReturnValue(store);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST then GET /api/share', () => {
  it('writes a share and reads back its content and title', async () => {
    const res = await postShare({ content: 'Deck:\n1\tPicard\n', title: 'My Deck' });
    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(id).toMatch(/^[A-Za-z0-9]{10}$/);

    const read = await GET(new Request(`http://localhost/api/share?id=${id}`));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ content: 'Deck:\n1\tPicard\n', title: 'My Deck' });
  });

  it('stores the share with a 30-day TTL and a createdAt', async () => {
    const { id } = await (await postShare({ content: 'Deck', title: 'T' })).json();
    expect(store.ttls.get(id)).toBe(SHARE_TTL_SECONDS);
    expect(SHARE_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(Date.parse(store.shares.get(id)!.createdAt)).not.toBeNaN();
  });

  it('gives a share with no title the title "Webula deck"', async () => {
    const { id } = await (await postShare({ content: 'Deck' })).json();
    expect(store.shares.get(id)!.title).toBe('Webula deck');
  });

  it('makes a new id each time', async () => {
    const a = (await (await postShare({ content: 'A' })).json()).id;
    const b = (await (await postShare({ content: 'B' })).json()).id;
    expect(a).not.toBe(b);
  });

  it('never overwrites a share: a taken id gets a new one', async () => {
    const create = jest.spyOn(store, 'create').mockResolvedValueOnce(false);
    const res = await postShare({ content: 'Deck' });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/share', () => {
  it('answers 404 not_found for an unknown id', async () => {
    const res = await GET(new Request('http://localhost/api/share?id=NOTEXIST'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Share not found', code: 'not_found' });
  });

  it('answers 404 not_found for an id the store could never hold, without reading it', async () => {
    const read = jest.spyOn(store, 'read');
    const res = await GET(new Request('http://localhost/api/share?id=a%2Fb'));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('not_found');
    expect(read).not.toHaveBeenCalled();
  });

  it('answers 400 bad_request when the id is missing', async () => {
    const res = await GET(new Request('http://localhost/api/share'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });

  it('answers 502 upstream_unreachable when the store fails', async () => {
    mockGetShareStore.mockReturnValue(failingStore);
    const res = await GET(new Request('http://localhost/api/share?id=ABC123'));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('upstream_unreachable');
  });

  it('answers 502 upstream_unreachable when the store cannot be made (no env vars)', async () => {
    mockGetShareStore.mockImplementation(() => {
      throw new Error('Unable to find environment variable: `UPSTASH_REDIS_REST_URL`');
    });
    const res = await GET(new Request('http://localhost/api/share?id=ABC123'));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('upstream_unreachable');
  });
});

describe('POST /api/share', () => {
  it('answers 502 upstream_unreachable, with the CORS header, when the store fails', async () => {
    mockGetShareStore.mockReturnValue(failingStore);
    const res = await postShare({ content: 'Deck', title: 'My Deck' });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('upstream_unreachable');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
  });

  it('answers 413 bad_request, with the CORS header, for content over the cap', async () => {
    const res = await postShare({ content: 'x'.repeat(MAX_CONTENT_BYTES + 1) });
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('bad_request');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
    expect(store.shares.size).toBe(0);
  });

  it('counts the cap in bytes, not characters', async () => {
    // 'é' is 2 bytes in UTF-8.
    const res = await postShare({ content: 'é'.repeat(MAX_CONTENT_BYTES / 2 + 1) });
    expect(res.status).toBe(413);
  });

  it('takes content right at the cap', async () => {
    const res = await postShare({ content: 'x'.repeat(MAX_CONTENT_BYTES) });
    expect(res.status).toBe(200);
  });

  it('answers 400 bad_request, with the CORS header, for a body that is not JSON', async () => {
    const res = await postShare('not json');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://www.trekcc.org');
  });

  it('answers 400 bad_request for a body with no content', async () => {
    const res = await postShare({ title: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('bad_request');
  });

  it('sets Access-Control-Allow-Origin for trekcc.org on success', async () => {
    const res = await postShare({ content: 'Deck', title: 'My Deck' });
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

describe('newShareId', () => {
  it('makes 10 URL-safe characters', () => {
    for (let i = 0; i < 50; i++) expect(newShareId()).toMatch(/^[A-Za-z0-9]{10}$/);
  });
});

describe('redisShareStore', () => {
  it('writes under share:<id> with NX and the TTL, and reads the key back', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const get = jest.fn().mockResolvedValue({ content: 'Deck', title: 'T', createdAt: 'now' });
    const redis = { set, get } as unknown as Parameters<typeof redisShareStore>[0];
    const share = { content: 'Deck', title: 'T', createdAt: 'now' };

    const s = redisShareStore(redis);
    expect(await s.create('abc', share, 60)).toBe(true);
    expect(set).toHaveBeenCalledWith('share:abc', share, { nx: true, ex: 60 });
    expect(await s.read('abc')).toEqual(share);
    expect(get).toHaveBeenCalledWith('share:abc');
  });

  it('answers false when the key is taken, and null for a missing key', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue(null),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as Parameters<typeof redisShareStore>[0];
    const s = redisShareStore(redis);
    expect(await s.create('abc', { content: 'x', title: null, createdAt: 'now' }, 60)).toBe(false);
    expect(await s.read('abc')).toBeNull();
  });
});

/**
 * @jest-environment node
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

import { GET } from '../../app/api/stats/route';

const request = () => new Request('http://localhost/api/stats');

describe('/api/stats (#1417)', () => {
  const original = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    mockGetToken.mockReset();
  });
  afterAll(() => { process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = original; });

  it('gives an early-access caller the aggregated stats of the real stats/ folder', async () => {
    mockGetToken.mockResolvedValue({ email: 'Early@example.com' });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      ['ciJobs', 'latestRunAt', 'latestSnapshot', 'slowestIssues', 'statuses', 'weekly', 'workflows'],
    );
    expect(body.workflows.length).toBeGreaterThan(0);
    expect(body.ciJobs.map((j: { job: string }) => j.job)).toEqual(['test', 'typecheck', 'lint', 'build']);
  });

  it('answers 404 to another caller and to a signed-out caller', async () => {
    mockGetToken.mockResolvedValue({ email: 'other@example.com' });
    expect((await GET(request())).status).toBe(404);
    mockGetToken.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
    mockGetToken.mockRejectedValue(new Error('bad token'));
    expect((await GET(request())).status).toBe(404);
  });

  it('keeps no stats file under public/', () => {
    expect(existsSync(join(process.cwd(), 'public', 'stats'))).toBe(false);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? (entry.name === 'cardimages' ? [] : walk(join(dir, entry.name))) : [entry.name]);
    expect(walk(join(process.cwd(), 'public')).filter((name) => name.endsWith('.jsonl'))).toEqual([]);
  });
});

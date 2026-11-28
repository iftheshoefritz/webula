/**
 * @jest-environment node
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

import { GET } from '../../app/api/stats/route';

describe('/api/stats (#1417)', () => {
  it('gives every caller the aggregated stats of the real stats/ folder (#1990)', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      ['ciJobs', 'latestRunAt', 'latestSnapshot', 'slowestIssues', 'statuses', 'weekly', 'workflows'],
    );
    expect(body.workflows.length).toBeGreaterThan(0);
    expect(body.ciJobs.map((j: { job: string }) => j.job)).toEqual(['test', 'typecheck', 'lint', 'build']);
  });

  it('answers a signed-out caller and a caller who is not early-access with the stats (#1990)', async () => {
    const original = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    try {
      for (const token of [null, { email: 'other@example.com' }]) {
        mockGetToken.mockResolvedValue(token);
        const response = await GET();
        expect(response.status).toBe(200);
        expect((await response.json()).workflows.length).toBeGreaterThan(0);
      }
      expect(mockGetToken).not.toHaveBeenCalled();
    } finally {
      process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = original;
    }
  });

  it('keeps no stats file under public/', () => {
    expect(existsSync(join(process.cwd(), 'public', 'stats'))).toBe(false);
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? (entry.name === 'cardimages' ? [] : walk(join(dir, entry.name))) : [entry.name]);
    expect(walk(join(process.cwd(), 'public')).filter((name) => name.endsWith('.jsonl'))).toEqual([]);
  });
});

import {
  ciJobStats, formatDuration, isoWeek, latestSnapshot, parseJsonLines, percentile, slowestIssues,
  statusSeries, summarizeStats, weeklySeries, workflowStats,
} from '../../lib/stats';
import type { IssueSnapshot, ItemRecord, RunRecord } from '../../lib/stats';

const REPO = 'o/r';
const at = (minutes: number) => new Date(Date.parse('2026-10-26T00:00:00Z') + minutes * 60000).toISOString();

function run(workflow: string, start: number, minutes: number, conclusion = 'success', extra: Partial<RunRecord> = {}): RunRecord {
  return {
    repository: REPO, workflow, conclusion, created_at: at(start), started_at: at(start),
    completed_at: at(start + minutes), jobs: [], ...extra,
  };
}

describe('stats aggregation (#1417)', () => {
  it('parses JSON Lines and skips blank and broken lines', () => {
    expect(parseJsonLines('{"a":1}\n\nnot json\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('takes nearest-rank percentiles, and null for no value', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 90)).toBe(9);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });

  it('counts the runs, the durations and the failure share per workflow', () => {
    const runs = [
      run('A', 0, 1), run('A', 10, 2), run('A', 20, 3, 'failure'), run('A', 30, 10, 'cancelled'),
      run('B', 0, 5, 'success', { claude: { num_turns: 10, total_cost_usd_estimate: 1 } }),
      run('B', 0, 7, 'timed_out', { claude: { num_turns: 20, total_cost_usd_estimate: 3 } }),
    ];
    const [a, b] = workflowStats(runs);
    expect(a).toMatchObject({
      workflow: 'A', runs: 4, medianSeconds: 120, p90Seconds: 600, notSuccess: 2, failure: 1, cancelled: 1, other: 0,
      claudeRuns: 0, medianTurns: null, totalCostUsd: null,
    });
    expect(b).toMatchObject({ workflow: 'B', runs: 2, notSuccess: 1, other: 1, claudeRuns: 2, medianTurns: 10, totalCostUsd: 4, medianCostUsd: 1 });
  });

  it('falls back to created_at when a run has no started_at', () => {
    const [w] = workflowStats([{ ...run('A', 0, 4), started_at: null }]);
    expect(w.medianSeconds).toBe(240);
  });

  it('gives the median and the 90th percentile of each CI job, skipping a job without both times', () => {
    const job = (name: string, minutes: number | null) => ({
      name, conclusion: 'success', started_at: at(0), completed_at: minutes === null ? null : at(minutes),
    });
    const runs = [
      run('CI', 0, 5, 'success', { jobs: [job('test', 2), job('build', 4)] }),
      run('CI', 0, 5, 'success', { jobs: [job('test', 3), job('build', null)] }),
      run('Other', 0, 5, 'success', { jobs: [job('test', 100)] }),
    ];
    const stats = ciJobStats(runs);
    expect(stats.map((s) => s.job)).toEqual(['test', 'typecheck', 'lint', 'build']);
    expect(stats[0]).toEqual({ job: 'test', runs: 2, medianSeconds: 120, p90Seconds: 180 });
    expect(stats[1]).toEqual({ job: 'typecheck', runs: 0, medianSeconds: null, p90Seconds: null });
    expect(stats[3]).toMatchObject({ runs: 1, medianSeconds: 240 });
  });

  it('groups the runs by ISO week', () => {
    expect(isoWeek('2026-10-26T00:00:00Z')).toBe('2026-W44');
    expect(isoWeek('2026-10-25T23:59:00Z')).toBe('2026-W43');
    expect(isoWeek('2021-01-03T12:00:00Z')).toBe('2020-W53');
    const runs = [run('A', 0, 2), run('A', 60, 4), run('A', -60 * 24, 10), run('B', 0, 1)];
    const weekly = weeklySeries(runs);
    expect(weekly.weeks).toEqual(['2026-W43', '2026-W44']);
    expect(weekly.series).toEqual([
      { workflow: 'A', medianSeconds: [600, 120] },
      { workflow: 'B', medianSeconds: [null, 60] },
    ]);
  });

  it('fills a status a snapshot lacks with 0, and takes the latest snapshot', () => {
    const snapshots: IssueSnapshot[] = [
      { repository: REPO, date: '2026-10-31', counts: { completed: 5 }, open_prs: { draft: 1, ready: 2 } },
      { repository: REPO, date: '2026-10-30', counts: { completed: 4, 'ready-for-dev': 2 } },
    ];
    expect(statusSeries(snapshots)).toEqual({
      dates: ['2026-10-30', '2026-10-31'],
      series: [{ status: 'completed', counts: [4, 5] }, { status: 'ready-for-dev', counts: [2, 0] }],
    });
    expect(latestSnapshot(snapshots)).toEqual({ date: '2026-10-31', counts: { completed: 5 }, openPrs: { draft: 1, ready: 2 } });
    expect(latestSnapshot([])).toBeNull();
  });

  it('lists the completed issues slowest from the first label to the close, linked to GitHub', () => {
    const issue = (number: number, labelled: number | null, closed: number, state_reason = 'completed'): ItemRecord => ({
      repository: REPO, kind: 'issue', number, opened_at: at(0), closed_at: at(closed), state_reason,
      first_label_at: labelled === null ? null : at(labelled), first_linked_pr_at: null,
    });
    const items: ItemRecord[] = [
      issue(1, 0, 10), issue(2, 0, 100), issue(3, null, 1000), issue(4, 0, 2000, 'not_planned'), issue(5, 5, 50),
      { repository: REPO, kind: 'pr', number: 6, opened_at: at(0), closed_at: at(5000), state_reason: null, first_label_at: at(0) },
    ];
    const slow = slowestIssues(items);
    expect(slow.map((s) => s.number)).toEqual([2, 5, 1]);
    expect(slow[0]).toMatchObject({ url: 'https://github.com/o/r/issues/2', seconds: 6000 });
    expect(slowestIssues(items, 1)).toHaveLength(1);
  });

  it('summarizes every part and the latest run time', () => {
    const summary = summarizeStats({ runs: [run('A', 0, 1), run('A', 90, 1)], issues: [], items: [] });
    expect(summary.latestRunAt).toBe(at(90));
    expect(summary.workflows).toHaveLength(1);
    expect(summary.latestSnapshot).toBeNull();
    expect(summary.slowestIssues).toEqual([]);
  });

  it('formats a duration', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(90000 + 120)).toBe('1d 01:02');
  });
});

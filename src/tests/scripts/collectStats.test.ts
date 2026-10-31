import fs from 'fs';
import path from 'path';

import { countIssues, openIssueStatus } from '../../../scripts/stats/issueStatus.mjs';
import { groupByMonth, mergeLines, monthOf, parseLines } from '../../../scripts/stats/records.mjs';
import { claudeFromLog, findResultRecord, targetFromLog } from '../../../scripts/stats/resultRecord.mjs';

const fixtures = path.join(__dirname, 'fixtures');
const log = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');

describe('the result record parser', () => {
  const expected = {
    subtype: 'success',
    is_error: false,
    num_turns: 14,
    duration_ms: 159477,
    duration_api_ms: 150020,
    total_cost_usd_estimate: 0.6852023999999999,
    models: {
      'claude-haiku-4-5-20251001': { input_tokens: 2480, output_tokens: 15 },
      'claude-opus-5-5': { input_tokens: 28, output_tokens: 7222 },
    },
  };

  it('reads a record whose is_error follows "type": "result"', () => {
    expect(claudeFromLog(log('result-type-first.log'))).toEqual(expected);
  });

  it('reads a record whose is_error comes before "type": "result"', () => {
    expect(claudeFromLog(log('result-is-error-first.log'))).toEqual(expected);
  });

  it('keeps the whole multi-line result, past a line that is "}" alone', () => {
    const record = findResultRecord(log('result-type-first.log'));
    expect(record.result).toBe(
      'All five checks pass.\n\n{\n  "type": "result" is quoted here\n}\nI wrote the Visual Verification section.',
    );
  });

  it('gives no claude field for a log with no result record', () => {
    expect(claudeFromLog(log('result-none.log'))).toBeUndefined();
  });

  it('finds the target as the classifier does', () => {
    expect(targetFromLog(log('result-type-first.log'))).toBe(1425);
    expect(targetFromLog(log('result-none.log'))).toBe(1429);
    expect(targetFromLog('no number here')).toBeNull();
  });
});

describe('the issue status counts', () => {
  it('counts an open issue under the status label added last', () => {
    const issue = {
      labels: ['bug', 'needs-plan', 'agent-error:max-turns', 'ready-for-dev'],
      labelEvents: [
        { label: 'ready-for-dev', createdAt: '2026-10-01T10:00:00Z' },
        { label: 'agent-error:max-turns', createdAt: '2026-10-03T10:00:00Z' },
        { label: 'needs-plan', createdAt: '2026-10-02T10:00:00Z' },
        { label: 'bug', createdAt: '2026-10-04T10:00:00Z' },
      ],
      hasOpenPr: true,
    };
    expect(openIssueStatus(issue)).toBe('agent-error:max-turns');
  });

  it('counts a status label that was added again by its newest event', () => {
    const issue = {
      labels: ['needs-plan', 'blocked'],
      labelEvents: [
        { label: 'needs-plan', createdAt: '2026-10-01T10:00:00Z' },
        { label: 'blocked', createdAt: '2026-10-02T10:00:00Z' },
        { label: 'needs-plan', createdAt: '2026-10-05T10:00:00Z' },
      ],
      hasOpenPr: false,
    };
    expect(openIssueStatus(issue)).toBe('needs-plan');
  });

  it('counts an open issue with no status and a linked open PR as open-with-pr', () => {
    // needs-plan was added and then removed: the linked open PR wins.
    const issue = {
      labels: ['bug'],
      labelEvents: [{ label: 'needs-plan', createdAt: '2026-10-01T10:00:00Z' }],
      hasOpenPr: true,
    };
    expect(openIssueStatus(issue)).toBe('open-with-pr');
  });

  it('counts an open issue with no status and no PR as open-no-status', () => {
    expect(openIssueStatus({ labels: [], labelEvents: [], hasOpenPr: false })).toBe('open-no-status');
  });

  it('counts each issue once, and the closed issues by state_reason', () => {
    const open = [
      { labels: ['blocked'], labelEvents: [{ label: 'blocked', createdAt: '2026-10-01T10:00:00Z' }], hasOpenPr: false },
      { labels: [], labelEvents: [], hasOpenPr: true },
      { labels: [], labelEvents: [], hasOpenPr: false },
      { labels: [], labelEvents: [], hasOpenPr: false },
    ];
    const closed = [
      { stateReason: 'COMPLETED' },
      { stateReason: 'COMPLETED' },
      { stateReason: 'NOT_PLANNED' },
      { stateReason: 'DUPLICATE' },
    ];
    const counts = countIssues(open, closed);
    expect(counts).toEqual({
      blocked: 1,
      completed: 2,
      duplicate: 1,
      not_planned: 1,
      'open-no-status': 2,
      'open-with-pr': 1,
    });
    expect(Object.keys(counts)).toEqual(Object.keys(counts).sort());
  });
});

describe('the month files', () => {
  const run = (id: number, attempt: number, createdAt: string, conclusion = 'success') => ({
    repository: 'iftheshoefritz/webula',
    workflow: 'CI',
    run_id: id,
    run_attempt: attempt,
    created_at: createdAt,
    conclusion,
  });

  it('is idempotent and dedupes by key', () => {
    const records = [run(2, 1, '2026-10-30T10:00:00Z'), run(1, 1, '2026-10-30T09:00:00Z')];
    const once = mergeLines('runs', '', records);
    const twice = mergeLines('runs', once, records);
    expect(twice).toBe(once);
    expect(parseLines(once).map((r) => r.run_id)).toEqual([1, 2]);
    expect(once).toBe(once.split('\n').filter(Boolean).map((line) => line + '\n').join(''));
    expect(once).not.toContain('  ');

    const rerun = run(2, 2, '2026-10-30T10:00:00Z');
    const updated = mergeLines('runs', once, [run(1, 1, '2026-10-30T09:00:00Z', 'failure'), rerun]);
    expect(parseLines(updated).map((r) => [r.run_id, r.run_attempt, r.conclusion])).toEqual([
      [1, 1, 'failure'],
      [2, 1, 'success'],
      [2, 2, 'success'],
    ]);
  });

  it('dedupes snapshots by date and items by number and kind', () => {
    const snapshot = (counts: Record<string, number>) => ({ repository: 'r', date: '2026-10-31', counts });
    expect(parseLines(mergeLines('issues', mergeLines('issues', '', [snapshot({ a: 1 })]), [snapshot({ a: 2 })]))).toEqual([
      snapshot({ a: 2 }),
    ]);
    const item = (number: number, kind: string) => ({ repository: 'r', kind, number, closed_at: '2026-10-31T00:00:00Z' });
    const text = mergeLines('items', '', [item(5, 'issue'), item(5, 'pr'), item(5, 'issue')]);
    expect(parseLines(text)).toEqual([item(5, 'issue'), item(5, 'pr')]);
  });

  it('files a record in the month of its own time', () => {
    expect(monthOf('2026-10-31T23:59:59Z')).toBe('2026-10');
    const groups = groupByMonth('runs', [run(1, 1, '2026-10-31T23:59:59Z'), run(2, 1, '2026-11-01T00:00:00Z')]);
    expect(Object.keys(groups).sort()).toEqual(['2026-10', '2026-11']);
    expect(groups['2026-11'].map((r: { run_id: number }) => r.run_id)).toEqual([2]);
    const items = groupByMonth('items', [{ closed_at: '2026-09-30T12:00:00Z' }]);
    expect(Object.keys(items)).toEqual(['2026-09']);
    expect(Object.keys(groupByMonth('issues', [{ date: '2026-03-08' }]))).toEqual(['2026-03']);
  });
});

// The fixture of the stats page (#1417): `/stats?fixture=1` renders these aggregates without the
// route, so an agent that cannot sign in can check the layout. Development only: `statsFixtureAllowed`
// is false in production, and the page then ignores `fixture=1`.

import { summarizeStats } from './stats';
import type { RunRecord, StatsSummary } from './stats';

export function statsFixtureAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

const REPO = 'iftheshoefritz/webula';

function run(workflow: string, created: string, minutes: number, conclusion = 'success', claude?: RunRecord['claude']): RunRecord {
  const end = new Date(Date.parse(created) + minutes * 60000).toISOString();
  return {
    repository: REPO,
    workflow,
    conclusion,
    created_at: created,
    started_at: created,
    completed_at: end,
    jobs: workflow === 'CI'
      ? ['test', 'typecheck', 'lint', 'build'].map((name, i) => ({
          name,
          conclusion,
          started_at: created,
          completed_at: new Date(Date.parse(created) + (minutes - i * 0.5) * 60000).toISOString(),
        }))
      : [],
    claude,
  };
}

const runs: RunRecord[] = [];
const days = ['2026-10-12', '2026-10-15', '2026-10-20', '2026-10-23', '2026-10-27', '2026-10-30'];
days.forEach((day, i) => {
  runs.push(run('CI', `${day}T10:00:00Z`, 3 + i * 0.2));
  runs.push(run('CI', `${day}T14:00:00Z`, 4 + i * 0.1, i === 2 ? 'failure' : 'success'));
  runs.push(run('Claude Issue Implementation', `${day}T11:00:00Z`, 12 + i * 3, i === 4 ? 'failure' : 'success',
    { num_turns: 30 + i * 4, total_cost_usd_estimate: 2 + i * 0.3 }));
  runs.push(run('Claude Implementation Plan', `${day}T09:00:00Z`, 3 + i, 'success', { num_turns: 12 + i, total_cost_usd_estimate: 0.8 }));
  runs.push(run('Claude Visual Check', `${day}T12:00:00Z`, 8 + i, i === 1 ? 'cancelled' : 'success',
    { num_turns: 40 + i, total_cost_usd_estimate: 1.5 }));
});

export const STATS_FIXTURE: StatsSummary = summarizeStats({
  runs,
  issues: days.map((date, i) => ({
    repository: REPO,
    date,
    counts: { completed: 600 + i * 8, 'needs-human-input': 10 - i, 'open-no-status': 58 + i, 'ready-for-dev': 4 + (i % 2), not_planned: 25 },
    open_prs: { draft: 3, ready: 2 },
  })),
  items: Array.from({ length: 25 }, (_, i) => ({
    repository: REPO,
    kind: 'issue' as const,
    number: 1300 + i,
    opened_at: '2026-10-10T08:00:00Z',
    first_label_at: '2026-10-10T09:00:00Z',
    first_linked_pr_at: '2026-10-10T10:00:00Z',
    closed_at: new Date(Date.parse('2026-10-10T09:00:00Z') + (i + 1) * 3600000 * 1.7).toISOString(),
    state_reason: 'completed',
  })),
});

// The stats page (#1417): the aggregates of the records that `scripts/collect_stats.mjs` (#1431)
// writes under `stats/`. This module reads no file, so the API route, the page and the tests share it.
// `statsServer.ts` reads the files.

export interface RunJob {
  name: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RunRecord {
  repository: string;
  workflow: string;
  number?: number | null;
  conclusion: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at: string | null;
  jobs?: RunJob[];
  claude?: { num_turns?: number; total_cost_usd_estimate?: number } | null;
}

export interface IssueSnapshot {
  repository: string;
  date: string;
  counts: Record<string, number>;
  open_prs?: { draft: number; ready: number };
}

export interface ItemRecord {
  repository: string;
  kind: 'issue' | 'pr';
  number: number;
  opened_at: string;
  closed_at: string;
  state_reason: string | null;
  first_label_at?: string | null;
  first_linked_pr_at?: string | null;
}

export interface StatsRecords {
  runs: RunRecord[];
  issues: IssueSnapshot[];
  items: ItemRecord[];
}

export interface WorkflowStats {
  workflow: string;
  runs: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  /** Runs whose conclusion is not `success`. */
  notSuccess: number;
  failure: number;
  cancelled: number;
  /** Every other conclusion that is not `success`, such as `timed_out`. */
  other: number;
  claudeRuns: number;
  medianTurns: number | null;
  totalCostUsd: number | null;
  medianCostUsd: number | null;
}

export interface JobStats {
  job: string;
  runs: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
}

export interface WeeklySeries {
  /** ISO weeks, `YYYY-Www`, in order. */
  weeks: string[];
  /** The median run duration of each workflow in each week; null for a week with no run. */
  series: { workflow: string; medianSeconds: (number | null)[] }[];
}

export interface StatusSeries {
  dates: string[];
  series: { status: string; counts: number[] }[];
}

export interface LatestSnapshot {
  date: string;
  counts: Record<string, number>;
  openPrs: { draft: number; ready: number } | null;
}

export interface SlowIssue {
  repository: string;
  number: number;
  url: string;
  firstLabelAt: string;
  firstLinkedPrAt: string | null;
  closedAt: string;
  seconds: number;
}

export interface StatsSummary {
  latestRunAt: string | null;
  workflows: WorkflowStats[];
  ciJobs: JobStats[];
  weekly: WeeklySeries;
  latestSnapshot: LatestSnapshot | null;
  statuses: StatusSeries;
  slowestIssues: SlowIssue[];
}

/** The jobs of the `CI` workflow, in the order of `.github/workflows/ci.yml`. */
export const CI_JOBS = ['test', 'typecheck', 'lint', 'build'];
export const CI_WORKFLOW = 'CI';
export const SLOWEST_ISSUES = 20;

/** The records of a JSON Lines text; a blank or broken line is skipped. */
export function parseJsonLines<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // A broken line must not break the page.
    }
  }
  return out;
}

function secondsBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}

/** The duration of a run, from `started_at` (or `created_at`) to `completed_at`, in seconds. */
export function runSeconds(run: RunRecord): number | null {
  return secondsBetween(run.started_at || run.created_at, run.completed_at);
}

/** The nearest-rank percentile `p` (0 to 100) of the values; null for no value. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export const median = (values: number[]) => percentile(values, 50);

/** The ISO week of a time, `YYYY-Www`. */
export function isoWeek(time: string): string {
  const d = new Date(time);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function present(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null);
}

export function workflowStats(runs: RunRecord[]): WorkflowStats[] {
  const byWorkflow = new Map<string, RunRecord[]>();
  for (const run of runs) byWorkflow.set(run.workflow, [...(byWorkflow.get(run.workflow) ?? []), run]);
  return Array.from(byWorkflow, ([workflow, list]) => {
    const durations = present(list.map(runSeconds));
    const claude = list.filter((r) => r.claude);
    const turns = present(claude.map((r) => r.claude?.num_turns ?? null));
    const costs = present(claude.map((r) => r.claude?.total_cost_usd_estimate ?? null));
    const failure = list.filter((r) => r.conclusion === 'failure').length;
    const cancelled = list.filter((r) => r.conclusion === 'cancelled').length;
    const notSuccess = list.filter((r) => r.conclusion !== 'success').length;
    return {
      workflow,
      runs: list.length,
      medianSeconds: median(durations),
      p90Seconds: percentile(durations, 90),
      notSuccess,
      failure,
      cancelled,
      other: notSuccess - failure - cancelled,
      claudeRuns: claude.length,
      medianTurns: median(turns),
      totalCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      medianCostUsd: median(costs),
    };
  }).sort((a, b) => b.runs - a.runs || a.workflow.localeCompare(b.workflow));
}

export function ciJobStats(runs: RunRecord[]): JobStats[] {
  const ci = runs.filter((r) => r.workflow === CI_WORKFLOW);
  return CI_JOBS.map((job) => {
    const durations = present(
      ci.flatMap((r) => (r.jobs ?? []).filter((j) => j.name === job)).map((j) => secondsBetween(j.started_at, j.completed_at)),
    );
    return { job, runs: durations.length, medianSeconds: median(durations), p90Seconds: percentile(durations, 90) };
  });
}

export function weeklySeries(runs: RunRecord[]): WeeklySeries {
  const weeks = Array.from(new Set(runs.map((r) => isoWeek(r.created_at)))).sort();
  const workflows = workflowStats(runs).map((w) => w.workflow);
  return {
    weeks,
    series: workflows.map((workflow) => ({
      workflow,
      medianSeconds: weeks.map((week) =>
        median(present(runs.filter((r) => r.workflow === workflow && isoWeek(r.created_at) === week).map(runSeconds))),
      ),
    })),
  };
}

/** Sums the snapshots of one date across repositories. */
function snapshotsByDate(snapshots: IssueSnapshot[]): Map<string, LatestSnapshot> {
  const byDate = new Map<string, LatestSnapshot>();
  for (const s of snapshots) {
    const entry = byDate.get(s.date) ?? { date: s.date, counts: {}, openPrs: null };
    for (const [status, n] of Object.entries(s.counts ?? {})) entry.counts[status] = (entry.counts[status] ?? 0) + n;
    if (s.open_prs) {
      entry.openPrs = {
        draft: (entry.openPrs?.draft ?? 0) + s.open_prs.draft,
        ready: (entry.openPrs?.ready ?? 0) + s.open_prs.ready,
      };
    }
    byDate.set(s.date, entry);
  }
  return byDate;
}

export function latestSnapshot(snapshots: IssueSnapshot[]): LatestSnapshot | null {
  const byDate = snapshotsByDate(snapshots);
  const latest = Array.from(byDate.keys()).sort().pop();
  return latest ? byDate.get(latest)! : null;
}

/** One point per snapshot date for every status of any snapshot, 0 where a snapshot lacks it. */
export function statusSeries(snapshots: IssueSnapshot[]): StatusSeries {
  const byDate = snapshotsByDate(snapshots);
  const dates = Array.from(byDate.keys()).sort();
  const statuses = Array.from(new Set(snapshots.flatMap((s) => Object.keys(s.counts ?? {})))).sort();
  return {
    dates,
    series: statuses.map((status) => ({ status, counts: dates.map((d) => byDate.get(d)!.counts[status] ?? 0) })),
  };
}

/**
 * The completed issues that took longest from the first label to the close. An issue closes when its
 * PR merges through `Closes #n`, so `closed_at` stands in for the merge.
 */
export function slowestIssues(items: ItemRecord[], limit = SLOWEST_ISSUES): SlowIssue[] {
  const out: SlowIssue[] = [];
  for (const item of items) {
    if (item.kind !== 'issue' || item.state_reason !== 'completed' || !item.first_label_at) continue;
    const seconds = secondsBetween(item.first_label_at, item.closed_at);
    if (seconds === null) continue;
    out.push({
      repository: item.repository,
      number: item.number,
      url: `https://github.com/${item.repository}/issues/${item.number}`,
      firstLabelAt: item.first_label_at,
      firstLinkedPrAt: item.first_linked_pr_at ?? null,
      closedAt: item.closed_at,
      seconds,
    });
  }
  return out.sort((a, b) => b.seconds - a.seconds || a.number - b.number).slice(0, limit);
}

export function summarizeStats({ runs, issues, items }: StatsRecords): StatsSummary {
  const latestRunAt = runs.map((r) => r.created_at).sort().pop() ?? null;
  return {
    latestRunAt,
    workflows: workflowStats(runs),
    ciJobs: ciJobStats(runs),
    weekly: weeklySeries(runs),
    latestSnapshot: latestSnapshot(issues),
    statuses: statusSeries(issues),
    slowestIssues: slowestIssues(items),
  };
}

/** A duration as `m:ss`, or `h:mm:ss` from an hour, or `Nd hh:mm` from a day; `–` for none. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '–';
  const s = Math.round(seconds);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}`;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

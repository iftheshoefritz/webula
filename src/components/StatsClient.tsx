'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { formatDuration } from '../lib/stats';
import type { StatsSummary } from '../lib/stats';
import { STATS_FIXTURE, statsFixtureAllowed } from '../lib/statsFixture';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type LoadState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'ready'; stats: StatsSummary };

/** A distinct colour for series `i` of `n`. */
function seriesColor(i: number, n: number): string {
  return `hsl(${Math.round((360 * i) / Math.max(n, 1))}, 70%, 60%)`;
}

const usd = (n: number | null) => (n === null ? '–' : `$${n.toFixed(2)}`);
const date = (iso: string | null) => (iso ? iso.slice(0, 10) : '–');

function LineChart({ labels, series, yTitle, minutes }: {
  labels: string[];
  series: { label: string; data: (number | null)[] }[];
  yTitle: string;
  minutes?: boolean;
}) {
  return (
    <div className="relative h-56 sm:h-72 w-full">
      <Line
        data={{
          labels,
          datasets: series.map((s, i) => ({
            label: s.label,
            data: s.data,
            borderColor: seriesColor(i, series.length),
            backgroundColor: seriesColor(i, series.length),
            spanGaps: true,
            tension: 0.2,
          })),
        }}
        options={{
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: yTitle } },
          },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, color: '#ddd' } },
            tooltip: minutes
              ? { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatDuration((ctx.parsed.y ?? 0) * 60)}` } }
              : {},
          },
        }}
      />
    </div>
  );
}

const th = 'px-2 py-1 text-left font-semibold whitespace-nowrap';
const td = 'px-2 py-1 whitespace-nowrap';
const tdNum = `${td} text-right tabular-nums`;

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="mb-8" data-testid={testId}>
      <h2 className="text-lg font-semibold mb-2 text-white">{title}</h2>
      {children}
    </section>
  );
}

export function StatsView({ stats }: { stats: StatsSummary }) {
  const showCancelled = stats.workflows.some((w) => w.cancelled > 0);
  const showOther = stats.workflows.some((w) => w.other > 0);
  return (
    <div data-testid="stats-view">
      <p className="mb-6 text-gray-400" data-testid="stats-lag">
        Latest run: {date(stats.latestRunAt)}. Latest issue snapshot: {date(stats.latestSnapshot?.date ?? null)}.
        Workflow runs only; cloud sessions are not recorded.
      </p>

      <Section title="Workflows" testId="stats-workflows">
        <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className={th}>Workflow</th>
                <th className={th}>Runs</th>
                <th className={th}>Median</th>
                <th className={th}>90th pct</th>
                <th className={th}>Not success</th>
                <th className={th}>Failure</th>
                {showCancelled && <th className={th}>Cancelled</th>}
                {showOther && <th className={th}>Other</th>}
                <th className={th}>Median turns</th>
                <th className={th}>Median cost*</th>
                <th className={th}>Total cost*</th>
              </tr>
            </thead>
            <tbody>
              {stats.workflows.map((w) => (
                <tr key={w.workflow} className="border-b border-white/10">
                  <td className={td}>{w.workflow}</td>
                  <td className={tdNum}>{w.runs}</td>
                  <td className={tdNum}>{formatDuration(w.medianSeconds)}</td>
                  <td className={tdNum}>{formatDuration(w.p90Seconds)}</td>
                  <td className={tdNum}>{Math.round((100 * w.notSuccess) / w.runs)}%</td>
                  <td className={tdNum}>{w.failure}</td>
                  {showCancelled && <td className={tdNum}>{w.cancelled}</td>}
                  {showOther && <td className={tdNum}>{w.other}</td>}
                  <td className={tdNum}>{w.medianTurns ?? '–'}</td>
                  <td className={tdNum}>{usd(w.medianCostUsd)}</td>
                  <td className={tdNum}>{usd(w.totalCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Duration: from the start of the run to its end. &ldquo;Not success&rdquo; is the share of runs with any
          conclusion other than success, cancelled runs too. Turns and cost count only the runs where Claude ran.
          *Cost is an estimate at API prices; the workflows run on a subscription.
        </p>
      </Section>

      <Section title="CI jobs" testId="stats-ci-jobs">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className={th}>Job</th>
                <th className={th}>Runs</th>
                <th className={th}>Median</th>
                <th className={th}>90th pct</th>
              </tr>
            </thead>
            <tbody>
              {stats.ciJobs.map((j) => (
                <tr key={j.job} className="border-b border-white/10">
                  <td className={td}>{j.job}</td>
                  <td className={tdNum}>{j.runs}</td>
                  <td className={tdNum}>{formatDuration(j.medianSeconds)}</td>
                  <td className={tdNum}>{formatDuration(j.p90Seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Median duration by week" testId="stats-weekly">
        <LineChart
          labels={stats.weekly.weeks}
          series={stats.weekly.series.map((s) => ({
            label: s.workflow,
            data: s.medianSeconds.map((v) => (v === null ? null : Math.round(v / 6) / 10)),
          }))}
          yTitle="minutes"
          minutes
        />
      </Section>

      <Section title="Issues by status" testId="stats-statuses">
        {stats.latestSnapshot ? (
          <>
            <p className="mb-2 text-sm text-gray-400">On {stats.latestSnapshot.date}:</p>
            <ul className="mb-4 flex flex-wrap gap-2 text-sm">
              {Object.entries(stats.latestSnapshot.counts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, n]) => (
                  <li key={status} className="rounded bg-white/10 px-2 py-0.5">
                    {status}: <span className="tabular-nums">{n}</span>
                  </li>
                ))}
              {stats.latestSnapshot.openPrs && (
                <>
                  <li className="rounded bg-white/10 px-2 py-0.5">open PRs, draft: {stats.latestSnapshot.openPrs.draft}</li>
                  <li className="rounded bg-white/10 px-2 py-0.5">open PRs, ready: {stats.latestSnapshot.openPrs.ready}</li>
                </>
              )}
            </ul>
            <LineChart
              labels={stats.statuses.dates}
              series={stats.statuses.series.map((s) => ({ label: s.status, data: s.counts }))}
              yTitle="issues"
            />
          </>
        ) : (
          <p className="text-sm text-gray-400">No snapshot yet.</p>
        )}
      </Section>

      <Section title="Slowest issues, first label to close" testId="stats-slowest-issues">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-white/20">
                <th className={th}>Issue</th>
                <th className={th}>Took</th>
                <th className={th}>First label</th>
                <th className={th}>First PR</th>
                <th className={th}>Closed</th>
              </tr>
            </thead>
            <tbody>
              {stats.slowestIssues.map((issue) => (
                <tr key={`${issue.repository}#${issue.number}`} className="border-b border-white/10">
                  <td className={td}>
                    <a href={issue.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                      #{issue.number}
                    </a>
                  </td>
                  <td className={tdNum}>{formatDuration(issue.seconds)}</td>
                  <td className={td}>{date(issue.firstLabelAt)}</td>
                  <td className={td}>{date(issue.firstLinkedPrAt)}</td>
                  <td className={td}>{date(issue.closedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Completed issues only. An issue closes when its PR merges, so the close stands in for the merge.
        </p>
      </Section>
    </div>
  );
}

/** The stats page (#1417). The stats come from `/api/stats`, which answers only an early-access user. */
export default function StatsClient() {
  const searchParams = useSearchParams();
  const useFixture = statsFixtureAllowed() && searchParams.get('fixture') === '1';
  const { status } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (useFixture || status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/stats', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404 || res.status === 403) setState({ kind: 'denied' });
        else if (!res.ok) setState({ kind: 'error' });
        else setState({ kind: 'ready', stats: (await res.json()) as StatsSummary });
      })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [useFixture, status]);

  let body: React.ReactNode;
  if (useFixture) body = <StatsView stats={STATS_FIXTURE} />;
  else if (status === 'unauthenticated' || state.kind === 'denied') {
    body = <p data-testid="stats-denied">Stats are for early-access users.</p>;
  } else if (state.kind === 'error') body = <p data-testid="stats-error">The stats could not be loaded.</p>;
  else if (state.kind === 'ready') body = <StatsView stats={state.stats} />;
  else body = <p className="text-gray-400">Loading…</p>;

  return (
    <div className="min-h-screen bg-gradient-page font-body text-text-primary">
      <div className="max-w-5xl mx-auto px-3 py-6 sm:px-4 sm:py-10">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">Agent stats</h1>
          <Link href="/decks" className="text-sm underline hover:text-white">Deck builder</Link>
        </div>
        {body}
      </div>
    </div>
  );
}

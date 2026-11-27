# Stats

The rules of the stats of the repository that the code does not show at a glance. Read this file
before you change `scripts/collect_stats.mjs`, `scripts/stats/*.mjs`, the record format of `stats/`,
or the page `/stats`. The command line, its tokens and the development fixture are in `AGENTS.md`.
`.github/workflows/README.md` describes the workflow that records the stats every day.

## The collector

`scripts/collect_stats.mjs` reads GitHub and writes JSON Lines files under `stats/`, at the top of
the repository, outside `public/`, one file per month. `--since` and `--until` are UTC dates, both
inclusive; `--until` defaults to today. Each run of a workflow costs about two REST requests, its
jobs and its log. A local run waits for the reset when it reaches the rate limit. It tries a request
again after a 5xx or a dropped connection, and after the last try it files the run of a log it could
not get with no `claude` field.

The script writes each day of runs and each month of closed items as soon as it has them, so a run
that stops keeps its finished days and a second run resumes. A run or an item already in its month
file is not fetched again. It asks for no log of a run older than 90 days, the log retention of
GitHub: such a run has no `claude` field. The first run of the repository is from 2026-03-07. The
script prints what it fetched and what it skipped.

The parser, the counting and the merge are in `scripts/stats/*.mjs`, which use no network, and
`src/tests/scripts/collectStats.test.ts` tests them.

## The records

Every record carries `repository`. Each line is compact JSON, and the lines are sorted, so a second
run over the same window changes no byte.

- `stats/runs/<YYYY-MM>.jsonl`, by the month the run was created: one line per completed workflow
  run that was not `skipped`, keyed by (repository, `run_id`, `run_attempt`), the latest attempt
  when listed. It holds the workflow, event, branch, SHA, `number` (the issue or PR, from
  `pull_requests[]`, or for an `issues` or `issue_comment` run from the log as
  `classify_agent_failure.sh` finds `target`; `null` otherwise), conclusion, times and `jobs`. A
  `claude` field, `{subtype, is_error, num_turns, duration_ms, duration_api_ms,
  total_cost_usd_estimate, models: {<model>: {input_tokens, output_tokens}}}`, is there only when
  the log holds a result record, and that is what "Claude ran" means. The cost is the API-price
  estimate: the workflows run on a subscription token. A run whose log expired has no `claude`.
- `stats/issues/<YYYY-MM>.jsonl`: one snapshot per UTC date, `{repository, date, counts, open_prs:
  {draft, ready}}`. An open issue counts once, under the status label added last
  (`STATUS_LABELS` and `agent-error:*` in `scripts/stats/issueStatus.mjs`), or as `open-with-pr` or
  `open-no-status`. A closed issue counts under its `state_reason`.
- `stats/items/<YYYY-MM>.jsonl`, by the month the item closed: one line per closed issue and per
  merged or closed PR, keyed by (repository, number, kind), with `opened_at`, `closed_at`,
  `state_reason`, `first_label_at`, and `first_linked_pr_at` for an issue, or `merged_at`, `pushes`
  and `ci_runs` for a PR (the CI runs of its branch until it closed; every push starts one with the
  event `push`).

## The page

`/stats` shows the stats to early-access users: per workflow the runs, the median and 90th
percentile of the duration, the share of runs that did not succeed, and the turns and cost estimate
where Claude ran; per CI job the median and 90th percentile; the median duration by ISO week; the
issue counts per status of the latest snapshot and over time; and the 20 completed issues slowest
from the first label to the close.

It reads `/api/stats`, which applies `isEarlyAccessUser` to the caller's email from the NextAuth JWT
and answers 404 to anyone else, a signed-out caller too. A signed-out visitor sees a "Sign in with
Google" button, a plain Google sign-in with no Drive scope that comes back to `/stats`; a signed-in
user who is not early-access sees "Use another Google account", a sign-out back to `/stats`. The
deck actions menu of the deck builder shows a Stats link to early-access users only.

`src/lib/statsServer.ts` reads the folder, `src/lib/stats.ts` aggregates it (no `fs`), and
`outputFileTracingIncludes` in `next.config.mjs` puts `stats/` into the route's bundle. The page
never reads the files at build time.

// Collects the stats of a repository's agent runs, CI runs and issues into `stats/` (#1431).
//
//   GH_TOKEN=… node scripts/collect_stats.mjs --since 2026-10-28 [--until 2026-10-31] [--repo iftheshoefritz/webula]
//
// It writes three kinds of JSON Lines file, one per month, and merges each with the lines the file
// holds already, so a second run over the same window changes nothing:
//
//   stats/runs/<YYYY-MM>.jsonl    every completed workflow run created in the window, not skipped
//   stats/issues/<YYYY-MM>.jsonl  one snapshot of the issue counts for today's UTC date
//   stats/items/<YYYY-MM>.jsonl   every issue and PR closed in the window
//
// `--since` and `--until` are UTC dates, both inclusive; `--until` defaults to today. The token
// comes from GH_TOKEN, GITHUB_TOKEN, or `gh auth token`. The repository comes from `--repo`,
// GITHUB_REPOSITORY, or the default. A run already in its month file is skipped, and so is an item:
// a run that is complete does not change, and the skip saves the rate limit of a backfill.
//
// The parsing, the counting and the merge live in `scripts/stats/*.mjs`, which use no network, so
// Jest drives them from fixtures.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countIssues } from './stats/issueStatus.mjs';
import { KINDS, groupByMonth, mergeLines, monthOf, parseLines } from './stats/records.mjs';
import { claudeFromLog, targetFromLog } from './stats/resultRecord.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATS = path.join(ROOT, 'stats');
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { repo: process.env.GITHUB_REPOSITORY || 'iftheshoefritz/webula' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--since' || flag === '--until' || flag === '--repo') args[flag.slice(2)] = argv[++i];
    else throw new Error(`unknown argument ${flag}`);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!args.since || !date.test(args.since)) throw new Error('usage: collect_stats.mjs --since YYYY-MM-DD [--until YYYY-MM-DD] [--repo owner/name]');
  args.until ??= new Date().toISOString().slice(0, 10);
  if (!date.test(args.until) || args.until < args.since) throw new Error(`bad --until ${args.until}`);
  return args;
}

function token() {
  const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
}

let TOKEN = '';
const requests = { rest: 0, graphql: 0 };

async function rest(pathAndQuery, { allow = [] } = {}) {
  requests.rest++;
  const res = await fetch(`${API}/${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (allow.includes(res.status)) return { status: res.status, res };
  if (!res.ok) throw new Error(`GET ${pathAndQuery}: ${res.status} ${await res.text()}`);
  return { status: res.status, res };
}

async function restJson(pathAndQuery) {
  return (await rest(pathAndQuery)).res.json();
}

async function graphql(query, variables) {
  requests.graphql++;
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
  return body.data;
}

/** Every node of a connection that `pick(data)` returns, page by page. */
async function graphqlAll(query, variables, pick) {
  const nodes = [];
  let after = null;
  for (;;) {
    const connection = pick(await graphql(query, { ...variables, after }));
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
}

function days(since, until) {
  const out = [];
  for (let t = Date.parse(`${since}T00:00:00Z`); t <= Date.parse(`${until}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function monthsOf(since, until) {
  return [...new Set(days(since, until).map(monthOf))];
}

function filePath(kind, month) {
  return path.join(STATS, kind, `${month}.jsonl`);
}

async function readMonth(kind, month) {
  const file = filePath(kind, month);
  return existsSync(file) ? readFile(file, 'utf8') : '';
}

/** The keys already filed for the months of the window. */
async function existingKeys(kind, since, until) {
  const keys = new Set();
  for (const month of monthsOf(since, until)) {
    for (const record of parseLines(await readMonth(kind, month))) keys.add(KINDS[kind].key(record));
  }
  return keys;
}

async function writeRecords(kind, records) {
  await mkdir(path.join(STATS, kind), { recursive: true });
  const groups = groupByMonth(kind, records);
  for (const month of Object.keys(groups).sort()) {
    await writeFile(filePath(kind, month), mergeLines(kind, await readMonth(kind, month), groups[month]));
    console.log(`  wrote stats/${kind}/${month}.jsonl (${groups[month].length} new or updated)`);
  }
}

/** The text of the top-level `*.txt` files of a run attempt's log zip, or null when the log is gone. */
async function runLog(repo, runId, attempt) {
  const { status, res } = await rest(`repos/${repo}/actions/runs/${runId}/attempts/${attempt}/logs`, { allow: [404, 410] });
  if (status === 404 || status === 410) return null;
  const dir = await mkdtemp(path.join(tmpdir(), 'collect-stats-'));
  try {
    const zip = path.join(dir, 'logs.zip');
    const bytes = Buffer.from(await res.arrayBuffer());
    // A run that never started a job, such as a startup failure, has an empty zip.
    if (bytes.length <= 22) return null;
    await writeFile(zip, bytes);
    execFileSync('unzip', ['-q', '-o', zip, '-d', path.join(dir, 'logs')]);
    // The top-level files hold the complete log of one job each. The per-step files in the
    // subdirectories repeat the same lines.
    const entries = await readdir(path.join(dir, 'logs'), { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.txt')).map((e) => e.name).sort();
    const texts = [];
    for (const name of files) texts.push(await readFile(path.join(dir, 'logs', name), 'utf8'));
    return texts.join('\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const MAX_LISTED_RUNS = 1000;

/**
 * Every run created from `from` to `to`, two times in ms, both inclusive. The list stops at 1,000
 * rows whatever `total_count` says, so a busier range is split in two.
 */
async function listRuns(repo, from, to) {
  const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const range = `${iso(from)}..${iso(to)}`;
  const runs = [];
  for (let page = 1; ; page++) {
    const body = await restJson(`repos/${repo}/actions/runs?created=${encodeURIComponent(range)}&per_page=100&page=${page}`);
    if (page === 1 && body.total_count > MAX_LISTED_RUNS && to - from > 1000) {
      const mid = from + Math.floor((to - from) / 2000) * 1000;
      return [...(await listRuns(repo, from, mid)), ...(await listRuns(repo, mid + 1000, to))];
    }
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < 100 || runs.length >= MAX_LISTED_RUNS) return runs;
  }
}

async function collectRuns(repo, since, until) {
  console.log(`runs ${since}..${until}`);
  const known = await existingKeys('runs', since, until);
  const records = [];
  for (const day of days(since, until)) {
    const start = Date.parse(`${day}T00:00:00Z`);
    const runs = await listRuns(repo, start, start + DAY_MS - 1000);
    let skipped = 0;
    let incomplete = 0;
    let filed = 0;
    let withClaude = 0;
    for (const run of runs) {
      if (run.conclusion === 'skipped') {
        skipped++;
        continue;
      }
      if (run.status !== 'completed') {
        incomplete++;
        continue;
      }
      if (known.has(`${repo}\t${run.id}\t${run.run_attempt}`)) {
        filed++;
        continue;
      }
      const jobsBody = await restJson(`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      const jobs = jobsBody.jobs.map((job) => ({
        name: job.name,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
      }));
      const log = await runLog(repo, run.id, run.run_attempt);
      const claude = log === null ? undefined : claudeFromLog(log);
      if (claude) withClaude++;
      let number = run.pull_requests?.[0]?.number ?? null;
      if (number === null && log !== null && (run.event === 'issues' || run.event === 'issue_comment')) {
        number = targetFromLog(log);
      }
      const completedAt = jobs.map((job) => job.completed_at).filter(Boolean).sort().pop() ?? run.updated_at;
      const record = {
        repository: repo,
        workflow: run.name,
        run_id: run.id,
        run_attempt: run.run_attempt,
        event: run.event,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        number,
        conclusion: run.conclusion,
        created_at: run.created_at,
        started_at: run.run_started_at,
        completed_at: completedAt,
        jobs,
      };
      if (claude) record.claude = claude;
      records.push(record);
    }
    console.log(
      `  ${day}: ${runs.length} listed, ${skipped} skipped, ${incomplete} not complete, ` +
        `${filed} already filed, ${runs.length - skipped - incomplete - filed} fetched (${withClaude} with a result record)`,
    );
  }
  await writeRecords('runs', records);
}

const OPEN_ISSUES = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        labels(first: 50) { nodes { name } }
        timelineItems(itemTypes: [LABELED_EVENT], last: 100) {
          nodes { ... on LabeledEvent { createdAt label { name } } }
        }
        closedByPullRequestsReferences(first: 10, includeClosedPrs: false) { nodes { state } }
      }
    }
  }
}`;

const CLOSED_ISSUES = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(states: CLOSED, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { stateReason }
    }
  }
}`;

const OPEN_PRS = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { isDraft }
    }
  }
}`;

async function collectSnapshot(repo) {
  const [owner, name] = repo.split('/');
  const date = new Date().toISOString().slice(0, 10);
  console.log(`issue counts for ${date}`);
  const open = await graphqlAll(OPEN_ISSUES, { owner, name }, (d) => d.repository.issues);
  const closed = await graphqlAll(CLOSED_ISSUES, { owner, name }, (d) => d.repository.issues);
  const prs = await graphqlAll(OPEN_PRS, { owner, name }, (d) => d.repository.pullRequests);
  const openIssues = open.map((issue) => ({
    labels: issue.labels.nodes.map((label) => label.name),
    labelEvents: issue.timelineItems.nodes
      .filter((event) => event.label)
      .map((event) => ({ label: event.label.name, createdAt: event.createdAt })),
    hasOpenPr: issue.closedByPullRequestsReferences.nodes.some((pr) => pr.state === 'OPEN'),
  }));
  const record = {
    repository: repo,
    date,
    counts: countIssues(openIssues, closed),
    open_prs: { draft: prs.filter((pr) => pr.isDraft).length, ready: prs.filter((pr) => !pr.isDraft).length },
  };
  console.log(`  ${open.length} open issues, ${closed.length} closed issues, ${prs.length} open PRs`);
  await writeRecords('issues', [record]);
}

const CLOSED_ITEMS = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue {
        number createdAt closedAt stateReason
        timelineItems(itemTypes: [LABELED_EVENT], first: 1) { nodes { ... on LabeledEvent { createdAt } } }
        closedByPullRequestsReferences(first: 20, includeClosedPrs: true) { nodes { createdAt } }
      }
      ... on PullRequest {
        number createdAt closedAt mergedAt headRefName
        timelineItems(itemTypes: [LABELED_EVENT], first: 1) { nodes { ... on LabeledEvent { createdAt } } }
      }
    }
  }
}`;

/** The CI runs of a PR's branch up to the time it closed: every push starts one with the event `push`. */
async function ciRuns(repo, branch, closedAt) {
  const runs = [];
  for (let page = 1; ; page++) {
    const body = await restJson(
      `repos/${repo}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&per_page=100&page=${page}`,
    );
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < 100) break;
  }
  const before = runs.filter((run) => run.created_at <= closedAt);
  return { pushes: before.filter((run) => run.event === 'push').length, ci_runs: before.length };
}

async function collectItems(repo, since, until) {
  console.log(`items closed ${since}..${until}`);
  const known = await existingKeys('items', since, until);
  const records = [];
  for (const kind of ['issue', 'pr']) {
    const nodes = await graphqlAll(
      CLOSED_ITEMS,
      { q: `repo:${repo} is:${kind} is:closed closed:${since}..${until}` },
      (d) => d.search,
    );
    let filed = 0;
    for (const node of nodes) {
      if (known.has(`${repo}\t${node.number}\t${kind}`)) {
        filed++;
        continue;
      }
      const record = {
        repository: repo,
        kind,
        number: node.number,
        opened_at: node.createdAt,
        closed_at: node.closedAt,
      };
      if (kind === 'pr') record.merged_at = node.mergedAt;
      record.state_reason = node.stateReason ? node.stateReason.toLowerCase() : null;
      record.first_label_at = node.timelineItems.nodes[0]?.createdAt ?? null;
      if (kind === 'issue') {
        record.first_linked_pr_at = node.closedByPullRequestsReferences.nodes.map((pr) => pr.createdAt).sort()[0] ?? null;
      } else {
        Object.assign(record, await ciRuns(repo, node.headRefName, node.closedAt));
      }
      records.push(record);
    }
    console.log(`  ${kind}: ${nodes.length} closed, ${filed} already filed, ${nodes.length - filed} fetched`);
  }
  await writeRecords('items', records);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  TOKEN = token();
  await collectRuns(args.repo, args.since, args.until);
  await collectSnapshot(args.repo);
  await collectItems(args.repo, args.since, args.until);
  console.log(`requests: ${requests.rest} REST, ${requests.graphql} GraphQL`);
}

main().catch((error) => {
  console.error(`collect_stats.mjs: ${error.message}`);
  process.exit(1);
});

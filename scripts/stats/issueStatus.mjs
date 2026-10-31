// Counts the issues of a repository by status, for the daily snapshot of #1431. The rules are the
// owner's decisions in #1414.

export const STATUS_LABELS = [
  'needs-elaboration',
  'needs-plan',
  'architecture-discussion',
  'ready-for-dev',
  'needs-human-input',
  'has-open-questions',
  'blocked',
];

export function isStatusLabel(name) {
  return STATUS_LABELS.includes(name) || name.startsWith('agent-error:');
}

/**
 * The status an open issue counts under. `issue` is
 * `{ labels: string[], labelEvents: { label, createdAt }[], hasOpenPr: boolean }`, where
 * `labelEvents` are its `labeled` events and `hasOpenPr` says whether
 * `closedByPullRequestsReferences` holds an open PR.
 *
 * With status labels, the one added last wins: the one with the newest `labeled` event. A label
 * with no event sorts first. With none, the issue is `open-with-pr` or `open-no-status`.
 */
export function openIssueStatus(issue) {
  const current = issue.labels.filter(isStatusLabel);
  if (current.length > 0) {
    const addedAt = (label) => {
      let latest = '';
      for (const event of issue.labelEvents ?? []) {
        if (event.label === label && event.createdAt > latest) latest = event.createdAt;
      }
      return latest;
    };
    let best = current[0];
    for (const label of current.slice(1)) {
      if (addedAt(label) > addedAt(best)) best = label;
    }
    return best;
  }
  return issue.hasOpenPr ? 'open-with-pr' : 'open-no-status';
}

/** The bucket of a closed issue: its `state_reason`, in lower case. */
export function closedIssueStatus(issue) {
  return issue.stateReason ? String(issue.stateReason).toLowerCase() : 'unknown';
}

/**
 * The `counts` of a snapshot: each open issue once, under `openIssueStatus`, and each closed
 * issue under its `state_reason`. The keys come out sorted.
 */
export function countIssues(openIssues, closedIssues) {
  const counts = {};
  const add = (key) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const issue of openIssues) add(openIssueStatus(issue));
  for (const issue of closedIssues) add(closedIssueStatus(issue));
  return Object.fromEntries(Object.keys(counts).sort().map((key) => [key, counts[key]]));
}

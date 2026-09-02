#!/usr/bin/env bash
#
# Classify a failed Claude Code workflow run and find the issue or PR it worked
# on. Reads the run logs from the GitHub API, so it needs no Claude Code.
#
# Usage: scripts/classify_agent_failure.sh <run-id> [repo]
#
# Writes three key=value lines to stdout, ready for $GITHUB_OUTPUT:
#   reason=<slug>            one of the REASON_* slugs below
#   target=<number>          issue or PR number, empty if none was found
#   target_type=issue|pr     empty if no target was found
#
# Needs: gh (authenticated), unzip.

set -euo pipefail

RUN_ID="${1:?usage: classify_agent_failure.sh <run-id> [repo]}"
REPO="${2:-${GITHUB_REPOSITORY:-}}"

if [ -z "$REPO" ]; then
  echo "classify_agent_failure.sh: no repo given and GITHUB_REPOSITORY is not set" >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# The per-job endpoint returns terminal escape sequences that gh refuses to
# write. The run-level endpoint returns a zip, so use that one.
if ! gh api "repos/$REPO/actions/runs/$RUN_ID/logs" > "$workdir/logs.zip" 2>"$workdir/gh.err"; then
  echo "classify_agent_failure.sh: cannot download logs for run $RUN_ID" >&2
  cat "$workdir/gh.err" >&2
  echo "reason=logs-unavailable"
  echo "target="
  echo "target_type="
  exit 0
fi

unzip -q -o "$workdir/logs.zip" -d "$workdir/logs"
log="$workdir/all.log"
# Top-level files hold the complete log of one job each. The per-step files in
# the subdirectories repeat the same lines, so skip them.
find "$workdir/logs" -maxdepth 1 -type f -name '*.txt' -print0 | xargs -0 cat > "$log"

has() { grep -qiF -- "$1" "$log"; }

# Reasons, in priority order. The first match wins.
if has '"subtype": "error_max_turns"'; then
  reason="max-turns"
elif has '"subtype": "error_during_execution"'; then
  reason="execution-error"
elif has 'Credit balance is too low'; then
  reason="credit-balance"
elif has 'usage limit reached' || has '"type": "rate_limit"' || has 'rate_limit_error'; then
  reason="rate-limit"
elif has 'prompt is too long' || has 'context_length_exceeded'; then
  reason="context-overflow"
elif has 'OAuth token has expired' || has 'invalid_api_key' || has 'authentication_error' || has 'Invalid API key'; then
  reason="auth"
elif has 'exceeded the maximum execution time' || has 'The operation was canceled'; then
  reason="job-timeout"
elif has 'overloaded_error' || has '"type": "api_error"' || has 'Internal server error'; then
  reason="api-error"
elif has 'Could not fetch an OIDC token' || has 'ACTIONS_ID_TOKEN_REQUEST_URL'; then
  reason="oidc-token"
elif has '"type": "result"'; then
  # Claude finished, so something after it failed: a push, a gh call, a later
  # step in the workflow.
  reason="post-run-step"
elif ! has '"subtype": "init"'; then
  # Claude never started, so the failure is in the workflow setup.
  reason="startup-failure"
else
  reason="unknown"
fi

# The prompt of every Claude workflow names the issue or the PR it acts on. The
# runner echoes that prompt near the top of the log, so look there only. Later
# lines are tool output, which mentions many other numbers.
target=""
target_type=""
hit="$(head -800 "$log" \
  | grep -oiE '(github issue|pull request|issue|PR) #[0-9]+' \
  | head -1 || true)"
if [ -n "$hit" ]; then
  target="$(printf '%s' "$hit" | grep -oE '[0-9]+')"
  case "$(printf '%s' "$hit" | tr 'A-Z' 'a-z')" in
    *"pull request"*|"pr #"*) target_type="pr" ;;
    *) target_type="issue" ;;
  esac
fi

# Fall back to the branch name, which the implementation workflow builds as
# issue-<number>-<description>.
if [ -z "$target" ]; then
  num="$(grep -oE 'issue-[0-9]+-[a-z0-9-]+' "$log" | head -1 | grep -oE '[0-9]+' || true)"
  if [ -n "$num" ]; then
    target="$num"
    target_type="issue"
  fi
fi

echo "reason=$reason"
echo "target=$target"
echo "target_type=$target_type"

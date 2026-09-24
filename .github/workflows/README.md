# GitHub Workflows

## CI (`ci.yml`)
**Event:** `push` or `pull_request` on any branch
**Action:** Two parallel jobs, no Claude. The `test` job runs `yarn test --ci`. The `build` job runs `yarn build`, which checks types, runs ESLint, and pre-renders the static pages — the same checks as the Vercel deployment.

Vercel chains the two through the `buildCommand` in `vercel.json`, so a test failure stops the deployment.

The implementation workflow pushes every few edits, before the tests pass, so the work survives a run that hits the turn limit. Such a push would report a failed deployment, so the `ignoreCommand` in `vercel.json` skips the Vercel build for a commit whose message starts with `wip:`. Step 3 of `claude-implement.yml` uses that prefix; steps 4 and 6, which push a finished change, do not.

---

## Claude Issue Triage (`claude-triage.yml`)
**Event:** Issue labeled `needs-elaboration`
**Action:** Claude reads the issue, answers open questions, posts its answers as a comment on the issue, then removes the `needs-elaboration` label.

---

## Claude Implementation Plan (`claude-plan.yml`)
**Event:** Issue labeled `needs-plan`
**Action:** Claude investigates the codebase and writes an `## Implementation Plan` section into a single comment on the issue, then removes the `needs-plan` label. The plan describes what needs to change in the abstract and names code concepts (modules, components, hooks, functions, classes, types) rather than file lists or line numbers. `claude-implement.yml` reads comments, so it picks the plan up from there.

Re-labelling the issue rewrites that same comment rather than adding another. The comment is identified by a `<!-- claude-plan -->` marker on its first line and replaced wholesale via the comments API. On a rewrite Claude keeps the existing structure, carries over anything it did not learn was wrong, and states only the current intent — discarded options and "previously we thought…" notes are deleted, so the comment always reads as the plan as it stands today. Since an edit is invisible in the issue timeline, a rewrite is followed by a brief one-line comment linking to the plan and saying what changed.

---

## Add needs-elaboration label (`needs-elaboration-label.yml`)
**Event:** Issue comment created by the repo owner starting with `Elaborate:`, `Clarify:`, or `Refine:`
**Action:** No Claude — just adds the `needs-elaboration` label (which triggers `claude-triage.yml`).

---

## Claude Architecture Discussion (`claude-architecture.yml`)
**Event:** Issue labeled `architecture-discussion`
**Action:** Claude investigates the codebase to answer questions and verify speculative claims in the issue, appends/updates an `## Architectural Analysis` section, and adds the `needs-human-input` label for anything it can't resolve.

---

## The `ready-for-dev` label is for people only

No Claude workflow adds `ready-for-dev`, and no agent adds it to an issue it creates.
`anthropics/claude-code-action` refuses a run that a bot started ("Workflow initiated by
non-human actor") unless the workflow sets `allowed_bots`. So a label from `claude[bot]`
starts `claude-implement.yml`, the run stops after a few seconds, and `agent-failure-label.yml`
puts `agent-error:startup-failure` on the issue for work that never ran.

The rule is in AGENTS.md, which every prompt refers to, and again in the prompt of each
workflow that can create or label an issue.

---

## Claude Issue Implementation (`claude-implement.yml`)
**Event:** Issue labeled `ready-for-dev`
**Action:** Claude implements the feature/fix and runs `yarn test` and `yarn build`. Then it creates a branch, commits, pushes, and opens a draft PR targeting `main` with `Closes #<issue>`. Then it does a short smoke check in the browser, and hands the PR to `claude-visual-check.yml` with the `visual-check` label.

The PR opens before the browser check for three reasons:

- The browser check uses many turns. If the run stops at the turn limit, the branch and the PR keep the work.
- Vercel has more time to build the preview.
- Other agents can work on the PR while the browser check runs.

The prompt starts the dev server with `NEXT_PUBLIC_AGENT_BROWSER=1`. This hides the consent banner and the Next.js dev tools button, because they cover elements that the browser check clicks and drags.

### The smoke check and the visual check

This workflow runs a smoke check of about five commands: open the page, take one snapshot, confirm the new element is there, and read the browser console and the dev server log. It finds the errors that only appear at run time — a crash on render, a component that throws, a missing `data-zone` attribute — while the agent still holds the context to fix them.

The acceptance checks of the issue are a separate run. See `claude-visual-check.yml` below.

### The turn limit

The limit is 80 turns, and it stays at 80. Do not raise it. An issue that hits the limit is too
big: split it into two issues, as #630 was split into #733 (the state change) and #630 (the page
change).

Two runs stopped at the limit with the edits part done and nothing pushed: run 35967322676 on
issue #630, and run 35968374324 on issue #733. Both spent about half their turns on a search of
the codebase before the first edit, then made one small edit per turn. The prompt now tells the
agent to make the branch and the draft pull request while it edits, to push every few edits, and
to trust the file names and the function names in the `## Implementation Plan` comment instead of
searching for them again.

### The install runs before Claude

`actions/setup-node` with `cache: "yarn"`, then `yarn install --frozen-lockfile`, run as steps before the Claude step. The same steps are in `agent-review.yml` and `claude-visual-check.yml`.

An agent that installs the dependencies itself spends turns on it, and its first `yarn test` fails with an error that reads like a broken test. `agent-browser` is a devDependency for the same reason: `npx agent-browser` then runs the local copy, and downloads nothing.

`agent-browser` is pinned to `0.27.0`, the last release with no `engines` field. Every release from `0.27.1` needs Node 24, and CI runs Node 20, so a later version fails `yarn install --frozen-lockfile` with "The engine node is incompatible with this module". To move to a later `agent-browser`, raise the Node version in `ci.yml` and in the three agent workflows first, and raise the Node version of the Vercel project to match.

---

## Claude Visual Check (`claude-visual-check.yml`)
**Event:** PR labeled `visual-check`
**Action:** Claude reads the acceptance checks of the issue the PR closes, runs them in the browser against the dev server, writes the `## Visual Verification` section into the PR body, marks the PR ready for review, and removes the `visual-check` label.

The check is a separate workflow because it used most of the turns of `claude-implement.yml` and ran last. Run 35314198627 on issue #605 stopped at the turn limit with the code complete, both checks green, and the `## Visual Verification` section still on "Pending.". A separate run gets its own turn limit, and the branch is already pushed, so it risks nothing.

If an acceptance check fails on a bug, Claude fixes the bug, runs `yarn test` and `yarn build`, pushes to the same branch, and runs the check again. If it cannot fix it, the PR stays a draft and gets the `needs-human-input` label.

`claude-implement.yml` adds the `visual-check` label as `claude[bot]`, so this workflow sets `allowed_bots: "claude[bot]"`. Without it the action refuses the run with "Workflow initiated by non-human actor". The list names one bot, so no other App can start the run.

A PR that stays a draft with "Pending." in its `## Visual Verification` section is from a visual check that never ran or never finished.

The report goes into the body with `scripts/replace_pr_section.sh`, not with `gh pr edit --body`. `--body` replaces the whole body, so the agent has to write every other part again, and twice it left the `Closes #<issue>` line out. PR #651 and PR #653 merged, and issues #638 and #640 stayed open. The script reads the current body, swaps the text of one section, and writes the body back with `--body-file`, so every other part stays as it was. It also fails if the new body drops a `Closes #<number>` line.

```bash
bash scripts/replace_pr_section.sh <pr-number> "## Visual Verification" report.md
bash scripts/replace_pr_section.sh --add-if-missing <pr-number> "## Dev Server Issues" errors.md
```

`--add-if-missing` adds the section at the end of the body when the body holds no such heading. Without the flag, a missing heading is a failure and the script writes nothing.

The attribution footer that starts with 🤖 `Generated with` is not part of any section. The script holds it back and puts it at the end again, so a swap of the last section keeps it.

---

## Agent Review (`agent-review.yml`)
**Event:** PR labeled `agent-review`
**Action:** Claude fetches all unresolved review comments, and either makes code changes or replies to the thread. For a code change, it runs `yarn test` and `yarn build`, commits, and pushes. Then, if the change affects a page, it checks only the review items in the browser. It posts a summary comment and removes the `agent-review` label.

The push comes before the browser check for the same reason as in the implementation workflow. A run on PR #611 made a correct fix and stopped at the turn limit before it committed, so the fix was lost.

---

## Claude Merge Conflict Resolution (`claude-merge-conflict.yml`)
**Event:** PR opened, synchronized, or reopened
**Action:** Polls GitHub's mergeability state; if `dirty`, Claude rebases the branch onto `main`, resolves conflicts, force-pushes, and comments with a summary. If a conflict is too ambiguous, it aborts and flags for human review.

---

## Vercel Preview Check (`vercel-preview-check.yml`)
**Event:** Issue comment created/edited by `vercel[bot]` on a PR containing a `vercel.app` "Ready" link, or a PR marked ready for review
**Action:** Claude extracts the preview URL, identifies affected routes, checks the PR's `## Visual Verification` section for coverage adequacy, and posts a comment with clickable preview links and a ✅/⚠️/🟠/❌ assessment. Uses an idempotency marker to avoid duplicate comments per commit.

The check needs both a ready preview and a PR that is not a draft. These can come in either order, so each event starts the check, and a first step stops the run when the other one is missing. The implementation workflow opens a draft PR with "Pending." in its `## Visual Verification` section, and `claude-visual-check.yml` fills in the section when it marks the PR ready. A check of the draft would read "Pending.", and no later event would run the check again.

---

## Claude Issue Outcome (`claude-issue-outcome.yml`)
**Event:** Issue closed
**Action:** Claude finds all merged PRs linked to the issue, summarizes what was implemented (files changed, merge date), and prepends an `## Outcome` section to the issue body.

The job needs `id-token: write`. Without it the run fails at once with "Could not fetch an OIDC token", and `agent-failure-label.yml` puts `agent-error:oidc-token` on an issue whose work is already merged. That was the cause of the long-standing breakage, fixed in #703.

---

## Label agent failures (`agent-failure-label.yml`)
**Event:** Any of the Claude workflows above completes with the `failure` conclusion
**Action:** No Claude. `scripts/classify_agent_failure.sh` downloads the run logs, works out why the run failed, finds the issue or PR the run acted on, and adds an `agent-error:<reason>` label to it. An older `agent-error:` label on the same issue or PR is removed, so only the newest reason stays. The workflow also adds a comment that names every job that failed and links straight to the log of that job, because the run URL alone points at the run overview. For an `agent-error:max-turns` failure, the comment also asks the next agent to find the parts of the work that consumed the most turns, and to recommend how to reduce them or what work to extract into sub-issues.

The script finds the issue or PR number in the prompt that the runner echoes near the top of the log (`GitHub issue #507`, `Pull request #512`), and falls back to an `issue-<number>-<description>` branch name.

Reasons, in the order the script tests them:

| Label | What the log shows |
|---|---|
| `agent-error:max-turns` | `"subtype": "error_max_turns"` — Claude hit `--max-turns` |
| `agent-error:execution-error` | `"subtype": "error_during_execution"` |
| `agent-error:credit-balance` | `Credit balance is too low` |
| `agent-error:rate-limit` | `usage limit reached`, `You've hit your limit`, `"error": "rate_limit"`, or another rate limit error |
| `agent-error:context-overflow` | `prompt is too long` |
| `agent-error:auth` | An expired OAuth token or an invalid API key |
| `agent-error:job-timeout` | The runner stopped the job, or the job was cancelled |
| `agent-error:api-error` | An overloaded or internal API error |
| `agent-error:oidc-token` | `Could not fetch an OIDC token` — the job needs `id-token: write` |
| `agent-error:post-run-step` | The result record has `"is_error": false`, so Claude finished with no error and a later step failed |
| `agent-error:startup-failure` | Claude never started. See "A workflow file change stops the runs on every open PR" below |
| `agent-error:logs-unavailable` | The logs could not be downloaded |
| `agent-error:unknown` | None of the above matched |

The script asks the Jobs API for the name and the page link of every job with the `failure` conclusion, and writes them as the multi-line `failed_jobs` output.

A result record with `"is_error": true` is a Claude failure. If no test above
matched it, the reason is `unknown`, not `post-run-step`.

## A workflow file change stops the runs on every open PR

`claude-code-action` refuses to start when the branch it checks out holds a copy of the
workflow file that differs from the copy on the default branch. The run fails at the token
exchange:

```
App token exchange failed: 401 Unauthorized - Workflow validation failed. The workflow file
must exist and have identical content to the version on the repository's default branch.
```

`agent-failure-label.yml` then labels it `agent-error:startup-failure`, which reads like a
run that died for no reason.

This hits `claude-visual-check.yml` and `agent-review.yml`, because both check out the
branch of the pull request rather than the default branch.

So after a change to any workflow file merges, every pull request opened before that merge
carries the old copy. Bring each one up to date before you start its check again:

```bash
gh pr update-branch <number>
```

Then remove and add the label again to start the run.

This happened on 2026-09-23. A merge of the visual check prompt broke the check on pull
request #694, and the label said `startup-failure`.

To classify a run by hand, run the script with the run ID:

```bash
GITHUB_REPOSITORY=iftheshoefritz/webula bash scripts/classify_agent_failure.sh 33534646859
```

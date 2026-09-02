# GitHub Workflows

## CI (`ci.yml`)
**Event:** `push` or `pull_request` on any branch
**Action:** Two parallel jobs, no Claude. The `test` job runs `yarn test --ci`. The `build` job runs `yarn build`, which checks types, runs ESLint, and pre-renders the static pages — the same checks as the Vercel deployment.

Vercel chains the two through the `buildCommand` in `vercel.json`, so a test failure stops the deployment.

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

## Claude Issue Implementation (`claude-implement.yml`)
**Event:** Issue labeled `ready-for-dev`
**Action:** Claude implements the feature/fix, runs tests, visually verifies via `yarn dev` + `agent-browser`, creates a branch, commits, and opens a PR targeting `main` with `Closes #<issue>`.

---

## Agent Review (`agent-review.yml`)
**Event:** PR labeled `agent-review`
**Action:** Claude fetches all unresolved review comments, either makes code changes (runs `yarn test`, commits, pushes) or replies to the thread, posts a summary comment, and removes the `agent-review` label.

---

## Claude Merge Conflict Resolution (`claude-merge-conflict.yml`)
**Event:** PR opened, synchronized, or reopened
**Action:** Polls GitHub's mergeability state; if `dirty`, Claude rebases the branch onto `main`, resolves conflicts, force-pushes, and comments with a summary. If a conflict is too ambiguous, it aborts and flags for human review.

---

## Vercel Preview Check (`vercel-preview-check.yml`)
**Event:** Issue comment created/edited by `vercel[bot]` on a PR containing a `vercel.app` "Ready" link
**Action:** Claude extracts the preview URL, identifies affected routes, checks the PR's `## Visual Verification` section for coverage adequacy, and posts a comment with clickable preview links and a ✅/⚠️/🟠/❌ assessment. Uses an idempotency marker to avoid duplicate comments per commit.

---

## Claude Issue Outcome (`claude-issue-outcome.yml`)
**Event:** Issue closed
**Action:** Claude finds all merged PRs linked to the issue, summarizes what was implemented (files changed, merge date), and prepends an `## Outcome` section to the issue body.
(currently broken)

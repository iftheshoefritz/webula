---
name: drive-issues
description: Drive a set of GitHub issues to merged PRs through the repo's label workflows (needs-elaboration, needs-plan, ready-for-dev, visual-check, agent-review), acting as the owner's proxy - applying ready-for-dev and merging. Use when the owner says "drive issues 1114 onwards", "pick up issues 1114-1120", "work through #1114 #1116 with the workflow labels", or invokes /drive-issues.
argument-hint: "<issues: 1114+ | 1114-1120 | 1114 1116 1119> [max N in flight] [no-merge]"
---

# Drive issues through the label workflows

The owner (iftheshoefritz) wrote this skill, and invoking it hands you a set of issues
along with two things that are normally theirs alone: **applying `ready-for-dev`** and
**merging pull requests**. That delegation lasts only for the issue set of this
invocation. Move every issue in the set to a merged PR, in the order you judge best, by
applying the workflow labels and following up on whatever each run produces. You
dispatch and review. The workflows write the code.

Arguments: `$ARGUMENTS`

## 1. Parse the arguments into an issue set

| Form | Meaning |
|---|---|
| `1114+`, `1114 onwards`, `from 1114` | every **open issue** (not PR) numbered ≥ 1114 |
| `1114-1120` | open issues 1114 through 1120 inclusive |
| `1114 1116 #1119` | exactly those issues |
| `max 3` / `3 in flight` | at most 3 issues with an implementation run or open PR at once (default **2**) |
| `no-merge` | do everything except merge; stop at the gate (§7) and report |

List the set with `mcp__github__list_issues` / `search_issues`
(`repo:iftheshoefritz/webula is:issue is:open`) and drop pull requests. For an open-ended
range (`1114+`), take the set as it stands now, and add issues created later only if they
are sub-issues or follow-ups you created for an issue in the set. Tell the owner the set
you resolved before you label anything.

Skip, and report as skipped, an issue labelled `needs-human-input`, `wontfix`,
`question` or `blocked`, or assigned to someone other than the owner, unless the owner
named it explicitly.

## 2. Read every issue before you order them

For each issue read the body, all comments, labels, sub-issues, and linked PRs
(`issue_read` with methods `get`, `get_comments`, `get_sub_issues`, `get_labels`;
`search_pull_requests` for `Closes #N`). Classify it:

| State | Signal | Next label |
|---|---|---|
| Unclear | open questions, no acceptance checks, contradictory comments | `needs-elaboration` |
| Architectural | the issue asks a design question or weighs alternatives | `architecture-discussion` |
| Clear, unplanned | no `<!-- claude-plan -->` comment | `needs-plan` |
| Planned | a plan comment that matches the current body | `ready-for-dev` |
| In flight | an open PR that closes it | follow the PR (§5) |
| Done | a merged PR, or closed | nothing |

A small, obvious issue (a one-line fix with explicit acceptance checks) may skip
`needs-plan`. Anything that touches more than one component gets a plan first: the
implement run has a hard 80-turn limit and leans on the plan to stay inside it.

## 3. Choose the order

Decide the order from the content, and give it to the owner as a short list with one
reason per issue. In order of weight:

1. **Explicit dependencies**: "depends on #N", "after #N", "blocked by", sub-issues
   (children before parent), a plan that uses a type or function another issue adds.
2. **Collisions**: two issues whose plans change the same component, reducer or file
   make the second PR conflict. Run them one after the other, never in parallel.
3. **Unblocking value**: an issue that others build on goes first.
4. **Size**: all else equal, smaller first, so merged work lands early.

Issues with no dependency and no collision may run in parallel, up to the in-flight
limit. Elaboration and plan runs are cheap and don't count toward the limit: label
`needs-elaboration` / `needs-plan` on everything that needs it up front, so plans are
ready when an implementation slot frees up.

## 4. Apply labels, and check that the run started

Apply labels with `mcp__github__issue_write` (method `update`, the full `labels` list,
keeping the existing ones) or `update_pull_request`. Before you use a label for the first
time in a session, read its workflow (`grep -rn "github.event.label.name" .github/workflows/`)
and the AGENTS.md table under "A label can start a workflow run".

**`ready-for-dev`.** AGENTS.md says only a person applies it, because
`claude-implement.yml` refuses a run that a bot starts ("Workflow initiated by non-human
actor"). This skill is the owner's delegation of that label. The GitHub tools of a cloud
session act as the owner's account, so the label should count as a human's. Verify it on
the first one: a few minutes after you label, list the runs of `claude-implement.yml`
(`mcp__github__actions_list`) and check that the newest run for that issue is running, not
failed in its first minute and not followed by an `agent-error:startup-failure` label. If
it was refused, stop applying `ready-for-dev`, remove the `agent-error:` label, and tell
the owner which issues are ready for them to label by hand.

A label that its run does not remove (`ready-for-dev`, `architecture-discussion`) starts
the run again if you remove and re-add it. Do that only on purpose, to re-run.

## 5. Follow the work

Runs on issues do not wake this session, so check in. PR events do wake it.

- **After you label an issue**, schedule a check-in with `send_later`: about 20 minutes
  for elaboration or a plan, 35 for an implementation. Keep one pending check-in that
  covers everything in flight, not one per issue.
- **When a PR appears** for an issue (`Closes #N`), call `subscribe_pr_activity` on it.
- On each check-in or event, refresh every issue in the set, act on what changed, and keep
  going until the set is done.

| You see | Do |
|---|---|
| Elaboration answered the questions | if open questions remain that the code can't answer, ask the owner; else `needs-plan` |
| Plan comment written | read it; if it is wrong or too big for 80 turns, comment and re-label `needs-plan`, or split the issue (below); else `ready-for-dev` when a slot is free |
| `architecture-discussion` added `needs-human-input` | put the open question to the owner, with your recommendation, and wait |
| Draft PR with "Pending." and no `visual-check` label | the implement run died before the hand-off: add `visual-check` |
| PR still a draft with `needs-human-input` | read the visual-check report; fix it if small (§6), else ask the owner |
| Unresolved review comments, or a Vercel preview check ❌/🟠 that names a real gap | add `agent-review` |
| CI red | read the failing job log (`get_job_logs`); a failure this PR caused → a PR comment naming it plus `agent-review`, or fix it yourself (§6) |
| PR conflicts with `main` (`mergeable_state: dirty`) | `update_pull_request_branch`; if GitHub can't merge it, merge `main` into the branch locally, resolve, validate, push |
| `agent-error:max-turns` | read the failure comment, split the issue in two sub-issues (state change / UI change is the usual cut), plan each, then `ready-for-dev` each |
| any other `agent-error:<reason>` | read the comment and the log (AGENTS.md "To read why a workflow run failed"); re-run once by re-labelling if the run died before the agent did any work; otherwise report it |

**Splitting an issue.** Create the sub-issues with `sub_issue_write`, each with its own
acceptance checks and the part of the parent's plan that applies to it. They join the
issue set. Tell the owner about the split when you make it.

## 6. Fixing things yourself

Prefer a label: the workflows carry the repo's checks and its browser verification. Fix
in this session only what is small (a lint error, a failing assertion the diff explains,
a conflict) or what the same workflow has already failed on once. Then follow "Fixing
Existing PRs" in AGENTS.md: check out the PR branch, keep the fix minimal, run
`yarn test`, `yarn typecheck` and `yarn build` (all three must pass), commit
`fix: <what> (follow-up for #<pr>)`, and push to the same branch. Never force-push a
branch you did not create.

## 7. Merge gate

Merge a PR only when **all** of these hold on its current head commit:

1. It is not a draft, and no `needs-human-input`, `visual-check` or `agent-review` label
   is pending.
2. CI `test`, `typecheck` and `build` are green, and the Vercel deployment succeeded.
3. `## Visual Verification` holds a real report, not "Pending.", and it covers and passes
   each acceptance check of the issue. A `## Dev Server Issues` section stops the merge.
4. The Vercel preview check comment is ✅, or its concern is one you checked and dismissed
   in a PR comment that says why.
5. No review thread is unresolved, and `mergeable_state` is `clean`.
6. You read the diff yourself. It does what the issue asks and nothing unrelated, new
   behaviour has tests, and no test was skipped or deleted. If you would not approve it,
   don't merge it: say what is wrong in a PR comment and add `agent-review`.
7. The body still has `Closes #<issue>`.

Then call `mcp__github__merge_pull_request` with `merge_method: squash` and a title of
the form `<Area>: <summary> (#<pr>)`, in the style of `git log --oneline main` (for
example `Practice table: a Load deck picker of its own (#1112)`). Confirm the issue
closed, and close it with `state_reason: completed` if not. Unsubscribe from the PR.

After a merge, every other open PR in the set is behind `main`: update its branch before
its next gate check.

With `no-merge`, stop at the gate and list the PRs that pass it.

## 8. Reporting

Post to the owner only when something changes state or needs them, in one line:

```
#1114 merged (#1121) · #1115 PR #1122 in visual check · #1116 planning · #1117 waiting on you: <question>
```

Ask the owner only for decisions that are theirs: product behaviour the issue leaves
open, a design choice from `architecture-discussion`, a split that changes scope, or a PR
that fails the gate twice. Decide everything else, and say what you decided.

When every issue in the set is merged, closed, or waiting on the owner, cancel pending
check-ins and send a final table: issue, outcome, PR, and anything left for the owner.

## Never

- Apply `ready-for-dev` to, or merge a PR for, an issue outside the set of this invocation.
- Merge a PR that fails the gate.
- Skip, disable or delete a test to get CI green.
- Push to `main` directly, or force-push a branch you did not create.
- Raise the 80-turn limit of `claude-implement.yml`; split the issue instead.
- Edit CLAUDE.md. AGENTS.md is the file to update.

---
name: drive-issues
description: Take a set of issues through the label workflows to merged PRs, as the owner's proxy.
disable-model-invocation: true
argument-hint: "<issues: 1114+ | 1114-1120 | 1114 1116 1119> [max N in flight] [no-merge]"
---

# Drive issues through the label workflows

The owner (iftheshoefritz) wrote this skill, and invoking it hands you a set of issues
along with two things that are normally theirs alone: **applying `ready-for-dev`** and
**merging pull requests**. That delegation lasts only for the issue set of this
invocation. Move every issue in the set to a merged PR, in the order you judge best, by
applying the workflow labels and following up on whatever each run produces. You
dispatch and review. The workflows write the code.

The set is **done** when every issue in it is merged, closed, or waiting on the owner.

Arguments: `$ARGUMENTS`

## 0. Tools: the GitHub MCP, not `gh`

This skill runs in a cloud session that the owner starts. A local session has no GitHub
MCP and no `send_later`.

Do every GitHub read and write with the GitHub MCP tools (`mcp__github__*`). In a cloud
session the `gh` CLI has no GitHub token, so the `gh` commands in AGENTS.md and in
`scripts/` (such as `replace_pr_section.sh` and the `gh api` log recipe) work only inside
the Actions workflows, not here. If the tools appear only as deferred names, load them with
`ToolSearch` first, in one call, e.g.
`select:mcp__github__get_me,mcp__github__list_issues,mcp__github__issue_read,mcp__github__issue_write,mcp__github__add_issue_comment,mcp__github__pull_request_read,mcp__github__search_pull_requests,mcp__github__actions_list,mcp__github__get_job_logs,mcp__github__update_pull_request_branch,mcp__github__merge_pull_request`.
The check-in and PR-watch tools are `mcp__claude-code-remote__send_later` and
`mcp__claude-code-remote__subscribe_pr_activity`.

Call `mcp__github__get_me` first. It should return `iftheshoefritz`: the MCP acts as the
owner's own account, and that is what lets a `ready-for-dev` label from this session count
as a person's. If it returns any other login, apply no `ready-for-dev` and merge nothing;
tell the owner.

For the call that does each task, read [`github-mcp.md`](github-mcp.md).

## 1. Parse the arguments into an issue set

| Form | Meaning |
|---|---|
| `1114+`, `1114 onwards`, `from 1114` | every **open issue** (not PR) numbered ≥ 1114 |
| `1114-1120` | open issues 1114 through 1120 inclusive |
| `1114 1116 #1119` | exactly those issues |
| `max 3` / `3 in flight` | at most 3 issues with an implementation run or open PR at once (default **2**) |
| `no-merge` | do everything except merge; stop at the gate (§7) and report |

List the set with `list_issues` (`state: OPEN`, `orderBy: CREATED_AT`, `direction: DESC`,
`fields: [number, title, labels, assignees]`), paging until the numbers fall below the start
of the range, then keep the numbers in the range. Don't use `search_issues` for this: it is
a natural-language search, not GitHub's `is:open` query syntax. For an open-ended
range (`1114+`), take the set as it stands now, and add issues created later only if they
are sub-issues or follow-ups you created for an issue in the set. Tell the owner the set
you resolved before you label anything.

Skip, and report as skipped, an issue labelled `needs-human-input`, `wontfix`,
`question` or `blocked`, or assigned to someone other than the owner, unless the owner
named it explicitly.

## 2. Read every issue before you order them

For each issue read the body, all comments, labels, sub-issues, and linked PRs
(`issue_read` with methods `get`, `get_comments`, `get_sub_issues`, `get_labels`;
`closed_by_pull_requests` or `search_pull_requests` for the PR). Classify it:

| State | Signal | Next label |
|---|---|---|
| Unclear | open questions, no acceptance checks, contradictory comments | `needs-elaboration` |
| Architectural | the issue asks a design question or weighs alternatives | `architecture-discussion` |
| Clear, unplanned | no `<!-- claude-plan -->` comment | `needs-plan` |
| Planned | a `<!-- claude-plan -->` comment, and no comment after its last update that changes what the issue asks | `ready-for-dev` |
| In flight | an open PR that closes it | follow the PR (§5) |
| Done | a merged PR, or closed | nothing |

A small, obvious issue (a one-line fix with explicit acceptance checks) may skip
`needs-plan`. Anything that touches more than one component gets a plan first: the
implement run has a hard **turn limit** (80 turns, the `--max-turns` of
`claude-implement.yml`) and leans on the plan to stay inside it. An issue too big for the
turn limit gets split (§5), never a higher limit.

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

Apply labels with `issue_write` (method `update`). A PR is labelled the same way, by its
number: `update_pull_request` has no labels field. Before you use a label for the first
time in a session, read its workflow (`grep -rn "github.event.label.name" .github/workflows/`)
and its row in the AGENTS.md table under "A label can start a workflow run": the table says
which runs remove their own label.

**Writing labels.** `issue_write` replaces the whole label list, and the workflows change
labels while they run. A list you read minutes ago can undo their changes, and putting
back a label that a run already removed starts that run again. So every label write is
three calls:

1. **Re-read** the labels with `issue_read` `get_labels` immediately before the write,
   never from an earlier read, a check-in, or your notes.
2. **Write** that fresh list plus the label you add, or minus the one you remove, and
   nothing else. A label that is on the issue already starts nothing when you write it
   again, since GitHub sends `labeled` only for a label the write adds. So the fresh list
   is safe as it is, and a stale one is not.
3. **Check** with `get_labels` again. If a label someone else added in the moment between
   1 and 2 is now missing, add it back with the same three steps; if it is one of the
   self-removing labels, leave it off and tell the owner.

Change one label per write. To add two labels, write twice.

**`ready-for-dev`.** AGENTS.md says a bot cannot apply it, and that this skill is the
exception: the owner delegates the label to this session. The GitHub MCP acts as the
owner's account (§0), so the label should count as a human's. Verify it on the first one:
a few minutes after you label, list the runs of `claude-implement.yml` (`actions_list`,
`list_workflow_runs`) and check that the newest run for that issue is running, not
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
| Plan comment written | read it; if it is wrong or too big for the turn limit, comment and re-label `needs-plan`, or split the issue (below); else `ready-for-dev` when a slot is free |
| `architecture-discussion` added `needs-human-input` | put the open question to the owner, with your recommendation, and wait |
| PR still a draft with `needs-human-input` | read the visual-check report; fix it if small (§6), else ask the owner |
| Unresolved review comments, or a Vercel preview check ❌/🟠 that names a real gap | add `agent-review` |
| CI red | read the failing job log (`get_job_logs`); a failure this PR caused → a PR comment naming it plus `agent-review`, or fix it yourself (§6) |
| PR conflicts with `main` (`mergeable_state: dirty`) | `update_pull_request_branch`; if GitHub can't merge it, merge `main` into the branch locally, resolve, validate, push |
| A label started no run | read `.github/workflows/README.md`: a PR with conflicts gets no run at all, and a PR branch with an old copy of a workflow file fails at startup. Bring the branch up to date with `main` before you add the label again |
| `agent-error:max-turns` | read the failure comment, split the issue in two sub-issues (state change / UI change is the usual cut), plan each, then `ready-for-dev` each |
| any other `agent-error:<reason>` | read the comment and the log (`get_job_logs`); re-run once by re-labelling if the run died before the agent did any work; otherwise report it |

**Splitting an issue.** Create the sub-issues with `issue_write` `method: create` and
`parent_issue_number`, each with its own acceptance checks and the part of the parent's
plan that applies to it. They join the issue set. Tell the owner about the split when you
make it.

## 6. Fixing things yourself

Prefer a label: the workflows carry the repo's checks and its browser verification. Fix
in this session only what is small (a lint error, a failing assertion the diff explains,
a conflict) or what the same workflow has already failed on once. Then follow "Fixing
Existing PRs" and "Validation" in AGENTS.md.

## 7. Merge gate

Merge a PR only when **all** of these hold on its current head commit:

1. It is not a draft, and no `needs-human-input`, `visual-check` or `agent-review` label
   is pending.
2. CI `test`, `typecheck` and `build` are green (`get_check_runs`), and the Vercel
   deployment succeeded (`get_status`).
3. `## Visual Verification` holds a real report, not "Pending.", and it covers and passes
   each acceptance check of the issue. A `## Dev Server Issues` section stops the merge.
4. The Vercel preview check comment is ✅, or its concern is one you checked and dismissed
   in a PR comment that says why.
5. No review thread is unresolved (`get_review_comments`), and `mergeable_state` (`get`)
   is `clean`.
6. You read the diff yourself (`get_diff`). It does what the issue asks and nothing unrelated, new
   behaviour has tests, and no test was skipped or deleted. If you would not approve it,
   don't merge it: say what is wrong in a PR comment and add `agent-review`.
7. The body still has `Closes #<issue>`.

Then call `merge_pull_request` with `merge_method: squash`, `expectedHeadSha` set to the
head SHA you checked (so a later push can't merge unchecked), and a `commit_title` of the
form `<Area>: <summary> (#<pr>)`, in the style of `git log --oneline main` (for
example `Practice table: a Load deck picker of its own (#1112)`). Confirm the issue
closed, and close it with `issue_write` (`state: closed`, `state_reason: completed`) if
not. Unsubscribe from the PR (`unsubscribe_pr_activity`).

After a merge, every other open PR in the set is behind `main`: update its branch before
its next gate check (`update_pull_request_branch`).

With `no-merge`, stop at the gate and list the PRs that pass it.

## 8. Reporting

Post to the owner only when something changes state or needs them, in one line:

```
#1114 merged (#1121) · #1115 PR #1122 in visual check · #1116 planning · #1117 waiting on you: <question>
```

Ask the owner only for decisions that are theirs: product behaviour the issue leaves
open, a design choice from `architecture-discussion`, a split that changes scope, or a PR
that fails the gate twice. Decide everything else, and say what you decided.

When the set is done, cancel pending check-ins and send a final table: issue, outcome,
PR, and anything left for the owner.

## Never

- Skip, disable or delete a test to get CI green.
- Push to `main` directly, or force-push a branch you did not create.

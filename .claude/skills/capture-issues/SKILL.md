---
name: capture-issues
description: Collect the owner's ideas over several messages, then file each one as a GitHub issue.
disable-model-invocation: true
argument-hint: "[first ideas] [go]"
---

# Capture ideas as issues

The owner (iftheshoefritz) types ideas, one or more per message, over several messages.
You collect them, and when the owner says **go**, you file each idea as an issue. The
job is **capture**: the owner's notes go to a place where a later session, a workflow, or
the owner picks them up. An issue does not have to be complete. Later steps fill it in:

- `needs-elaboration` starts a run that answers the questions in the issue.
- `architecture-discussion` starts a run that weighs a design.
- `needs-plan` starts a run that writes the plan.

The owner, or `/drive-issues`, applies those labels later. You file issues only.

The capture is **done** when every idea is an issue on GitHub, or a comment on an issue
that already covers it.

Arguments: `$ARGUMENTS`

## 0. Tools: the GitHub MCP, not `gh`

This skill runs in a cloud session, the same kind as `/drive-issues`. In a cloud session
the `gh` CLI has no GitHub token. Do every GitHub read and write with the GitHub MCP tools
(`mcp__github__*`), and load them with `ToolSearch` if they show only as deferred names.
[`.claude/github-mcp.md`](../../github-mcp.md) lists the call for each task.

## 1. Collect

Every message from the owner after the invocation is an idea, until the owner says
**go** (or "done", "that's all"). The arguments and any ideas the owner typed earlier in
this session, since the last capture, count too. If the arguments end with `go`, skip to §2.

Reply to each message with one line: the count of ideas so far. Keep the code and GitHub
untouched while you collect: the next message often changes or adds to an earlier idea.

## 2. Group the ideas

One message can hold several ideas, and one idea can span several messages. A later
message that corrects an earlier one replaces it. Make one issue per idea. Two unrelated
ideas in one message become two issues.

## 3. Look up enough to file it

Run `git fetch` and read `origin/main`. The owner tests the deployed version, and a local
branch is often behind it. For each idea:

1. Find the page and the component it refers to. Unless the owner names another page, an
   idea refers to the practice table (`/decks/practice`).
2. Use the terms of `docs/ubiquitous-language.md` in the title and the body.
3. Search the open issues for the same idea. If an open issue covers it, add the owner's
   note as a comment on that issue, and make no new issue. Link related issues by number.

Stop the lookup when you can name the thing the idea is about. The plan run does the deep
reading of the code.

## 4. Write the issue

Write in ASD-STE100 Simplified Technical English, like the issues before it: short
sentences, active voice, one word for one meaning.

Title: `<Area>: <summary>`, such as `Practice table: show a mission's span between its
points and its quadrant icon`. An idea that asks for a design, not a change, gets the
title `Explore: <question>`.

Body:

- `## Owner's notes`: the owner's words for this idea, quoted as typed. This section is
  the record. Change nothing in it.
- `## Problem`: what the owner sees now, and what they want instead, as far as the notes say.
- `## Where in the code`: the files and components you found, if you found them.
- `## Acceptance checks`: the checks the notes make clear, such as a URL and the result
  to see on it. Leave this section out when the notes do not make any check clear.
- `## Open questions`: each thing the notes leave open, with your recommendation if you
  have one. The `needs-elaboration` run answers the questions in this section.

Create the issue with `issue_write` `method: create` and an empty label list. Labels
start workflows (AGENTS.md, "A label can start a workflow run"), and the owner starts them.

Create every issue as soon as it is written. Put an open question in the issue, not to
the owner. Ask the owner only when you cannot tell what an idea is about, so you cannot
write its title.

## 5. Report

The owner reads each issue on GitHub, so report one line per issue: its number and its
title. Add a line for each comment on an existing issue. After the report, go back to §1:
the next message from the owner starts a new collection.

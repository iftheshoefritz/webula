---
name: capture-issues
description: Collect the owner's ideas over several messages, then write each one up as a GitHub issue.
disable-model-invocation: true
argument-hint: "[first ideas] [go]"
---

# Capture ideas as issues

The owner (iftheshoefritz) types ideas, one or more per message, over several messages.
You collect them, and when the owner says **go**, you turn each idea into an issue that a
workflow agent can plan and implement without the owner in the room. You write issues
only. The owner decides when work starts, with a label or with `/drive-issues`.

The capture is **done** when every idea is an issue on GitHub or waits on a question
to the owner.

Arguments: `$ARGUMENTS`

## 0. Tools: the GitHub MCP, not `gh`

This skill runs in a cloud session, the same kind as `/drive-issues`. In a cloud session
the `gh` CLI has no GitHub token. Do every GitHub read and write with the GitHub MCP tools
(`mcp__github__*`), and load them with `ToolSearch` if they show only as deferred names.
[`../drive-issues/github-mcp.md`](../drive-issues/github-mcp.md) lists the call for each
task. To find issues that cover an idea already, use `search_issues`: it is a
natural-language search, which suits a duplicate check.

## 1. Collect

Every message from the owner after the invocation is an idea, until the owner says
**go** (or "done", "that's all"). The arguments and any ideas the owner typed earlier in
this session, since the last capture, count too. If the arguments end with `go`, skip to §2.

Reply to each message with one line: the count of ideas so far. Keep the code and GitHub
untouched while you collect: the next message often changes or adds to an earlier idea.

## 2. Group the ideas

One message can hold several ideas, and one idea can span several messages. A later
message that corrects an earlier one replaces it. Make one issue per change that a single
pull request can deliver. An idea that is two independent changes becomes two issues.

## 3. Ground each idea in the code

Run `git fetch` and read `origin/main`. The owner tests the deployed version, and a local
branch is often behind it.

For each idea:

1. Find the components, reducers and tests it touches. Unless the owner names another
   page, an idea refers to the practice table (`/decks/practice`).
2. Read `docs/ubiquitous-language.md`, and use its terms in the issue.
3. Search the open and recently closed issues and pull requests for the same idea. If an
   open issue covers it, add the new detail as a comment on that issue, and make no new
   issue. Link related issues by number in the body.

## 4. Sort the questions

A question that changes **what** to build goes to the owner. A question about **how** to
build it is for the implementer: write your recommendation into the issue and move on.

Ask all owner questions together, at the end of the turn, each with your recommendation.
Create the issues that have no owner question at once, without waiting for the answers.
Create each of the other issues as soon as its answers arrive. If the owner says to leave
a question open, put it in an `## Open questions` section of the issue.

## 5. Write the issue

Write in ASD-STE100 Simplified Technical English, like the issues before it: short
sentences, active voice, one word for one meaning.

Title: `<Area>: <summary>`, such as `Practice table: show a mission's span between its
points and its quadrant icon`. An idea that asks for a design, not a change, gets the
title `Explore: <question>`.

Body of a change:

- `## Problem`: what the owner sees now, and why it is wrong. For a bug, the steps that
  show it.
- `## What to change`: the files, functions and constants, the target behaviour, and what
  stays as it is.
- `## Acceptance checks`: the list that `claude-visual-check.yml` runs in the browser,
  plus the Jest tests to add or change. Each check names a URL such as
  `/decks/practice?fixture=1&reset=1`, a viewport, a `data-testid` or `data-zone` to look
  at, and the result to see. Follow "Browser checks" in AGENTS.md.

Body of an `Explore:` issue: `## The idea`, `## Related issues`, and
`## Questions the proposal must answer`.

The bar for a body: a planning agent with only the issue and the repository can write a
plan from it, and the visual check can pass or fail each acceptance check.

Create the issue with `issue_write` `method: create` and an empty label list. Labels
start workflows (AGENTS.md, "A label can start a workflow run"), and the owner starts them.

## 6. Report

The owner reads each issue on GitHub, so report one line per issue: its number and its
title. Add a line for each comment on an existing issue, then the open questions. After
the report, go back to §1: the next message from the owner starts a new collection.

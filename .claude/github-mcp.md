# GitHub MCP calls

The skills that run in a cloud session, such as `drive-issues` and `capture-issues`, do
their GitHub reads and writes with the GitHub MCP tools (`mcp__github__*`), because `gh`
has no token there. The owner and repo for every call are `iftheshoefritz` and `webula`.

| To | Call |
|---|---|
| list open issues | `list_issues` with `state: OPEN` (issues only, no PRs; paginate with `after`) |
| read an issue | `issue_read` with `method` `get` (includes `closed_by_pull_requests`), `get_comments`, `get_sub_issues`, `get_parent`, `get_labels` |
| set labels on an issue **or a PR** | `issue_write` `method: update`, `issue_number` = the issue or PR number, `labels` = the **full** new list (it replaces the list, so read the labels again right before the write; `drive-issues` §4, "Writing labels", gives the full procedure) |
| create an issue | `issue_write` `method: create`, with `title`, `body` and an empty `labels` list |
| find issues about an idea | `search_issues`, a natural-language search, not GitHub's query syntax |
| create a sub-issue | `issue_write` `method: create` with `parent_issue_number` (`sub_issue_write` only links issues that already exist) |
| close an issue | `issue_write` `method: update`, `state: closed`, `state_reason: completed` |
| comment on an issue or PR | `add_issue_comment` |
| find the PR for an issue | `issue_read` `get` → `closed_by_pull_requests`, or `search_pull_requests` with `repo:iftheshoefritz/webula is:pr "#<n>" in:body` |
| read a PR | `pull_request_read` with `method` `get` (draft, `mergeable_state`, head SHA, body), `get_diff`, `get_files`, `get_check_runs` (CI jobs), `get_status` (commit statuses, Vercel), `get_comments`, `get_review_comments` (threads, resolved or not), `get_reviews` |
| mark a PR ready, edit title or body | `update_pull_request` (it has **no** labels field) |
| bring a PR up to date with `main` | `update_pull_request_branch` with `expectedHeadSha` |
| list workflow runs | `actions_list` `method: list_workflow_runs`, `resource_id: claude-implement.yml` (or another workflow file), `workflow_runs_filter: {event: issues}` for issue-label runs |
| read why a run failed | `actions_list` `list_workflow_jobs` for the run, then `get_job_logs` with `job_id` (or `run_id` + `failed_only: true`), `return_content: true`, and a `tail_lines` of 300 or more: the `"type": "result"` record that says why it stopped is at the end |
| merge | `merge_pull_request` with `merge_method: squash`, `commit_title`, `expectedHeadSha` |

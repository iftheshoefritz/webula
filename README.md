This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Card Data Scripts

### `scripts/extract_card_options.sh`

Extracts unique `Class` and `Species` values from the card data TSV and updates the hardcoded option lists in `src/lib/missionRequirements.ts`. Run this whenever the card data file is updated:

```bash
bash scripts/extract_card_options.sh
```

## GitHub Actions / Agent Workflow

This repository uses label-driven automation to trigger Claude AI workflows.

### Label → Action Map

| Label | Applies to | Workflow file | What Claude does |
|---|---|---|---|
| `needs-elaboration` | Issues | `.github/workflows/claude-triage.yml` | Reads the issue, answers open questions, appends an `## Implementation Plan` section, then removes the label |
| `ready-for-dev` | Issues | `.github/workflows/claude-implement.yml` | Implements the feature/fix, runs tests, visual verification, creates a branch, opens a PR |
| `architecture-discussion` | Issues | `.github/workflows/claude-architecture.yml` | Deep-dives the codebase, writes an `## Architectural Analysis` section, adds `needs-human-input` label |
| `agent-review` | Pull Requests | `.github/workflows/agent-review.yml` | Addresses all unresolved review comments (code changes or replies), commits, pushes, removes label |

### Auto-labelling

`.github/workflows/needs-elaboration-label.yml` watches for issue comments and automatically adds `needs-elaboration` **if and only if**:
- The comment author is `github.repository_owner`, **and**
- The comment body starts with `Elaborate:`, `Clarify:`, or `Refine:`

This means the triage workflow can be triggered via a comment shorthand without manually applying the label.

### Access Control

On GitHub, adding/removing labels on issues and PRs requires at minimum **Triage** repository access. See: [Repository roles for an organization](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization#permissions-for-each-role).

For personal repositories, collaborators are added individually via Settings → Collaborators.

As of the time this was written, the only collaborator on this repo is the owner (`iftheshoefritz`). **Only the repo owner can trigger any of these label-driven workflows.**

The auto-labelling workflow adds a second layer of defence by explicitly checking `github.event.comment.user.login == github.repository_owner`, so even if a collaborator with Triage access were added in future, they still couldn't trigger triage via comment shorthand.

### Security Implications

The label-triggered workflows run Claude with `--dangerously-skip-permissions` and broad GitHub permissions (`contents: write`, `pull-requests: write`, etc.). Restricting label access to trusted collaborators only is therefore important — a malicious label addition could cause Claude to push code or open PRs.

GitHub does **not** provide a built-in way to restrict which users can apply specific labels (only role-level access control exists). If collaborators are added in future, consider:
- Keeping their role at **Read** if they only need to view the repo
- Only granting **Triage** or higher to fully trusted contributors

### Relevant References

- [GitHub Actions: Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#issues)
- [GitHub repository roles and permissions](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)
- [Managing access to personal repository collaborators](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories/inviting-collaborators-to-a-personal-repository)
- [`anthropics/claude-code-action` — the Action used in all workflows](https://github.com/anthropics/claude-code-action)
- [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code/overview)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

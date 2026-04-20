# AGENTS.md

This file provides guidance to agents like Claude Code, OpenCode, and Amp when working with code in this repository.

## Project Overview

Webula is a Star Trek CCG (Customizable Card Game) 2nd Edition deck builder and card search application. It allows users to:
- Search and filter cards from a card database
- Build decks with missions, dilemmas, and draw pile cards
- Save/load decks to Google Drive or browser local storage
- Export decks in LackeyCCG format

## Commands

```bash
yarn dev        # Start development server (http://localhost:3000)
yarn build      # Production build
yarn lint       # Run ESLint
yarn test       # Run all tests
yarn test:watch # Run tests in watch mode
```

**Note:** This project uses yarn as the package manager. Always use `yarn` instead of `npm`.

## Architecture

### Tech Stack
- Next.js 14 with App Router
- React 18 with TypeScript and JavaScript (mixed codebase)
- Tailwind CSS for styling
- NextAuth.js for Google OAuth authentication
- Jest with React Testing Library for tests

### Key Data Flow
1. Card data loaded from `/public/cards_with_processed_columns.txt` (TSV format)
2. `useDataFetching` hook parses TSV with d3 and normalizes data
3. `useFilterData` hook applies search queries using `search-query-parser`
4. Deck state managed with `useLocalStorage` hook for persistence

### Main Pages
- `/` (`src/app/page.tsx`) - Simple card search interface
- `/decks` (`src/app/decks/page.tsx`) - Full deck builder with search, deck management, and analytics

### Search Query Syntax
The search supports advanced query syntax defined in `src/lib/constants.js`:
- Text fields: name, type, affiliation, skills, keywords, gametext, etc.
- Range fields: cost, span, points, integrity, cunning, strength, etc.
- Abbreviations supported (e.g., `n:` for name, `a:` for affiliation, `sk:` for skills)

### Deck Structure
Decks are organized into three piles:
- `mission` - Mission cards
- `dilemma` - Dilemma cards
- `draw` - All other cards (personnel, ships, events, etc.)

Card pile assignment determined by `cardPileFor()` in `src/app/decks/deckBuilderUtils.ts`

### Google Drive Integration
- API routes in `src/app/api/drive/` handle CRUD operations
- Files stored in `appDataFolder` (hidden app-specific folder)
- Token management via NextAuth.js with automatic refresh

## Card Data Scripts

### `scripts/extract_card_options.sh`

Extracts unique `Class` and `Species` values from `public/cards_with_processed_columns.txt` and writes them as hardcoded TypeScript constants into `src/lib/missionRequirements.ts` between sentinel comments.

**When to run:** After updating `public/cards_with_processed_columns.txt` with new card data.

```bash
bash scripts/extract_card_options.sh
```

The script:
1. Reads the TSV card data file
2. Extracts sorted unique non-empty values for `Class` and `Species` columns
3. Overwrites the `SHIP_CLASSES` and `SPECIES` constant blocks in `src/lib/missionRequirements.ts`

The script is idempotent — safe to re-run after every card data update.

## PR Requirements

All PRs from automated agents MUST include:
- Visual verification via `yarn dev` + `agent-browser` before opening the PR
- A `## Visual Verification` section in the PR body describing which pages were visited and what was confirmed
- If the dev server or browser fails, a `## Dev Server Issues` section with the full error output (do NOT skip or omit this step)

When verifying changes to the deck builder (`/decks`), always visit `/decks?fixture=1` — this loads a pre-populated fixture deck (see `src/lib/practiceDeck.ts` and the fixture handling in `src/components/DeckBuilderClient.tsx`) so you can verify UI that depends on cards being present (analysis tabs, card lists, mission selectors, charts, etc.). Visiting `/decks` alone shows only the empty state. The fixture URL bypasses authentication and localStorage, so no login or saved deck is required.

## Fixing bugs
When asked to fix a bug do your best to write a test that fails without the bug fix. Weigh up the cost and brittleness of writing the test and comment in the PR with the circumstances that made you feel like you couldn't write a useful test. 

## Fixing Existing PRs

When asked to fix or update an existing pull request:
1. Check out the PR's existing branch (do NOT create a new branch from main).
2. Make targeted changes on top of the existing commits.
3. Run `yarn test` and fix any failures.
4. Commit with a message like `fix: <short description> (follow-up for #<pr-number>)`.
5. Push to the same branch — this will update the open PR automatically.
6. Do NOT open a new PR unless explicitly asked.

### Fallback: no push permission to the original branch

If you do not have permission to push to the original branch:
1. Create a new branch based on the original PR's branch (NOT from main).
2. Commit your changes there.
3. Open a new PR targeting the original PR's branch as the base (not main).
4. Describe the new PR as a fix/follow-up for the original PR number.

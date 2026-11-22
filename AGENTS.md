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
yarn typecheck  # Type-check every file, the tests too
yarn test:watch # Run tests in watch mode
```

**Note:** This project uses yarn as the package manager. Always use `yarn` instead of `npm`.

## Architecture

### Tech Stack
- Next.js 14 with App Router
- React 19 with TypeScript
- Tailwind CSS 4 for styling, through `@tailwindcss/postcss` (`postcss.config.js`). The theme stays in `tailwind.config.js`, which `src/styles/globals.css` loads with `@config` (#375)
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

Both pages show search results as the text list by default, on every screen. The deck builder's
image/list toggle saves the choice under `search-view-mode-v2` (`useSearchViewMode`), and `/` reads
the same key with no toggle of its own (#1453). The old `search-view-mode` key is not read.
`/` shows the hover image only with a fine pointer (`useFinePointer`, #1466): on a touch device a
tap fires a `mouseenter` with no `mouseleave`, so a preview would stay open.

With a fine pointer, the deck builder's hover image over a grid card of the image view is sized from
that card (`gridHoverImageWidth` in `SearchResults.tsx`, #1459): as large as the native image and the
window's height allow, and none at all when that is not 1.25 times the card (`previewEnlarges` of
#1458), as in the 1-column layout below `lg`. The grid card's own click and right-click still add
and remove. List view, and a touch device, keep the 230 px image.

### Search Query Syntax
The search supports advanced query syntax defined in `src/lib/constants.ts`:
- Text fields: name, type, affiliation, skills, keywords, gametext, etc.
- Numeric fields: cost, span, points, integrity, cunning, strength, etc. The code calls this class "numeric", never "range", because `range` is one of its fields (#855).
- Abbreviations supported (e.g., `n:` for name, `a:` for affiliation, `sk:` for skills)

### Ubiquitous Language

`docs/ubiquitous-language.md` maps the terms of the *Star Trek* CCG Second Edition
Rulebook to the identifiers in this codebase. Read it before you name a new type, a
new zone, a new field, or a UI label, and add a row to it when you model a game
concept the code does not model yet.

The file also lists the places where the code uses a word differently from the
rulebook, such as `pile`, `draw`, `deck` and `reportsto`.

### Deck Structure
Decks are organized into three piles (see `docs/ubiquitous-language.md`):
- `mission` - Mission cards
- `dilemma` - Dilemma cards
- `draw` - All other cards (personnel, ships, events, etc.)

Card pile assignment determined by `cardPileFor()` in `src/app/decks/deckBuilderUtils.ts`

### Google Drive Integration
- API routes in `src/app/api/drive/` handle CRUD operations
- Files stored in `appDataFolder` (hidden app-specific folder)
- Token management via NextAuth.js with automatic refresh

The NextAuth session is a JWT of 90 days, rolled forward once a day by an active user
(`session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE, updateAge }` in `authOptions.ts`, #1660). A
Google refresh that fails (no refresh token, or one the OAuth app's "Testing" status expired after 7
days) does not sign the caller out: the `jwt` callback keeps the token and its email with
`error: 'RefreshAccessTokenError'`, and tries again an hour later (`refreshRetryAt`). The routes that
need only the email, the playtest and Championship routes, keep answering; a Drive call with the stale
access token still fails.

### Share links

`/api/share` (`src/app/api/share/route.ts`) stores each share in Upstash Redis
(`src/lib/shareStore.ts`, #1445), under `share:<id>` with a 30-day TTL. `POST { content, title }`
answers `{ id }`, a random 10-character id, and `GET ?id=` answers `{ content, title }`. The
content is capped at 256 KB (413 `bad_request`). A store failure answers 502 `upstream_unreachable`,
an unknown or expired id 404 `not_found` (`src/lib/shareErrors.ts`). The Vercel Marketplace
integration named the env vars with the prefix `SHARES`, so the route reads
`SHARES_KV_REST_API_URL` and `SHARES_KV_REST_API_TOKEN`, and falls back to
`UPSTASH_REDIS_REST_*` and `KV_REST_API_*` (`shareStoreCredentials`). For a local `yarn dev` that shares, run
`vercel env pull .env.development.local`. The tests mock the store, so they need no access.

### Playtest cards

`src/lib/playtestStore.ts` (#1612, #1644) keeps the playtest sets in testing in the same Upstash
Redis database as the share links, through `shareStoreCredentials`, with no TTL, so a local check
needs `vercel env pull .env.development.local` too. Its client reads strings as they are
(`automaticDeserialization: false`). A playtest set is named by the `Set` column of its TSV: letters,
digits, `_`, `-` and `.` (`isPlaytestSetName`). Its key, `<key>` below, is the name lowercased
(`playtestSetKey`), and so is the `set` of its rows.

| Key | Value |
|---|---|
| `playtest:sets` | The sets in testing, a Redis set of their names as written |
| `playtest:set:<key>:version` | A number, bumped by every upload of the set |
| `playtest:set:<key>:uploadedAt` | An ISO time, written with the version |
| `playtest:set:<key>:cards` | The normalised TSV of `normalisePlaytestTsv` |
| `playtest:set:<key>:img:<ImageFile>` | One JPEG, base64 |
| `playtest:emails` | The playtesters of every set, a Redis set of lowercased emails |

A publish (`publishSet`) writes the set's cards and time and bumps its version before it lists the set
in `playtest:sets`, so a reader never sees a version whose cards or images are missing. A replace of
another set removes that set only after the new one is listed; a re-upload under the set's own name
bumps its version and deletes only the images the new TSV no longer names. On first use the store
moves the keys of before #1644 (`playtest:version`, `playtest:uploadedAt`, `playtest:cards`,
`playtest:img:<ImageFile>`) to the set named by the single `Set` value of their TSV, version kept,
and deletes them; with no `Set` value or several it moves nothing, and the admin status's
`legacyError` says so.

A playtester (`isPlaytester` in `src/lib/playtestAccess.ts`) is an email in `playtest:emails` or an
owner listed in `PLAYTEST_ADMIN_EMAILS`, comma-separated, a server-only env var (never
`NEXT_PUBLIC_`). The email comes from the NextAuth JWT (`callerEmail`, `src/lib/callerEmail.ts`).
`GET /api/playtest/cards` answers `{ sets: [{ name, version, tsv }] }`, by name, `{ sets: [] }` before
the first upload, with `Cache-Control: private, no-cache`. `GET /api/playtest/images/<key>/<ImageFile>.jpg`
answers the JPEG of a set in testing with `private, max-age=31536000, immutable`; the client adds
`?v=<the set's version>`, which the route ignores. Both answer 404 to anyone who is not a playtester, a
signed-out caller too, and to an unknown or malformed set or image, so they never reveal that playtest
cards exist; a store failure answers 502 `upstream_unreachable`. Every answer is `private` and carries
`X-Robots-Tag: noindex`.

On the client each playtest row keeps its own `set`, and `isPlaytestCard` tests the `pt-` prefix of
its `collectorsinfo`. `cardImageUrl` reads the version of the row's set from the map
`PlaytestCardsProvider` sets (`setPlaytestImageVersions`); a row of a set not in testing, or the
`set: 'playtest'` of a row saved before #1644, gets `CardMissing.jpg`. An answer of the old
`{ version, tsv }` shape is no cards. `usePlaytestCards().sets` lists the sets, and a playtester's Set
picker in `SearchPills` lists one option per set, by name, above the real sets. `filterCards` matches
the `set` of a playtest row on its whole value, so `set:a` finds no `testseta` card.

The owners upload at `/playtest/admin` (#1613), a server page that reads the JWT
(`pageCallerEmail`): a signed-out visitor gets a "Sign in with Google" button
(`data-testid="playtest-admin-sign-in"`), a signed-in non-owner the 404 page, and an owner
`PlaytestAdminClient`. The browser reads `images.zip` with `readZip` (`src/lib/zipReader.ts`, stored
and deflated entries, no zip64, no encryption, no package) and builds the preview with
`playtestPreview` (`src/lib/playtestUpload.ts`): the set (`playtest-preview-set`), the cards by type,
the errors, the warnings, the `ImageFile`s with no `<ImageFile>.jpg` in the zip and the unused images.
An error disables Publish, which sends the images of the set in batches under 3 MB of JSON
(`imageBatches`; a Vercel function takes at most 4.5 MB), then the TSV. The preview offers "New set" or
"Replace <set>" over the sets in testing (`playtest-replace-choice`, #1645), with the set of the TSV's
own name pre-selected when it is in testing, so a corrected re-upload is one click. The status
(`playtest-status`) lists every set in testing, one `playtest-status-set` row each (`data-set`): name,
version, upload time, cards and images, and a Remove (`playtest-status-remove`) behind an inline confirm
(`playtest-status-remove-confirm`) that calls `DELETE sets`. The owner-only routes under `/api/playtest/admin/` answer 404 to anyone else, with
`private, no-store`, and write nothing on an error: `GET status` (`{ sets: [{ name, version,
uploadedAt, cards, images, cardNames, collectorsInfo }], legacyError, emails }`, counted from the
stored TSVs), `POST images` (`{ set, images: [{ imageFile, base64 }] }`), `POST cards` (the TSV as
text, with `?replace=<set>` to replace a set in testing and no `replace` for a new set), `DELETE
sets` (`{ name }`, removes a set, its cards and its images), and `GET`/`POST`/`DELETE emails`
(`{ email }`). `POST cards` runs `checkPlaytestUpload` again with the real names: the rows name exactly
one valid `Set`, not a real set's value nor `playtest`; a new set is not in testing yet; a replace
names a set in testing, and the new name is no other set in testing; and no card name or
`CollectorsInfo` is one of another set in testing (the replaced set excepted), so the deck keys stay
`pt-<n>`. It then checks the store holds every image under the set, and calls `publishSet`.
In development, `/playtest/admin?fixture=1` renders the page with an in-memory store of two sets,
`TestSetA` and `TestSetB` (`src/lib/playtestAdminFixture.ts`); production ignores it.

A deck loaded from Lackey text drops a line whose card the card data lacks, a playtest card for a
user who is not a playtester among them, as before, and a dismissible warning,
`data-testid="deck-missing-cards-warning"`, says how many cards were not found ("3 cards in this deck
were not found", `missingCardsMessage`, #1616): in the deck builder after any load of `useDeckState`,
and on the practice table after a Load deck from Drive or a bot pile. `deckFromTsvWithMissing` and
`missingCardsOf` (`deckBuilderUtils.ts`) count the copies, by pile header, so a load of some piles
counts only theirs. A `?share=` or `?driveFile=` deck waits for `usePlaytestCards().settled` (#1615), so a
playtester's own deck loads with its playtest cards.

A device that loaded a non-empty `sets` for a signed-in user keeps `localStorage['playtest-device']
= '1'` (`src/lib/playtestDevice.ts`, #1660), never cleared, a sign-out included. On that device,
signed out and online, `PlaytestSignInHint` (`data-testid="playtest-sign-in"`) shows "You may need to
sign in to see playtest cards" and a "Sign in with Google" button, a plain sign-in with no Drive scope
back to the same URL: on the practice table's game menu splash and in every
`deck-missing-cards-warning`. A device without the flag never sees it, and reads no session for it.

No playtest card is ever committed: no name, text, TSV row or image in the repository, a test, a
fixture, an issue or a PR. Tests use invented cards.

## Card Data Scripts

### `scripts/copy_card_data.sh`

Rebuilds `public/cards_with_processed_columns.txt` from `sets/Physical.txt` and
`sets/Virtual.txt` of the LackeyCCG plugin repo
[`eberlems/startrek2e`](https://github.com/eberlems/startrek2e), branch `playable`,
fetched over HTTPS. No local LackeyCCG install is needed. Set `STARTREK2E_REF` to
build from another branch, tag or commit. Run `extract_card_options.sh` after it.

```bash
bash scripts/copy_card_data.sh
```

### `scripts/copy_images.sh`

Downloads into `public/cardimages` the card images that
`public/cards_with_processed_columns.txt` names, from `sets/setimages/general/` of
the same repo. Run it after `copy_card_data.sh`. By default it fetches only the
images that are missing; `--all` downloads every image again. It splits a
`front,back` `ImageFile` into two images, and at the end it lists the images
GitHub does not have.

```bash
bash scripts/copy_images.sh
```

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

### `scripts/deckpadd_to_lackey.js`

Converts trekcc.org DeckPADD deck files to the LackeyCCG deck format that the deck
builder reads. The comment at the top of the script describes both formats and the
command.

`championship-decks/`, at the top of the repository, holds the converted Championship decks,
the decks of the 2026 championship events. It is not under `public/`, and neither its
`index.json` nor a deck file has a public URL (#1327). `index.json` in that folder lists them,
with the event, the player and the trekcc deck ID. When you add a deck file, add its row to
`index.json`. A test fails when `public/` holds a Championship deck file.

The `authorizedUse` field of a row is `true` only when the deck's owner gave Webula
permission to show the deck to every user. Give a new row `false` until the owner
agrees. A deck with `false` is for the users with early access only.

Two API routes serve the folder, and both apply `visibleChampionshipDecks`
(`src/lib/championshipDecks.ts`) to the caller's email from the NextAuth JWT:
`/api/championship-decks` returns the rows the caller may see, and
`/api/championship-decks/<file>` returns the text of a deck the caller may see, and a 404 for
anything else. An early-access user gets every row; any other user, a signed-out user too, only
the `authorizedUse` rows. So an `authorizedUse: false` deck is served only to early-access
users. `outputFileTracingIncludes` in `next.config.mjs` puts the folder into the routes'
function bundle, so check a change to it with `yarn build && yarn start`. The dilemma lab
reads the folder at build time and lists only the `authorizedUse` decks.

`public/beginner-decks/` holds the converted Beginner Decks of trekcc.org, by Lucas
Thompson (https://www.trekcc.org/articles/?viewArticle=2715). `index.json` in that folder
lists them in the order of the article, with the trekcc deck ID, the complexity level (1 to
5), the deck style and the strategy article of each deck. The author gave Webula permission
to show these decks to every user, so every row has an `authorizedUse` of `true`.

The DeckPADD download (`/decklists/?mode=download&deckID=<id>`) needs a trekcc.org
login, and Cloudflare blocks `curl`. Get the files from a browser where the owner
is logged in, with `fetch` inside the page.

## Stats

`scripts/collect_stats.mjs` (#1431) reads GitHub and writes JSON Lines files under `stats/`, at the
top of the repository, outside `public/`, one file per month. It needs `GH_TOKEN` (or `GITHUB_TOKEN`,
or a logged-in `gh`) and `unzip`. `--since` and `--until` are UTC dates, both inclusive; `--until`
defaults to today. Each run costs about two REST requests, its jobs and its log. The `GITHUB_TOKEN`
allows 1,000 an hour, so slice a backfill in Actions with them. A user token allows 5,000 an hour,
and a local run waits for the reset when it reaches the limit, so one local run can backfill
everything. It tries a request again after a 5xx or a dropped connection, and after the last try it
files the run of a log it could not get with no `claude` field. The script writes each day of runs and each month of closed items as soon as it has them,
so a run that stops keeps its finished days and a second run resumes. It asks for no log of a run
older than 90 days, the log retention of GitHub: such a run has no `claude` field. The first run of
the repository is from 2026-03-07. The script prints what it fetched and what it skipped.

```bash
GH_TOKEN=… node scripts/collect_stats.mjs --since 2026-10-28 [--until 2026-10-31] [--repo iftheshoefritz/webula]
```

Every record carries `repository`. Each line is compact JSON, and the lines are sorted, so a second
run over the same window changes no byte.

- `stats/runs/<YYYY-MM>.jsonl`, by the month the run was created: one line per completed workflow
  run that was not `skipped`, keyed by (repository, `run_id`, `run_attempt`), the latest attempt
  when listed. It holds the workflow, event, branch, SHA, `number` (the issue or PR, from
  `pull_requests[]`, or for an `issues` or `issue_comment` run from the log as
  `classify_agent_failure.sh` finds `target`; `null` otherwise), conclusion, times and `jobs`. A
  `claude` field, `{subtype, is_error, num_turns, duration_ms, duration_api_ms,
  total_cost_usd_estimate, models: {<model>: {input_tokens, output_tokens}}}`, is there only when
  the log holds a result record, and that is what "Claude ran" means. The cost is the API-price
  estimate: the workflows run on a subscription token. A run whose log expired has no `claude`.
- `stats/issues/<YYYY-MM>.jsonl`: one snapshot per UTC date, `{repository, date, counts, open_prs:
  {draft, ready}}`. An open issue counts once, under the status label added last
  (`STATUS_LABELS` and `agent-error:*` in `scripts/stats/issueStatus.mjs`), or as `open-with-pr` or
  `open-no-status`. A closed issue counts under its `state_reason`.
- `stats/items/<YYYY-MM>.jsonl`, by the month the item closed: one line per closed issue and per
  merged or closed PR, keyed by (repository, number, kind), with `opened_at`, `closed_at`,
  `state_reason`, `first_label_at`, and `first_linked_pr_at` for an issue, or `merged_at`, `pushes`
  and `ci_runs` for a PR (the CI runs of its branch until it closed; every push starts one with the
  event `push`).

A run or an item already in its month file is not fetched again. The parser, the counting and the
merge are in `scripts/stats/*.mjs`, which use no network, and `src/tests/scripts/collectStats.test.ts`
tests them.

`.github/workflows/stats-recorder.yml` (#1432) runs the script every day at 02:43 UTC over the last
3 days and pushes the result to the branch `stats/update`, which each run rebuilds from `main`. It
opens no pull request (#1791): the owner, or `/drive-issues`, merges `stats/update` when `/stats`
needs new stats. Before it collects, it merges the stats of the previous `stats/update` into the new
branch with `scripts/merge_stats.mjs`, so a day stays on the branch until it merges.
A dispatch with `since` and `until` runs a backfill slice. `.github/workflows/README.md`
describes it.

The page `/stats` (#1417) shows the stats to early-access users: per workflow the runs, the median
and 90th percentile of the duration, the share of runs that did not succeed, and the turns and cost
estimate where Claude ran; per CI job the median and 90th percentile; the median duration by ISO
week; the issue counts per status of the latest snapshot and over time; and the 20 completed issues
slowest from the first label to the close. It reads `/api/stats`, which applies `isEarlyAccessUser`
to the caller's email from the NextAuth JWT and answers 404 to anyone else, a signed-out caller too.
A signed-out visitor sees a "Sign in with Google" button (`data-testid="stats-sign-in"`), a plain
Google sign-in with no Drive scope that comes back to `/stats`; a signed-in user who is not early-access
sees "Use another Google account" (`stats-switch-account`), a sign-out back to `/stats` (#1442).
`src/lib/statsServer.ts` reads the folder, `src/lib/stats.ts` aggregates it (no `fs`), and
`outputFileTracingIncludes` in `next.config.mjs` puts `stats/` into the route's bundle. The page
never reads the files at build time. In development only, `/stats?fixture=1` renders the fixture
aggregates of `src/lib/statsFixture.ts` without the route; production ignores it. The deck actions
menu of the deck builder shows a Stats link to early-access users only.

## Validation

Before you open or update a PR, run all four commands. All four must pass.

```bash
yarn test       # Jest test suite
yarn typecheck  # tsc --noEmit -p . on TypeScript 7 : the types of every file, the tests too
yarn lint       # eslint . : ESLint 9 with the flat config, eslint.config.mjs
yarn build      # next build --webpack : the types of every file, and static page pre-render
```

`yarn test` alone is not enough. It does not check types: `next/jest` compiles
with SWC, which strips the types, so a test with a type error still runs and
passes.

`yarn build` alone is not enough either. It does not lint: Next.js 16 removed
`next lint` and stopped linting in `next build` (#372), so `yarn lint` is the only
lint check. Vercel deploys with `yarn build`, and that step catches two more
classes of error:

1. TypeScript type errors in every file that `tsconfig.json` includes, the tests too.
   Next.js 15 dropped the diagnostics of test files, so a type error in a test
   passed the build, and 103 of them piled up on `main` that way before
   `yarn typecheck` existed (#1062). Next.js 16 runs `tsc` over the whole project.
2. Errors thrown at build time while Next.js pre-renders the static pages.

The two type checks run two versions of TypeScript (#1240). `yarn typecheck` runs
TypeScript 7, the native compiler, from the alias devDependency `typescript-7`
(`"typescript-7": "npm:typescript@^7.0.2"`), by path:
`node node_modules/typescript-7/bin/tsc --noEmit -p .`. Every tool that loads
`typescript` as a library keeps TypeScript 6, the `typescript` devDependency: ESLint
through `typescript-eslint` (which `eslint-config-next` brings), `next build`, which
resolves `typescript/package.json` and runs that package's `tsc`, `ts-node` for
`jest.config.ts`, and the editor plugin `next`. TypeScript 7 has no compiler API, and
`typescript-eslint` throws "does not support TS 7.0" on it. #1270 tracks moving
`typescript` itself to 7 and dropping the alias, once `typescript-eslint` supports it. A
change must pass both checks. Both packages ship a `tsc` bin and yarn links only one of
them into `node_modules/.bin`, so do not rely on a bare `tsc`: run the compiler by its
path, `node node_modules/typescript/bin/tsc` for 6 or
`node node_modules/typescript-7/bin/tsc` for 7.

`yarn build` builds with webpack, `next build --webpack`, and not with Turbopack, the
default of Next.js 16. `@serwist/next` builds the service worker, `public/sw.js`, in a
`webpack` function of `next.config.mjs`, and a Turbopack build refuses a config with a
`webpack` key. `yarn dev` runs on Turbopack: the Serwist plugin is disabled in
development and builds no worker there. So the two bundlers differ. A CSS `@import url(...)`,
for one, must come before every rule under Turbopack, and webpack let it follow the
Tailwind imports.

`yarn lint` runs the ESLint CLI, `eslint .`, and fails on a crash such as
`Error while loading rule` (#370). ESLint is on 9, with the flat config
`eslint.config.mjs`, which imports the flat config of `eslint-config-next/core-web-vitals`
directly. It ignores `.next/`, `public/` (the built `sw.js`), `node_modules/` and
`coverage/`. `eslint-config-next` 16 brings `eslint-plugin-react-hooks` 7, and its React
Compiler rules, `react-hooks/refs`, `react-hooks/set-state-in-effect` and
`react-hooks/preserve-manual-memoization` among them, are at their `eslint-config-next`
defaults, errors (#1302). An `eslint-disable` comment for a rule that reports nothing is a warning.

CI runs the four commands as four parallel jobs, `test`, `typecheck`, `lint`
and `build`, so a red check tells you which one failed. Run them independently while
you work.

Vercel runs two of them in one chain. The `buildCommand` in `vercel.json` is
`yarn typecheck && yarn build`, so a type error stops the deployment before the
build starts. Vercel runs no Jest (#1250): a test failure does not stop a
deployment, and the CI `test` job is the only test gate.

### To read why a workflow run failed

Do not use `gh run view --log`. It truncates a long log and gives no warning
that it did. A run of a Claude workflow writes a large log, and the record that
says why it stopped is the last thing in it, so truncation removes exactly the
part you need. A truncated log looks like a run that died with no message.

Download the log zip from the API instead, the same way
`scripts/classify_agent_failure.sh` does:

```bash
gh api "repos/$REPO/actions/runs/$RUN_ID/logs" > logs.zip
unzip -q -o logs.zip -d logs
find logs -maxdepth 1 -type f -name '*.txt' -print0 | xargs -0 cat > all.log
grep -A4 '"type": "result"' all.log
```

The `subtype` of that result record says why the run stopped, for example
`error_max_turns`. The top-level files in the zip hold the complete log of one
job each. The per-step files in the subdirectories repeat the same lines.

A run that shows no result record never started. `.github/workflows/README.md`
lists every reason, and a common one is a pull request branch that holds an old
copy of the workflow file.

## A label can start a workflow run

A label on an issue or a pull request can start a Claude workflow run. Add a label only
when that run is the thing you want. To describe an issue, write in the body instead.

Before you add a label, find out what it starts:

```bash
grep -rn "github.event.label.name" .github/workflows/
```

Read the workflow that matches your label. The list below holds the trigger labels of
today.

| Label | Target | Workflow | The run removes the label |
|---|---|---|---|
| `ready-for-dev` | issue | `.github/workflows/claude-implement.yml` | no |
| `needs-plan` | issue | `.github/workflows/claude-plan.yml` | yes |
| `needs-elaboration` | issue | `.github/workflows/claude-triage.yml` | yes |
| `architecture-discussion` | issue | `.github/workflows/claude-architecture.yml` | no |
| `agent-review` | pull request | `.github/workflows/agent-review.yml` | yes |
| `visual-check` | pull request | `.github/workflows/claude-visual-check.yml` | yes |

A label that the run does not remove starts the run again when somebody removes it and
adds it back.

`ready-for-dev` is the one exception: the owner applies it. This holds in every kind of
session, an Actions workflow, a cloud session, or a local session. Leave the label off the
issues you create, such as the sub-issues of the issue you work on, and off the issues you
update. When you make an issue that is ready to implement, say so in the issue body.

The label starts the implementation run, and the owner decides when that run starts. A
request to capture or write issues is not a request to start that run. Apply the label only
when the owner tells you to in the session, for named issues. A `/drive-issues` invocation
(`.claude/skills/drive-issues/SKILL.md`) is such an instruction for the issues it names.

A bot account cannot apply the label in any case. A run that a bot starts, such as an agent
in a GitHub Actions workflow, stops at once with "Workflow initiated by non-human actor", and
the repository gets an `agent-error:startup-failure` label for work that never ran.

## PR Requirements

All PRs from automated agents MUST include:
- A smoke check with `yarn dev` + `agent-browser` before you hand the PR on: open the page, take one snapshot, confirm the new element is there, and read the browser console and the dev server log
- A `## Visual Verification` section in the PR body describing which pages were visited and what was confirmed
- If the dev server or browser fails, a `## Dev Server Issues` section with the full error output (do NOT skip or omit this step)

To write a section into the body of a pull request, use `scripts/replace_pr_section.sh`.
Never use `gh pr edit --body`. `--body` replaces the whole body, and an agent that writes
the body again drops parts of it, such as the `Closes #<issue>` line.

```bash
bash scripts/replace_pr_section.sh <pr-number> "## Visual Verification" report.md
```

The smoke check and the full check are two runs. The agent that writes the code does the
smoke check, opens the draft PR with "Pending." in the `## Visual Verification` section,
and adds the `visual-check` label. The `visual-check` label starts
`.github/workflows/claude-visual-check.yml`, which runs the acceptance checks of the issue,
writes the `## Visual Verification` section, and marks the PR ready for review.

A full browser check uses many turns. It ran last inside the implementation workflow, so a
run that hit the turn limit left the section on "Pending." with the code already complete.

When verifying changes to the deck builder (`/decks`), always visit `/decks?fixture=1` — this loads a pre-populated fixture deck (see `src/lib/practiceDeck.ts` and the fixture handling in `src/components/DeckBuilderClient.tsx`) so you can verify UI that depends on cards being present (analysis tabs, card lists, mission selectors, charts, etc.). Visiting `/decks` alone shows only the empty state. The fixture URL bypasses authentication and localStorage, so no login or saved deck is required.

### The minimum screen

The smallest screen the practice table supports is an iPhone SE (2nd generation) in landscape,
667×375 CSS px (`MIN_SCREEN` in `tableScale.ts`). It was the first-generation iPhone SE, 568×320,
before. Some comments and older issues still name 568×320. Read those as the old minimum.

Only the practice route sets `viewport-fit=cover`, through the `viewport` export of
`src/app/decks/practice/page.tsx` (#1383); the root layout's `viewport` export gives every other page
`width=device-width, initial-scale=1`. On an iPhone the table then draws under the home indicator, and
`useSafeAreaInsets` reads the four `env(safe-area-inset-*)` values from a probe element. The bottom row
rises by the bottom inset (the content column's bottom padding grows by it), the page background stays
full-bleed, and `computeTableScale` measures the height above the inset. The other three sides work
the same way (#1384): the content column's padding grows by the inset of each side, and the scale
math (`computeTableScale`, `computeTouchMissionScale`, `desktopMissionSlotBudget`,
`computeDesktopTableScale`, `useAttemptLayout`) gets the left and right insets together as one
number, `insetSides`, and works with the width less it, so `TOUCH_CONTROLS_COLUMN`,
`MENU_BUTTON_GUTTER` and `ATTEMPT_STRIP_GUTTER` stay constants measured from the content edge.
`corner-buttons` and `turn-score-column` move right by the left inset and down by the top inset,
on top of `top-14` under `systemControlsInset`. The fixed overlays take the insets in CSS, as
`env(safe-area-inset-*)` margins or paddings (`safeAreaMargins`, `SAFE_INSET_CSS` in
`useSafeAreaInsets.ts`): the `CardListPanel` box below `PANEL_TOP_INSET` and inside
`VIEWER_TOP_INSET` on each side, the `CardPreview` image and badge, the flat fan and its controls row,
and the game menu splash. The centred modals size themselves with `safeModalWidth` and
`safeModalMaxHeight`. Headless Chromium, a desktop and Android give an inset of 0 on every side, so
there the table draws as before.

The bottom row (the discard, the draw deck, the core, the brig and the dilemma pile, and the closed
hands drawn on top of it) grows on a large screen by one bottom-row scale, `computeBottomRowScale` in `tableScale.ts` (#1465):
half the table scale, never below 1 and never above `BOTTOM_ROW_SCALE_CAP`, 1.75, a pile card of at
most 98×140 px, and never so large that the mission column, at the scale the width of the mission row
allows, stops fitting above the row. The size of the screen decides it, not the pointer. At the
minimum screen, on a phone and at agent-browser's 800×600 it is 1, a pile card of 56×80; at 1280×800
on a desktop it is 1.25, and at 1920×1080 about 1.69. The sizes of the row are functions of it in
`flatRowWidths.ts` (`pileCardSize`, `flatCardWidth`, `flatRowWidths`).

The table draws in 3D (`table3d.ts`), after the board of a digital card game such as MTG Arena. It
always draws so, in four parts; no setting turns it off (#1822), and nothing reads the old key
`practice-3d-table`:

- The board of missions and ships and the bottom row lean away from the player as one table
  (`TablePlane`, `data-testid="tilted-board"` and `"tilted-bottom-row"`): each takes
  `perspective(1200px) rotateX(18deg)` about the same hinge on screen, the middle of the bottom
  edge of the bottom row (`planeTiltStyle`), so the two lie in one plane. The hands, the corner
  buttons and the turn and score column stay flat in front, since the hands are `position: fixed`
  and a transformed ancestor would re-anchor them. One playmat, `data-testid="board-mat"`, runs in
  that plane from above the slivers of the dilemmas under the missions to below the bottom row. Each
  tilted element sits inside its part's measured box (`setMissionRows`, `setBottomRow`), never on it,
  so `useShipRows` and `computeTableScale` measure what they did before and the sizes of the table do
  not change. dnd-kit measures each droppable's projected box, and the browser hit-tests the tilted
  cards as drawn, so drops and taps land where the card shows. The attempt layout does not tilt.
- The game layer takes the class `table-3d`: felt, a soft spotlight and a vignette (`globals.css`).
- Every table card (`table-card-art` of `TableCardImage`) casts a shadow on the table.
- The draw deck, the dilemma pile and the discard pile draw real cards of the game under the top
  card (`pileDepth.ts`), `data-testid="pile-depth"` with `data-depth` (the pile's height in px:
  0.2 px a card past the first, at most 10, times the bottom-row scale) and `data-layers`, at most 10
  `<img>`s (`pileLayers`), each lower, further right, darker and a little askew than the one above,
  the same on every render. A face-down pile shows `cardback.jpg`, and the discard pile the faces of
  its own cards under the top one. A pale hairline under each card (`PILE_CARD_EDGE`) tells the black
  borders apart, and the bottom card casts the pile's shadow. The layers sit behind the art with no
  pointer events, so no pile's size, drop halves or drag change.
  A pile stands on the table: its bottom card sits on the bottom row's baseline, level with the
  bottoms of the core and brig cards, and its contents (`data-testid="pile-lift"`: the layers, the
  top card, its drop halves, its drag and its count) rise by the pile's height (`usePileLift`), so a
  tall pile's top shows above the single cards of the row. The pile's box keeps its place.

The card sizes in `MissionRow.tsx` and `TableCard.tsx` are still the sizes at scale 1, and scale 1
is still a 320 px tall table. At 667×375 the table draws at a scale of 375/320, about 1.17. A
layout that must fit the minimum screen must fit it at that scale.

The missions and the ships draw at a larger scale of their own,
`missionScale` (`useMissionScale`, `tableScale.ts`). On a touch screen they grow until a mission
column with two rows of ships fills the height above the bottom row, as far as the width allows
the five missions, the four gaps between them, a 20 px gutter on the right, and on the left a 56 px
column (`TOUCH_CONTROLS_COLUMN`) for the turn and score controls, and never below the table scale
(`computeTouchMissionScale`). The mission row holds no dilemma stack
(#1170): the stack lives only in the attempt layout. A desktop does the same with the whole card
(#992). At 667×375 a mission is about 105 px wide, where the table scale alone gives 84.

The turn and score controls sit in that left column, below the menu, fullscreen,
undo and game log buttons (`data-testid="turn-score-column"`, #1337): the next-turn button, which shows the turn number (#1449), then
the score over minus and plus. The next-turn button advances through the segments of the turn,
`TableState.segment` (#1605): play and draw, then orders, then the next turn, or discard first when
the hand holds more than 7 (`nextSegmentOf`); its `aria-label` and `title` say what a tap does ("Go to
orders", "Go to discard", "Next turn"), and under it the segments of the turn show as a list of three rows,
"Play", "Orders" and "Discard" (`data-testid="turn-segment-list"`, #1790), the current one marked,
`aria-current="step"` and `data-testid="turn-segment"`; the list is no control. An attempt started in play and draw moves the turn to
orders, and no segment refuses a move. The game menu's Settings hold "Counters: On/Off"
(`game-menu-turn-counters`, #1607), a setting of the device under `practice-turn-counters`, off by
default. Beside it, "Apply card text to attributes: On/Off" (`game-menu-card-text-attributes`, #1668),
under `practice-card-text-attributes`, off by default, turns on the range and span models of
`RANGE_SPAN_REGISTRY` (`rangeModels.ts`): off, a ship's Range is its printed Range and a move's span
total the printed spans plus the 2 between quadrants, a rule of the game. Two models read the core (#1827): Soliton Wave
makes every ship on a ship row Range +1 (`coreRange`), and Shadows of the Night sets the span total of
a move to or from a space mission to 5 when it is 4 or less and the ship is Temporal or costs 3 or more,
after every reduction (`coreSpanTotal`). `withShuffleOrders` stamps
it on each `move` as `cardText` (absent is off), so the reducer reads no storage and a change of it
leaves `rangeUsed` as it was. The same setting turns on the attribute models of `ATTRIBUTE_REGISTRY` (`attributeModels.ts`, #1664: U.S.S. Enterprise-J, Orlitus Cluster Astronomical Survey, Dark Dissension): `personnelAttributesOnTable` and `shipAttributesOnTable` give a card's Integrity, Cunning and Strength, or Weapons and Shields, on the table, each never below 0, and the printed values with it off. A ship's clause that changes its attributes (#1671: Groumall, A. G. Robinson, Wesley Crusher, Erika Hernandez, Geordi La Forge, Rotarran, Keldon Advanced, Sarajevo, Vedek Assembly Transport, Vidiian Cruiser) has one condition in `SHIP_CLAUSES` (`rangeModels.ts`) that its range model and its attribute model both call; the range hooks read a `RangeTable` (the missions, the discard and the core), and a commanded personnel that changes ships uses `commandedShipRange` and `commandedShipAttributes`. An equipment's `groupAttributes` changes its own group (The Sword of Kahless, #1683), and an event placed on a ship changes it through `placedOnShipAttributes` (Exceed Engine Output). With it on, the bands of the cropped personnel and ships (`PersonnelOverlay`, `ShipOverlay`) show them (#1666): `PracticeTable` builds `attributesOnTableOf` (`attributesOnTable.ts`), the values that differ from the printed ones by instance id, and shares it as `attributes` of `RangeUsedContext`; each differing value carries an arrow left of its number, up in green for a rise and down in red for a fall (`<prefix>-<attribute>-modified`, `data-direction`), and the band's `aria-label` adds the printed value, "Integrity 4, printed 5". A ship's Range arrow compares its Range on the table with the printed Range, never the range left: a moved ship still shows the range left, "Range 9 left of 12, printed 7". A whole ship card shows `ShipRangeLeftBox` when it moved or its Range differs (`shipRangeShown`), with the arrow; the other whole-card attributes show no change yet. With the setting off no arrow shows. The dilemma bot reads them (#1665): `useBotAttemptStart` stamps the setting on the `botAttempt` as `cardText`, the reducer keeps it on the `Attempt`, and `pileTableInputOf` gives the attempting personnel and ship their attributes and Range on the table, before the modifiers of `PileModifiers`, for the bot's search, label, Resolve and reveal roll; a change of the setting mid-attempt takes effect at the next attempt. Beside them, "Resolve events in a panel: On/Off" (`game-menu-resolve-events`, #1727), under
`practice-resolve-events`, off by default, decides only whether the Play target of #1729 shows (see
the drag section); an
event already resolving stays whatever the setting. The resolving zone, `TableState.resolving` and the
`Zone` `'resolving'`, holds one card or `null`, never a list (`FlatZone` is every other top-level zone;
`cardsAt` reads the slot as 0 or 1 cards): a `move` into it is refused while it holds a card, a move out
empties it, and `advanceSegment` and `nextTurn` change nothing and log nothing while it holds one. A
move from the hand into it in play and draw is a play (`PLAY_PLACES`), charged by `moveCharge` and
logged "Played These Are The Voyages (cost 1)"; a move out is not charged, and to the discard pile it
logs "Resolved These Are The Voyages, and it went to the discard pile". `resolvesOnPlay`
(`playCost.ts`) names the events with no "Plays in …" or "Plays on …" clause. The save keeps it, and a
save from before it, or a malformed or unknown one, restores `null` and keeps the rest. While the zone
holds a card, a modal panel shows it (#1728, `ResolvingPanel.tsx`, `data-testid="resolving-panel"`), the
event a whole card (`resolving-card`, `data-zone="resolving"`, its `data-card-id`) that previews on a hold
and drags out, the panel hidden during the drag as a card list panel is; the panel is no drop target. **The prompt** (#1870, a spike of #1849): These Are The Voyages resolves in place, with no panel. One function, `presentationOf` (`ResolvePrompt.tsx`), answers `'panel'` or `'prompt'`, and only These Are The Voyages's draw and bottom steps get the prompt; Miracle Working, every other event and every played card keep the panel. A thin bar, `resolve-prompt` (`data-step`), sits at the top centre, below the charge chip, whose height it measures, so both show at once; it holds the task (`resolve-prompt-task`), the count (`resolve-prompt-count`, "2 of 3"), the confirm (`resolve-prompt-done`), disabled until the pick is complete, and in the draw step Cancel (`resolve-prompt-cancel`). `resolving-mini` shows beside it, raised over the hand's backdrop and arc (`LAYER_RESOLVE_PROMPT`); it has no Resolved → Discard: a drag of the mini to the discard pile ends the event. In the draw step a row, `resolve-candidates`, shows above the bottom row: every personnel of `personnelCandidateGroups(table, { includeStopped: true })`, never the brig, each a cropped card (`resolve-candidate`, its `data-card-id` and `data-place`) labelled with its place (the group's `place`, the names with their subtitles, as the card data has them) and its printed cost; a tap picks one, another tap moves the pick, a hold previews, a cost-0 personnel draws 0, and the confirm reads "Draw N" and dispatches `resolveDraw`. The bottom step opens the hand arc once, and a tap on a card of the arc picks it (`CardHand`'s `choice`), up to 3, its number in the top-left corner (`hand-pick-number`); a tap on a picked card removes it and the rest renumber; the arc's cards do not drag and its "→ top"/"→ bottom" row hides. The picks are page state, `resolveChoice`, in tap order, never `selectedCardIds`; closing the arc keeps them, and a change of the resolving card or the step clears them. "Place on bottom" dispatches `resolveBottom` with them in tap order, the last at the very bottom. Escape closes the arc first, then collapses the prompt to `resolving-mini`, whose tap brings it back with the picks kept. Its
layer, `LAYER_RESOLVING_PANEL`, is below the charge chip, so the play's choices stay reachable, and below
the splash. **Resolved → Discard** (`resolving-discard`) is a plain `move` to the discard pile. An event that plays in the core and has a "When you play this event" clause (`resolvesThenCore` in `playCost.ts`, #1796; a sentence of it with "is cost" only changes its cost and does not count) plays into the resolving zone too: the Play target shows for it, and with "Resolve events in a panel" on, a drop of it from the hand on the core in play and draw is the same play. Its panel shows **Resolved → Core** (`resolving-core`) in place of Resolved → Discard and Remove from game, a plain `move` to the core, uncharged, "Resolved Peak Performance, and it went to the core". Every other core event plays straight into the core. For an event whose text has the
sentence "Remove this event from the game." (`removesItselfFromGame` in `playCost.ts`, matched at a
sentence start in any case, #1730), **Resolved → Remove from game** (`resolving-remove-from-game`) shows
first: one `batch` (`resolvedRemoveFromGameAction`), that `move` and then `setRemovedFromGame`, which
leaves the card at the end of the discard pile marked as the discard pile panel's Remove from game marks
it, in one entry, "Resolved Ferengi Tradition, and removed it from the game" (`LogMove.removedFromGame`). **Recall** (#1764): an event with "Recall: N." in its `Keywords` (Miracle Working, Second Edition, Planned Provocation, Profound Discovery), or Vidiian Organ Bank while the player has two completed missions (its `recall` in `titles/recall.ts`), plays from the discard pile: a drag of it out of the discard pile panel shows the Play target (`playTargetEligible` with `fromDiscard`, never for a card marked removed from the game), and the move into the resolving zone is a play at its cost + N, "Played Miracle Working (cost 2, Miracle Working: Recall 1, played from your discard pile)" (`recallOf` in `playCost.ts`); a move of it from the discard pile anywhere else is no play. Vidiian Organ Bank with fewer than two completed missions is refused on the Play target (`recallRefused`): no move and no entry. While a recalled event resolves (`resolvingRecalled`, from the log), the panel shows Resolved → Remove from game and no Resolved → Discard, the last step of its resolve model leaves it removed from the game ("…, and Miracle Working was removed from the game", the entry's `removed`), and Cancel puts it back at the end of the discard pile, "Cancelled playing Miracle Working, and it went back to the discard pile" (`returnedTo`). **Check uniqueness and limits** (#1821): the game menu's Settings hold "Check uniqueness and limits:
On/Off" (`game-menu-check-rules`), under `practice-check-rules`, off by default. With it on,
`withShuffleOrders` stamps on each `move` the rules it breaks, `ruleWarnings` (`ruleWarningsOf` in
`playRules.ts`), and on a `resolveDilemma` with a placement and a `playEffectDownload` aboard a ship the same:
a play (a charged move) of a unique card while another card of its title (`cardTitleOf`, so the versions of a
title conflict) is in play (`inPlayCards`: the away teams, the ship rows, the crews, the core and the cards
placed on a mission card, a ship or a core card; never the hand, the discard pile, the cards under a mission,
nor the brig, which holds the opponent's personnel, a known gap since the table does not model whose card is
whose), "Unique: Yarka Harbinger of the Prophets is already in play"; and any move, played or not, a dilemma
by hand or the bot's Resolve placement too, of a "(limit one per mission)" card onto a mission card, or a
"(limit one per ship)" card onto a ship, that already holds a card of its title, "Limit one per mission:
Self-Replicating Roadblock is already on Moab IV". The move still lands. The entry keeps them
(`LogMove.warnings`, `dilemmaResolved.warnings`, `entryRuleWarnings`), its text ends with them ("…; unique:
Yarka Harbinger of the Prophets is already in play"), one undo takes back both, and with the setting off
nothing is checked or recorded. The charge chip shows each as a line, `charge-warning` with `data-rule`
(`unique`, `limitPerMission`, `limitPerShip`), with Counters on or off; with Counters off it shows the
warnings alone. **When you play** (#1800): a personnel or a ship whose title has a model in `PLAY_MODELS`
(`src/lib/playModels/`, by whole title, `playModelOf`) leaves its effect pending once played, derived from the
effective log (`pendingPlayEffectOf` in `gameLog.ts`): the latest play of the turn's play and draw, while its
record (`LogMove.effects`) lacks a step and the card stands in an away team, a crew or a ship row. No
`TableState` field holds it, and `resolving` never holds the card. The resolving panel then takes the played card
as its subject (`played` of `ResolvingPanel`): the card previews on a hold and never drags, the effect's text
(`resolve-play-text`), the condition line (`resolve-condition`, "Condition met: …", "Condition not met: …" or
"Condition not checked: …", from `CostFacts`; the player may resolve it anyway), the step, and **Skip**
(`resolving-skip`) or, once a step was taken, **Done** (`resolving-done`), both `playEffectSkip`, which records every
step left as skipped; no Discard, Remove from game or Cancel. View table and Escape collapse it to `resolving-mini`,
and the next-turn button reads "Resolve <card> first". Each step amends the play's own entry, so the play and its
effect are one entry and one undo, "Played Enabran Tain "Retired" Spymaster at Celtris III (cost 3); drew 7 cards,
then discarded Tricorder and Phaser"; after a correction of the charge the steps write one `playEffect` entry of their
own, addressed to the play, whose undo takes back the effect only. A malformed record is dropped, the move kept. The
one kind is `'drawUpToThenDiscard'` (Enabran Tain): `resolve-step-draw-up-to`, a stepper (`resolve-draw-minus`,
`resolve-draw-count`, `resolve-draw-plus`) from 0 to 7 or the draw deck, and Draw N (`resolve-draw`,
`playEffectDraw`), then `resolve-step-discard`, 2 cards of the hand (`resolve-hand-card`) and Discard 2
(`resolve-discard`, `playEffectDiscard`). The kind `'discardFromHand'` (#1808) has that discard step alone, and
it is no "may": the personnel whose whole clause is "discard a card from hand" (Leeta Rebel Supporter, Jake Sisko
Reporter Behind the Lines, Kira Nerys Reformed Collaborator, Odo Wayward Link, Tora Ziyal Beloved Daughter, Quark
Resistance Informant and the others of `DISCARD_A_CARD_TITLES`) and Niala Intelligence Asset's two. The panel shows
no Skip before it, and a `playEffectSkip` then is refused; with an empty hand Done (`resolving-done`) ends the
effect, recorded "discarded no card". The kind `'examineTake'` (#1809: Requisitions Drone, Lenara Kahn Wormhole
Theorist, Keiko O'Brien Botanist, Harry Kim Remorseful Survivor, Sobi Felicium Dealer) has one step,
`resolve-step-examine`: the top 4 of the draw deck, fewer when it is short (`examineCount`), as `resolve-examine-card`,
those the model's test refuses disabled (`examineTakes`: Lenara an event, Keiko a cost of 4 or more, Harry Kim an
interrupt or a Temporal card), a tap takes one (Sobi one for each different Commodity of the core, `examineTakeMax`;
Requisitions Drone must take one, `examineTakeMin`), the rest in the order controls of the bottom step
(`resolve-order`), and **Take 1, place 3 on bottom** (`resolve-examine-apply`, `playEffectExamine`), which moves the
taken to the hand and the rest to the bottom of the draw deck in that order, "…; took Tricorder, placed 3 on the
bottom". The cards stay in the draw deck until the button. The kind `'downloadTake'` (#1810: Opaka Kai of Bajor, Jean-Luc
Picard Vintner, Mavek Science Officer, Cal Hudson Attache to the Demilitarized Zone, Niles and the other plain "you may
download <a test>" texts) has one step, `resolve-step-download-cards`: the cards of the draw deck that pass the model's
test (`downloadTakes`: a title, a persona of a personnel or ship by its name, a type, an affiliation, an icon, a keyword,
a species and a skill), the list of `DownloadChoicePanel` (`download-choice-card`), at most `upTo` on (Picard 3, most 1),
`resolve-download-cards-summary`, and **Download** (`resolve-download-cards`, `playEffectDownload`), which takes them
into the hand and shuffles the draw deck in the order the page chose (`withShuffleOrders`), "…; downloaded Kira Nerys,
shuffled the draw deck"; with no match it shows `resolve-download-cards-none` and no button. Mavek's "if your
non-Cardassian is at this mission" reads the other personnel of the slot the card stands at (`otherSpeciesHere`). The
kind `'downloadPlace'` (#1811) downloads one card to a place the played card sets, in the same step: Gelnon Aloof
Tactician a Jem'Hadar aboard one of the player's [Dom] ships, the ships of his mission first (`resolve-download-ship`,
`data-ship-id`; `resolve-download-no-ship` with none), U.S.S. Enterprise Where She Belongs a [TOS] personnel of cost 4 or
more played aboard itself at its printed cost −4, never below 0, and Reconnaissance Drone a non-Drone personnel placed on
top of the draw deck after the shuffle (`DownloadPlace`, `downloadPlaceShipsOf`, `playEffectDownload` with `shipId`).
The Enterprise's play is charged with its source, "(cost 1, U.S.S. Enterprise Where She Belongs: played aboard this ship
at cost −4)": a second move of the play's own entry, so the counters count it, the chip shows both plays and one undo
takes back both; after a correction of the charge it is one `move` entry of its own whose `effectOf` holds the step.
Its cost choice "Ignore its next ability: −4", once taken, ends the download (`ignoredByCostChoice`). The kind `'score'` (#1812: Annexation Drone, DaiMon Solok
Cargo Runner, Opaka Collaborator, Kira Taban Husband and Father, Eris Harbinger of the Dominion, Klaa Dauntless Hunter,
and Brunt Acting Grand Nagus's score clause) has one step, `resolve-step-score`, with its condition (a `'table'`
condition of `PlayConditionFacts`; Kira Taban's is "Condition not checked: needs the opponent's score") and **Score 5**
(`resolve-score`, `playEffectScore`), which adds the points with `adjustScore`'s clamp, "…; scored 5 points"; Skip
shows with or without "you may". **Cancel**
(`resolving-cancel`) dispatches `cancelResolving`: the event goes to the end of the hand, uncharged, in one
`playCancelled` entry, "Cancelled playing These Are The Voyages", that names the charge of the last move
into the zone; `effectiveLog` then reads that play as no play, so its counters come back, a pending
discount it used waits again, and the standing rules no longer count it. What its choices did stays. An
event of the resolve registry (`RESOLVE_MODELS` in `src/lib/resolveModels/`, #1739: These Are The Voyages,
Miracle Working) shows its steps in a column of the panel, the step derived from the log (`resolveStepOf`
in `gameLog.ts`). The draw step (`resolve-step-draw`): These Are The Voyages lists every personnel of the
away teams and crews, stopped ones too, never the brig (`resolve-personnel`, with its cost), and
**Draw N** (`resolve-draw`) dispatches `resolveDraw`, which draws the chosen personnel's printed cost
(Miracle Working: 4) at no cost, as many as the draw deck holds, in one `resolveDrew` entry, "Drew 4
cards (These Are The Voyages, Data cost 4)". The bottom step (`resolve-step-bottom`) asks for 3 cards of
the hand, or the whole hand when it holds fewer (`resolve-hand-card`), in an order the player sets
(`resolve-order`, up and down); **Place on bottom** (`resolve-place-bottom`) dispatches `resolveBottom`,
which puts them on the bottom of the draw deck in that order and the event in the discard pile, in one
`resolveBottom` entry. Cancel hides at the bottom step. Each step is one undo. Four events discard a card from hand to draw (#1745, the model kind `'discardDraw'`: Days of Atonement, Order of the Bat'leth, That's the Last Time, Downfallen Civilization, whose conditions of play are not checked): one step, `resolve-step-discard-draw`, where the player picks one card of the hand (`resolve-hand-card`, a second tap moves the pick) and **Discard and draw N** (`resolve-discard-draw`) dispatches `resolveDiscardDraw`, which discards it, draws N free (2; Downfallen Civilization 3 while no mission slot is completed, `discardDrawCount`), as many as the draw deck holds, and moves the event to the discard pile, in one `resolveDiscardDraw` entry, "Discarded Tricorder, drew 2 cards, and Days of Atonement went to the discard pile". With an empty hand the step shows `resolve-hand-empty` and no button: the discard is the cost of the draw, so the player ends with Resolved → Discard or Cancel. Second Edition (#1746, the kind `'downloadCopy'`) has one step, `resolve-step-download`: it lists every personnel of the away teams and crews, stopped ones too, never the brig (`resolve-personnel`), each marked "copy in deck" or, disabled, "no copy in the draw deck" (`downloadCopyOf` in `personnelChoice.ts`: the top-most card of the draw deck of the same title, `cardTitleOf`, so another version counts), and **Download** (`resolve-download`) dispatches `resolveDownload`, which takes the copy into the hand, shuffles the draw deck in the order the page chose (`withShuffleOrders`), draws 1 card when the chosen personnel is [AU], and moves the event to the discard pile, in one `resolveDownloaded` entry, "Downloaded Data (Second Edition), shuffled the draw deck, drew 1 card, and Second Edition went to the discard pile"; with no copy anywhere it shows `resolve-download-none`. Vidiian Organ Bank (#1765, the kind `'exchange'`, its play condition not checked) has one step, `resolve-step-exchange`: one [Vid] personnel of the hand (`resolve-hand-card`) and one unstopped [Vid] personnel of the away teams and crews, never the brig, by place (`resolve-personnel`, `exchangeCandidatesOf` in `personnelChoice.ts`), and **Exchange** (`resolve-exchange`) dispatches `resolveExchange`, which moves the table's personnel to the hand, the hand's to the end of the away team or crew the other left, and the event to the discard pile, in one `resolveExchanged` entry, "Exchanged Danara Pel Loving Life for Bridon, and Vidiian Organ Bank went to the discard pile"; with either side empty it shows `resolve-exchange-empty`, which names the side, and no button. The Crossing (#1826) is the same kind with no fixed affiliation and `replacedTo: 'discard'`: each side lists the personnel that share an affiliation with one of the other (`exchangeMatches`), a pick disables the cards of the other side that do not match it, **Replace** sends the table's personnel to the discard pile and the hand's to its place, "Replaced Cru with Hal, Cru went to the discard pile, and The Crossing went to the discard pile" (`replaced` of the entry). **View
table** (`resolving-view-table`) and Escape collapse the panel to a small card at the right side
(`resolving-mini`, `LAYER_RESOLVING_MINI`), which a tap opens again, a hold previews and a drag moves. The
view is page state: a new resolving card, an undo that brings it back and a reload open the panel. While
the zone holds a card the next-turn button is disabled, its `aria-label` and `title` "Resolve These Are The
Voyages first". Before the first turn a new game (`reset`, never `resetWithPiles`, so no fixture
that deals a hand) sets `TableState.openingHand: 'pending'` (#1736): the column then shows one **Draw 7**
button, `data-testid="draw-opening-hand"`, in place of the next-turn button and the segment's row, the
score below it as before. A tap dispatches `drawOpeningHand`, which moves the top 7 of the draw deck (fewer
when it is short) to the hand at no cost, in one log entry, "Drew the opening hand (7 cards)", and
clears the flag; one undo brings it back. An empty draw deck disables it. A hand draw meanwhile is an
ordinary charged draw and keeps the flag; `nextTurn` clears it. Every control of the column has a row of its own (#1679, #1790): the next-turn button, the
segment list's Play row, the row of the counter (`data-testid="turn-counters-row"`), indented under
Play inside its `<li>` (#1848), the Orders and Discard rows, the score, and minus and plus side by
side. The list keeps three items, each name a `turn-segment-name`, and the current one's highlight
marks its name only. With counters on, the counter of the turn's counters,
`data-testid="turn-counters"`, fills its row, "0/7": "<spent>/<limit>", with
`data-over="true"` past the limit. In Orders and Discard the row is gone (#1873): Orders and Discard
move up under Play, a spacer below the list (`turn-counters-spacer`) takes the row's height so the
score does not move, and the counters list is not reachable; the game log keeps what each play and
draw segment spent (`segmentTotalText`). With counters off the row stays in play and draw, empty,
and the Draw 7 block is as tall as the next-turn button, the list and that row. Nothing marks
counters left unspent. Everything is derived from the log
(`turnCounters` in `gameLog.ts`): a correction is a log entry, `chargeCorrected` or `counterLimit`, that
`gameReducer` makes for `correctCharge` and `adjustCounterLimit` with no change to the table, and
`effectiveLog` applies the corrections before the log is read. Before the printed cost, a play asks
the cost registry (#1654, `moveCharge`); a download only takes a card into the hand, and its later play
costs what any play does. The cost registry (`src/lib/costModels/`, one model per
title, of `CostFacts` that `costFactsOf` builds) gives Borg Nanoprobes cost −2 while a Borg is
commanded and Goran his "may", a button `charge-choice` ("Discard a card: −2") that dispatches
`correctCharge` with its `source`. A play names where it lands, the mission slot and the ship it boards
(`CostPlay.missionIndex` and `shipId`, from the landed zone in `withCharge`, #1702), and each slot of
`CostFacts.missions` lists its personnel and ships, for "at this mission" and "aboard your ship"; a core
card prices another card's play with `costOfPlay` (Captain on the Bridge), and the changes stack in one
source. A standing rule of the core (family `standingRule`, #1703: Disadvantage Into Advantage, Spiteful
Strategy, Energize) does the same for every play, each copy once; its "first … each turn" reads the
turn's earlier plays (`turnPlaysOf`, from the `plays` traits of each `LogMove`), and Energize the cards
placed on it (`CostFacts.corePlaced`). A mission of the player's slots (family `missionRule`, #1752: the six keyword-event missions such as Braslota System, Deep Space Station K-7, Kelsid II, Exo III, Parliament, Romulus Patient Stronghold, Quatal Prime, Saturn, Cardassia Prime Bastion of Resistance while flipped, `CostMission.flipped`, and Vidiia Locus of Infection, #1750, while the player commands fewer than seven unstopped personnel, never the brig) prices a play from the hand through `missionCostOfPlay(play, facts, slot)`, each title once (`missionCostsOf`), stacked after the core's; a play records its species, skills, affiliation and landing quadrant (`CostTurnPlay`) for "the first … each turn", and a card placed on a mission card lands at `CostPlay.onMissionIndex`. An unstopped personnel of the player's away teams and crews, never the brig, prices a play the same way (family `personnelRule`, #1756: Anthwara, −1 on an event placed on a mission card while the player commands For the Cause, −2 on a Region: Demilitarized Zone mission) through `personnelCostOfPlay`, each title once (`personnelCostsOf`), stacked after the missions'. Two missions let the player spend counters (#1754, `missionSpends.ts`, by whole title), each a `missionSpend` action and one log entry, counted in play and draw (`segmentCounters`: Earth under draws, Nimbus under cards) and corrected like any charge: Earth Lush and Beautiful Home, once a turn after a [TOS] card is played at it (an away team there or placed on its card, `earthSpendOf`), spends 1 to draw 2; Nimbus III Staff Backwater Embassy, while the player commands no Unicomplex, spends 3 to download Caithlin Dar, Korrd or St. John Talbot from the draw deck into its away team and shuffles the draw deck (`nimbusSpendOf`). An offer shows as an amber button at the top left of the mission card, `mission-spend-<i>`, with counters on or off; Earth's also shows on the play's chip (`charge-mission-spend`), and Nimbus opens a picker, `mission-spend-picker` (`mission-spend-choice`, `mission-spend-cancel`). "Events you command" (#1749: Gowron, Jorem, Mullen, Nerot) read `CostFacts.events`, the events of the core and those placed on the player's mission cards and ships, never the brig nor an event placed on a core card. A text that counts what the table does not see, the opponent's
missions or the cards a play discards (#1695, `titles/opponentCost.ts`: Tacking Into the Wind, Rollins,
Ptol and others), gives the printed cost and a counted choice (`CountedChoice`: `step`, `max`, and the
printed `base`, `max` clamped where the cost reaches 0), a stepper `charge-choice-count` with
`charge-choice-minus` and `charge-choice-plus`, each a `correctCharge` with the cost of the next count
and its `count`; `LogCharge.choiceCount` reads the last count back from the log. Two ships discard the top of the player's own draw deck (#1744, `titles/deckDiscard.ts`, `CostFacts.drawDeckTop`, the top 3, in every game): a play of Alliance Galor moves the top 3 (fewer when the deck is short) to the discard pile in the play's `batch` (`ModelCost.discard`, the move's `costDiscard`), and costs 5 less the Human personnel among them, one entry and one undo; Type III Galor, while the draw deck holds 3 or more, offers "Discard the top 3: −2" (a cost choice with `discardTop`), a `discardForCharge` that discards the top 3 and lowers the charge in one `chargeCorrected` entry with `discarded`, one undo for both, refused and disabled once the deck holds fewer than 3. The chip and the list name the source, `charge-source`, and the log
text reads "(cost 3, Borg Nanoprobes: you command a Borg)". The limit is 7, plus the grants of the models
(#1655, `limitGrantsOf`, read from the table as it stands: Surprise Party +1 while it is in the core; Gint The First Grand Nagus +1 while he is unstopped and the player commands four cards of printed cost 4 or more, him counting, #1768: the unstopped personnel, the equipment, the ships and the events of `CostFacts.events`, `CostFacts.commandedCosts`), plus on turn 1 the grants decided at the Draw 7 tap (#1755, `firstTurnGrant` of a model, `firstTurnGrantsOf`: Ledos +5 while the player has fewer than two headquarters missions and no skill is named in two missions' requirements, `missionsShareSkill`), which the `openingHand` entry keeps as `grants` (`loggedGrantsOf`), so a later change to the table leaves them and an undo of the tap takes them back,
plus the `counterLimit` changes; Tricia Jenkins's "Raise the limit: +5" is a `charge-choice` that
dispatches `adjustCounterLimit` with its `source`. Common Purpose's "Stop personnel…" (#1712, a
`PersonnelChoice` of `model.ts`) opens a picker, `data-testid="personnel-choice"`
(`PersonnelChoicePanel.tsx`): the unstopped personnel of every away team and crew, never the brig, by
place (`personnelCandidateGroups`), a summary "3 personnel, 2 affiliations: +2"
(`personnel-choice-summary`), Confirm and Cancel; Confirm dispatches `choosePersonnel`, which stops the
chosen and raises the limit by their different affiliations in one `counterLimit` entry with `stopped`,
one undo for both. A card on the table may offer a use for a play (#1713, `usesForPlay` of a model,
`costUsesOf`, `titles/tableUse.ts`): Delivery Boy in the core destroys itself for −3 on a Q or Temporal
event, and Nathan Samuels (a non-Human [SF] personnel) or Guinan (an [AU][TNG] card), unstopped at the
play's destination mission, stops for −2. The play's `move` carries the offers as `costUses`, the log
keeps them per card (`LogMove.uses`, `LogCharge.uses`), and the chip and the list show one button per
offer, `charge-use` (`data-use-card`), below the played card's own choice, disabled once used or while its
card is no longer there (`costUseAvailable`); the card itself shows a badge button, `table-card-use`, in
the core row and in the card list panels. A tap dispatches `useCard`, which destroys or stops the card and
lowers the charge in one `chargeCorrected` entry with `used`, one undo for both; each copy once a play,
two Delivery Boys −6. A choice of the played card's model sets its cost less the uses already taken, so
the two stack in either order. A pending discount (#1656, `pendingDiscountsOf`, from the log) waits for
the next play of the turn that passes its test: Sarish Rez makes the next [Fed][DS9] personnel cost −2,
and the list shows it, `pending-discount`, with a Dismiss (`pending-discount-dismiss`) that dispatches
`dismissDiscount`, one log entry; the turn ends it. K'mtar (#1762), while each non-headquarters mission of
the player requires Diplomacy (`missionRequires`; an empty slot is no mission), offers "Download up to 2
events…", a `DownloadChoice` of `model.ts` that opens a picker, `download-choice` (`DownloadChoicePanel.tsx`:
the events of the draw deck, `download-choice-card`, at most 2 on, `download-choice-confirm` and
`download-choice-cancel`); the confirm dispatches `downloadForCharge`, which takes them into the hand and
shuffles the draw deck in the order the page chose, in one `eventsDownloaded` entry, one undo, that takes the
choice. Each card it names leaves a pending discount of −3 for the play of that card alone, origin the entry
and the card's place in it, dismissed one by one. The New Resistance in the core (#1763, `titles/tableUse.ts`, the use effect `'revealTop'`, amount 0) offers, on the play of a Dissident personnel while the draw deck holds a card, "Reveal the top card" (`charge-use`), once a play and one copy however many are in the core; a tap dispatches `useCard`, which moves no card and makes one `chargeCorrected` entry with `revealed`, "Revealed Damar Cardassian Liberator (The New Resistance): a Dissident" (or "not a Dissident"), and the page opens the draw deck's reveal panel on that card. A revealed Dissident personnel leaves a pending discount with `fromDrawDeck`: its move from the draw deck to the table is a play (`moveCharge` charges no other move out of the draw deck), at its cost −3, never below 0, once; the turn or a Dismiss ends it, and a hand play never takes it. `COST_BACKLOG=1 yarn test costModelBacklog` prints
the titles whose text changes a cost or grants counters and that have no model yet, by the number of
shipped decks that play them, most played first (#1692); its detection, `changesCost`, lives in `src/lib/costModels/coverage.ts`. `PLAY_BACKLOG=1 yarn test playModelBacklog` prints the same list for the "when you play" models (#1801): the personnel and ship titles whose "When you play this …" clause does more than change the cost and that have no model in `PLAY_MODELS`, most played first; its detection, `hasPlayEffect`, and `playModelCoverage` live in `src/lib/playModels/coverage.ts`, and a clause that only changes the cost stays with `changesCost`. `playPlacesOfRow` (`src/lib/playPlaces/`, #1855; `playPlacesOf` in `src/app/decks/practice/playPlaces.ts` takes a `TableState`) says where a personnel, ship or equipment may be played: `{ awayTeams, crews, shipRows }`, slot indexes and ship ids, or `null` for any other type; it reads the headquarters rules (`reportsToMatches`), a mission's "you may play … here", a ship's "… aboard this ship", the card's own "aboard your [X] ship" or "at your {Mission}" text and `PLACE_MODELS`, and a cost with no place adds none. During a drag of one personnel, ship or equipment from the hand in play and draw, `PracticeTable` shares its places (`PlayPlacesProvider`, `dragPlayPlaces`, #1856), and the mission cards, ships' `crew-<id>` and ship rows they name show `data-highlight="eligible"` (a strong ring and a soft glow; for a ship the ship rows, also through their mission cards and ships, and an empty row too), the other ones `dimmed` (`playPlaceEligible` in `zoneAccepts.ts`); `over` shows under the pointer on any of them, and every drop still lands as before. With no place, in orders and discard, or for any other drag, the highlight is as before. `PLACE_BACKLOG=1 yarn test playPlaceBacklog` prints the "you may play" titles whose place it does not read (`placeCoverage` in `src/lib/playPlaces/coverage.ts`). `MODEL_BACKLOG=1 yarn test modelBacklog` prints the unified backlog (#1861, part of #1860): every title of the shipped decks, every section, its game text split into clauses (`clausesOf` in `src/lib/modelCoverage.ts`), each clause filed under a concern (`dilemma`, `cost`, `whenPlayed`, `eventResolve`, `attributes`, `mission` and `place` have a registry; `order`, `trigger`, `ongoing` and `interrupt` have none) and checked against its registry (`modelledToday` in the test), with totals by type and by concern and the titles with a missing clause, most played first, each marked within reach when every missing clause has a registry; `MODEL_BACKLOG=<path>.md` writes it to that file. A new registry, or a card modelled outside one, adds itself to `modelledToday`. The game menu's Settings show no count of cost models (#1818; #1697 showed one under Counters). The counter's label names the grants, "Counters 0 of 8
(Surprise Party +1)", and the list the parts, `turn-counters-limit-parts`, "7 + 1 Surprise Party". A charge shows its chip, `charge-chip`,
for `CHARGE_CHIP_MS` with Free, minus and plus; a tap on the counter opens `turn-counters-list`, the
turn's charges and the limit. They show on the full table only, not in the attempt layout. A desktop
shows the same column (#1451), below its five corner buttons (redo under undo), with `btn-icon`
buttons; on the desktop full table each corner button is as wide and as tall as the next-turn button
(`w-full h-7`, #1497), and the attempt layout keeps the small `btn-icon-sm` ones. Its mission row keeps the same `TOUCH_CONTROLS_COLUMN` on the left and
`MENU_BUTTON_GUTTER` on the right (`DESKTOP_FULL_TABLE_RESERVE` in `desktopMissionSlotBudget`). The
bottom row holds no turn or score on either device. They keep `data-testid="turn-counter"`, now inside the next-turn button, and
`"score-counter"`. The column sizes its rows from the free height above the bottom edge
(`turnScoreColumnLayout` in `tableScale.ts`, #1395, #1790): the tap rows (the next-turn button, the
counter, minus and plus) are the largest between 32 and 44 px that fit 8 px above the bottom edge,
less the bottom inset, a list row about 9/16 of that, text 12 px or more; 32 px with the labels at
667×375, 44 px at 800×600 and on a 1280×800 desktop. Where the floor does not fit, the "Turn" and
"Score" labels go first, and only then, in fullscreen on iPadOS, the column goes compact, with smaller
rows.

In fullscreen on iPadOS, WebKit draws its own close X and shrink button over the top-left corner,
and no CSS reaches them. The corner column moves below them (`top-14`, #1207), and the table hides
its own fullscreen button there (`systemExitControl` of `useFullscreen`, #1394), so the X is the one
way out. On a touch screen the corner buttons and the turn and score buttons take the look of that
X, `.btn-system` in `globals.css`: round, a translucent grey with a blur, a light glyph.

`agent-browser` opens an 800×600 page. To check that a layout fits the minimum screen, set the
size first:

```bash
npx agent-browser set viewport 667 375
```

### Browser checks

The practice table saves its game in localStorage and restores it on the next load (#976). A
fixture route keeps its game under its own key, `practiceGame:fixture=1` or
`practiceGame:fixture=piles`, so a reload of `/decks/practice?fixture=1` shows the game of the last
visit and not a fresh deal. To start a check from the fresh fixture deal, open
`/decks/practice?fixture=1&reset=1`. The `reset=1` parameter deals a new game, and the new game
replaces the save.

The game menu splash opens on every load of the practice table (#781) and covers the table. To
start with it closed, add `menu=0` to the URL (#1028). The usual check URL is
`/decks/practice?fixture=1&reset=1&menu=0`, and for a check that needs cards in the hand it is
`/decks/practice?fixture=piles&reset=1&menu=0`. A check of the splash itself leaves `menu=0` off.
`practice_drag.sh` stops with a message when the splash is open, rather than report a drag that
did not land.

The practice table has thirty-two fixtures. Each one deals the same table on every load.

- `?fixture=1` deals a plain new game, like a real one: the missions, **no hand**, and the rest of
  the deck in the draw deck and the dilemma pile. The brig, the core, the dilemma stack and the
  ship rows are empty. A new game deals no opening hand (#1115): the turn and score column shows
  "Draw 7" (`draw-opening-hand`, #1736) in place of the turn controls, and a tap on the draw deck
  draws one card into the hand.
- `?fixture=piles` (#802, #1024) deals the cards in deck order, with no shuffle, and **a hand of 7**
  (`FIXTURE_HAND` in `tableReducer.ts`), its own and not the opening hand of a new game. Mission 0 has an
  away team of 20 personnel. Mission 2, Bilana System, a space mission, has a ship with a crew of 12
  and one event placed on it, so the ship shows its counter of placed cards, and 3 dilemmas under it,
  shown as slivers (#1166). The ship row of mission 1, Angel I, a planet mission, is empty: for a
  check that needs a ship at a planet mission, run `bash scripts/practice_drag.sh card-39 ship-row-1`.
  The brig holds 2 personnel and the core holds 4 events. The dilemma stack is empty (#1170), as
  outside every attempt. The draw deck and the dilemma pile get the rest. The hand holds a Tricorder (`card-1`), two
  events (`card-7`, `card-8`), two interrupts (`card-9`, `card-10`) and two ships (`card-39`,
  `card-40`).
- `?fixture=costs` (#1654) deals the `?fixture=piles` table, the same cards and the same ids, with 10
  more cards (`PRACTICE_COSTS_TSV` in `src/lib/practiceDeck.ts`): Borg Nanoprobes, Goran, Tricia
  Jenkins, Sarish Rez, Jadzia Dax, a [Fed][DS9] personnel, and Rollins, whose counted choice shows a
  stepper (#1695) as Tacking Into the Wind's of the piles hand does (`card-9`, `card-10`), and Common
  Purpose, whose choice of personnel opens a picker (#1712), join the end
  of the hand of 7, which
  holds the Tricorder (`card-1`) and Surprise Party (`card-7`, `card-8`) already, and Annexation Drone,
  a Borg, joins the crew of the ship at Bilana System, so the player commands a Borg. Machinations, a
  Temporal event of cost 2, joins the end of the hand too, and Delivery Boy the end of the core, so a play
  of Machinations offers "Destroy Delivery Boy: −3" (#1713). These Are The Voyages (cost 1) and At What
  Cost? (cost 0), two events that resolve when played, end the hand (#1727), with ids after every other
  card's, so the cards of the fixture before them keep theirs (`PRACTICE_COSTS_LATE_HAND`), and after
  them Ferengi Tradition (#1730), an event that removes itself from the game, then Alliance Galor and Type III
  Galor (#1744), two ships that discard the top of the draw deck, then Days of Atonement (#1745), an event that
  discards a card from hand to draw two, then Second Edition (#1746), which downloads a copy of a commanded personnel (Marris and Simmons have copies in the draw deck), then Vidiian Organ Bank, Bridon and Danara Pel Loving Life (#1765): play Bridon onto the ship first, so the exchange has a [Vid] personnel on each side, then Peak Performance (#1796), a core event with a "When you play this event" clause. They hold the last ids. The draw deck
  holds the rest, for a Download. It keeps its game under `practiceGame:fixture=costs`.
- `?fixture=resolving` (#1728) deals the `?fixture=costs` table, the same cards and the same ids, with
  These Are The Voyages already moved from the hand into the resolving zone, charged 1 and logged "Played
  These Are The Voyages (cost 1)", so the page opens on its resolve prompt (#1870), not the panel. It keeps its game under
  `practiceGame:fixture=resolving`.
- `?fixture=recall` (#1764) deals the `?fixture=costs` table, the same cards and the same ids, with Miracle
  Working and a second Vidiian Organ Bank in the discard pile (`PRACTICE_RECALL_TSV`, `extraDiscard` of
  `resetWithPiles`), with the last ids. Open the discard pile's panel and drag one up to the Play target:
  Miracle Working plays at cost 2; Vidiian Organ Bank is refused until two missions are complete
  (`mission-toggle-<i>`), then plays at cost 1. It keeps its game under `practiceGame:fixture=recall`.
- `?fixture=attributes` (#1666) deals the `?fixture=piles` table, the same cards and the same ids, with
  3 more (`PRACTICE_ATTRIBUTES_TSV`): Kira Nerys Reformed Collaborator, a [TN] personnel, joins the end of
  the crew of the ship at Bilana System, and Dark Dissension and then Soliton Wave (#1827) the end of the
  core (`extraCore` of `resetWithPiles`). With "Apply card text to attributes" on, Kira's band in the crew
  panel shows Integrity with a red down arrow and Cunning with a green up arrow, and the ship's band its
  Range +1 with a green up arrow. It keeps its game under
  `practiceGame:fixture=attributes`.
- `?fixture=completion` (#1757) deals the `?fixture=piles` table with the five missions whose completion
  acts on the player's cards in place of its own (`PRACTICE_COMPLETION_TSV`): Aldea (slot 0, the away
  team of 20), Starbase 718, Bassen Rift (slot 2, the crewed ship), Saturn and Gateway, and Population 9
  Billion - All Borg in the draw deck. It has no headquarters. It keeps its game under
  `practiceGame:fixture=completion`.
- `?fixture=set67` (#1828) deals the `?fixture=piles` table with the missions of set 67 (`PRACTICE_SET67_TSV`):
  Cheron Aid Planetary Recovery (slot 0, the away team of 20), Caldos IV Upgrade Colony, Crescent Nebula Take
  Out the Trash (slot 2, the crewed ship), Metron Arena and Curnab Sector. It keeps its game under
  `practiceGame:fixture=set67`.
- `?fixture=missions` (#1754) deals the `?fixture=piles` table with Earth Lush and Beautiful Home (slot
  0, the away team of 20), Nimbus III Staff Backwater Embassy, Bilana System (slot 2, the crewed ship),
  Metron Arena and Curnab Sector (`PRACTICE_MISSIONS_TSV`), Korrd and Caithlin Dar in the draw deck, and
  Robert Tomlinson, a [TOS] personnel, at the end of the hand, so a play of him at Earth offers Earth's
  spend. It keeps its game under `practiceGame:fixture=missions`.
- `?fixture=playable` (#1856) deals the `?fixture=piles` table with Earth Cradle of the Federation, a
  headquarters, in slot 2, the crewed U.S.S. Relativity on its ship row with Robert Tomlinson, a [TOS]
  personnel, at the end of its crew, and Haakona, a [Rom] ship, on the ship row of slot 3 (`extraShips` of
  `resetWithPiles`); Deanna Troi Ship's Counselor, Tomek Displaced Alien, U.S.S. Reliant Searching for
  Lifeless Planets and Shuttlepod One Reliable Transport end the hand (`PRACTICE_PLAYABLE_TSV`). A drag of
  Deanna glows on `mission-on-2` and the Relativity's crew, Tomek on Haakona's crew, the Reliant on
  `ship-row-2`; Shuttlepod One, with no Enterprise, shows the highlight of before. It keeps its game under
  `practiceGame:fixture=playable`.
- `?fixture=kmtar` (#1762) deals the `?fixture=piles` table with five missions whose non-headquarters ones
  require Diplomacy (`PRACTICE_KMTAR_TSV`): Tarod IX (slot 0, the away team of 20), Korma, Tirapet Expanse
  (slot 2, the crewed ship), Volan III and Qo'noS, a headquarters; These Are The Voyages, At What Cost? and
  Ferengi Tradition in the draw deck, and K'mtar at the end of the hand, so a play of him offers the download.
  The three events shift the ids after them. It keeps its game under `practiceGame:fixture=kmtar`.
- `?fixture=tain` (#1800) deals the `?fixture=piles` table, the same cards and the same ids, with five missions
  whose non-headquarters ones require Intelligence (`PRACTICE_TAIN_TSV`): Celtris III (slot 0, the away team of
  20), Farius Prime, Argus Array (slot 2, the crewed ship), Sector 21396 and Cardassia Prime, a headquarters, and
  Enabran Tain "Retired" Spymaster at the end of the hand, so a play of him opens his "when you play" effect with
  its condition met. After him Requisitions Drone, Lenara Kahn Wormhole Theorist and Keiko O'Brien Botanist end the
  hand (#1809), whose plays examine the top 4 of the draw deck, then Annexation Drone and DaiMon Solok Cargo Runner
  (#1812), whose plays score 5 points (every non-headquarters mission is an [AQ] mission, so the Drone's condition
  holds; Solok's does not). It keeps its game under `practiceGame:fixture=tain`.
- `?fixture=downloads` (#1810) deals the `?fixture=piles` table, the same cards and the same ids, with Opaka Kai
  of Bajor and Jean-Luc Picard Vintner *VP at the end of the hand, whose plays download into hand, and Furel
  Resistance Fighter and Lupaza Resistance Fighter, two [Baj] personnel, on top of the draw deck
  (`PRACTICE_DOWNLOADS_TSV`, `extraDrawTop`); the draw deck holds [TNG] personnel for Picard. After them (#1811)
  Gelnon Aloof Tactician, U.S.S. Enterprise Where She Belongs, Reconnaissance Drone and Jem'Hadar Attack Ship, a [Dom]
  ship to play before Gelnon, end the hand, and James T. Kirk Original Thinker, a [TOS] personnel of cost 5, and
  Ixtana'Rax Honored Elder, a Jem'Hadar, follow Furel and Lupaza on top of the draw deck. It keeps its game
  under `practiceGame:fixture=downloads`.
- `?fixture=60s` (#1826) deals the `?fixture=piles` table, the same cards and the same ids, with cards of the
  set 60S (`PRACTICE_60S_TSV`): Blue Skies at the end of the core, so the counters are capped at 7 ("capped at 7
  (Blue Skies)"); Tavana Reinvigorated Soldier, Qartum Delegation Transport, The Crossing and Saavik Seeking
  Possibilities, a Federation personnel for The Crossing's replace in the away team of Moab IV, at the end of the
  hand; and The Warrior's Anthem and Latinum Storage, the downloads of Tavana and Qartum, on top of the draw deck.
  It keeps its game under `practiceGame:fixture=60s`.
- `?fixture=dissident` (#1763) deals the `?fixture=piles` table, the same cards and the same ids, with The
  New Resistance at the end of the core, Leeta Rebel Supporter, a Dissident of cost 0, at the end of the hand,
  and Damar Cardassian Liberator, a Dissident of cost 4, on top of the draw deck (`PRACTICE_DISSIDENT_TSV`,
  `extraDrawTop` of `resetWithPiles`), so a play of Leeta offers the reveal and Damar then plays at cost 1. A play
  of Leeta also opens her "when you play" discard step (#1808). It
  keeps its game under `practiceGame:fixture=dissident`.
- `?fixture=unique` (#1821) deals the `?fixture=piles` table, the same cards and the same ids, with
  8 more (`PRACTICE_UNIQUE_TSV`): Yarka Harbinger of the Prophets, a unique personnel, joins the end of the
  crew of the ship at Bilana System; Vina Orion Slave Girl, a unique personnel, goes into the discard pile;
  and the second Yarka, the second Vina, two Self-Replicating Roadblocks "(limit one per mission)" and two
  Inspiring Leaders "(limit one per ship)" end the hand. With "Check uniqueness and limits" on, a play of the
  second Yarka warns, the second Vina does not, and the second Roadblock or Leader warns on the mission card
  or ship that holds the first. It keeps its game under `practiceGame:fixture=unique`.
- `?fixture=attempt` (#1169) deals the `?fixture=piles` table, the same cards and the same
  ids, and then starts an attempt at Bilana System (mission 2) with the crewed ship, with the
  defaults of the attempt popup: the 12 unstopped crew minus the 3 dilemmas under the mission, so
  the page opens in the attempt layout and its strip reads "draw/spend 9". It then moves the top 4
  dilemmas of the dilemma pile into the dilemma stack, face down (#1170): it switches the attempt to
  the facing phase first (#1189), so its log holds one phase entry. Before that it places 4 cards on
  Bilana System (#1180), face up: the 2 dilemmas of the pile below those 4, then 2 events of the core,
  so the core holds 2 events and 2 more dilemmas leave the dilemma pile, and the
  attempt layout shows the column of the placed cards. It keeps its game under
  `practiceGame:fixture=attempt`. `?fixture=piles` deals no attempt.
- `?fixture=attempt-choose` (#1189) deals the same table, places the same 4 cards on Bilana System,
  and starts the same attempt, and stops in the dilemma choice: phase `'choose'`, `drawn` 0, an empty
  dilemma stack and an empty dilemma hand.
  It keeps its game under `practiceGame:fixture=attempt-choose`.
- `?fixture=bot` (#1289) deals the `?fixture=piles` table, the same cards and the same ids, as a bot
  game (`TableState.opponent: 'bot'`): the Chula pile of the dilemma bot (`chulaPileDeck`) takes the
  place of the deck's dilemmas, in pile order, with no shuffle, so the 3 dilemmas under Bilana System
  are Chula dilemmas. It keeps its game under `practiceGame:fixture=bot`. The game menu of a bot game
  shows "<deck> vs the bot (<pile>)" (`data-testid="game-menu-bot-game"`), and Reset deals a bot game again.
  A player starts a bot game in Load deck's step 2 (#1520): Play against the bot opens a list of the
  bot's piles (`data-testid="practice-deck-picker-bot-pile"`, rows `bot-pile-<id>`, `bot-pile-chula`
  first): Chula, then each beginner and visible Championship deck whose dilemmas the registry
  covers (`botPileChoices` in `src/lib/dilemmaBot/botPiles.ts`). A chosen deck's dilemmas, less the
  ignored titles, become the bot's pile, and `TableState.botPile` keeps its id, its name and the
  affiliations of its personnel, which reach `PileAttempt.botAffiliations`. A bot game with no
  `botPile`, as `?fixture=bot` deals, plays the Chula pile.
  When the chosen deck's `Deck:` section holds Unexpected Difficulties (`BotPileInfo.unexpectedDifficulties`,
  #1563), the bot uses it once a game at Start: with 4 or more drawn and a search answer of `'cannot-fail'`
  (`botRedraws` in `useBotAttemptStart.ts`), it puts the drawn dilemmas on the bottom of the pile, face up,
  draws as many again and chooses from those. The one `botAttempt` carries `redrawn`, sets
  `TableState.botUsedUnexpectedDifficulties`, and its log entry says so; a new game clears the flag.
- `?fixture=bot-costs` (#1738) deals the `?fixture=bot` table, the same cards and the same ids, with
  Ptol (`17V077`, cost 5) at the end of the hand (`PRACTICE_BOT_COSTS_TSV`). In a bot game a play of
  Ptol reveals the top four cards of the bot's dilemma pile (`CostFacts.opponentDilemmaPile`, filled only
  when `opponent` is `'bot'`), costs 5 less the dual dilemmas among them, and puts the four on the bottom
  of the pile in pile order: `withShuffleOrders` turns the play into one `batch`, the charged move (with
  `costReveal`, its ids) and a move of each card to the bottom, so one entry and one undo. The page opens
  the dilemma pile's reveal panel at the bottom on those four (`actionReveal`), where the player orders
  them; an undo closes it. In a game with no bot Ptol keeps its counted choice. It keeps its game under
  `practiceGame:fixture=bot-costs`.
- `?fixture=bot-roadblock` (#1789) deals the `?fixture=bot` table, the same cards and the same ids, with
  Self-Replicating Roadblock (`30V017`) at the end of the hand (`PRACTICE_BOT_ROADBLOCK_TSV`). It keeps its
  game under `practiceGame:fixture=bot-roadblock`.
- `?fixture=bot-label` (#1519) deals the `?fixture=bot` table with one Well-Prepared Defenses
  (`17V017`) added to the dilemma pile, and starts a bot attempt at Bilana System with the bot's
  numbers, with no search, in `'face'`: the stack holds Well-Prepared Defenses on top, face up, and
  the next 3 dilemmas of the pile face down, so the page opens on the bot's label. It keeps its game
  under `practiceGame:fixture=bot-label`.
- `?fixture=bot-resolve-noeffect` (#1589) deals the `?fixture=bot-label` table and attempt with one
  Conflict of Interests (`26V002`) in place of Well-Prepared Defenses, revealed on top of the stack.
  The Bilana System crew meets its `unless` check, so its Resolve preview reads "No effect" and a press
  of Resolve changes no zone. It keeps its game under `practiceGame:fixture=bot-resolve-noeffect`.
- `?fixture=bot-resolve-choice` (#1593) deals the `?fixture=bot-label` table and attempt with one
  Covert Extraction (`38V002`) in place of Well-Prepared Defenses, revealed on top of the stack. The
  player chooses a personnel with Intelligence or Transporters to be stopped, so its Resolve preview
  reads "Choose 1 personnel to be stopped" and Resolve is disabled until one allowed personnel of the row
  is selected. It keeps its game under `practiceGame:fixture=bot-resolve-choice`.
- `?fixture=bot-resolve-pattern` (#1594) deals the `?fixture=bot-label` table and attempt with one
  A Pattern of Lies (`10C001`) in place of Well-Prepared Defenses, revealed on top of the stack. The
  reveal rolls its three personnel and the reveal snapshot keeps them, so its Resolve preview reads
  "Choose 1 of the selected to be stopped" (or "Stops 3" when the three share a species), the
  same set after a reload, and Resolve is disabled until one personnel of the set is selected. It keeps
  its game under `practiceGame:fixture=bot-resolve-pattern`.
- `?fixture=bot-resolve-becalmed` (#1628) deals the `?fixture=bot-label` table and attempt with one
  Becalmed (`36V002`) in place of Well-Prepared Defenses, revealed on top of the stack. The reveal rolls
  its three personnel and the reveal snapshot keeps them, so its Resolve preview reads "1 of 3 has
  Integrity, Cunning or Strength > 6: stops 1" (or "None of 3 has …: no effect"), the same after a
  reload, and Resolve stops exactly the personnel its check marks. It keeps its game under
  `practiceGame:fixture=bot-resolve-becalmed`.
- `?fixture=bot-resolve-modifier` (#1598) deals the `?fixture=bot-label` table and attempt with one
  Accelerated Aging (`11P001`) in place of Well-Prepared Defenses, revealed on top of the stack, and one
  Dead Weight (`36V005`) face down right under it (`BotRevealFixture.next`). Its Resolve preview reads
  "First skill off for the rest of the attempt"; after the press, with Accelerated Aging moved off the
  stack, a flip of Dead Weight previews a stop, where the crew with its first-listed skills meets the
  check and reads "No effect". It keeps its game under `practiceGame:fixture=bot-resolve-modifier`.
- `?fixture=bot-resolve-overcome` (#1760) deals the `?fixture=bot-label` table with Stakoron Strait
  (`33V030`) in place of Bilana System, and starts the bot attempt there with a spend of 4 and Conflict of
  Interests (`26V002`, dual, cost 4) revealed on top: the mission raises it to 5, past the spend, so its
  Resolve preview reads "Overcome with the 3 after it: Stakoron Strait raised the cost past the spend". It
  keeps its game under `practiceGame:fixture=bot-resolve-overcome`.
- `?fixture=bot-resolve-prevent` (#1761) deals the `?fixture=bot-label` table with Sigma Iotia II Assess
  Contamination (`23V027`) in place of Moab IV, slot 0, and starts the bot attempt there with its away team
  of 20 (`BotRevealFixture.awayTeamSlot`), Well-Prepared Defenses (cost 2, no skill) revealed on top, so its
  Resolve preview reads "Prevented and overcome (Sigma Iotia II)" and no label shows. It keeps its game
  under `practiceGame:fixture=bot-resolve-prevent`.
- `?fixture=bot-resolve-60s` (#1845) deals the `?fixture=bot-label` table and attempt with Urgent Search
  (`67V020`), a dual dilemma of 60S (`titles/set60S.ts`), in place of Well-Prepared Defenses, revealed on top
  of the stack. Its label names the attribute the most of the crew share ("Named Integrity"), the reveal
  keeps its roll of one personnel, and its Resolve preview names the others it stops. It keeps its game
  under `practiceGame:fixture=bot-resolve-60s`.
- `?fixture=bot-resolve-jailbreak` (#1846) deals the `?fixture=bot-label` table and attempt with Jailbreak
  (`67V009`), a dual dilemma of 60S, in place of Well-Prepared Defenses, revealed on top of the stack. The
  reveal keeps its roll of two personnel; when neither has Physics or Cunning>13 its Resolve preview reads
  "… places 2 on top of the draw deck", and the press puts them on top of the draw deck, logged "put on top
  of the draw deck …". It keeps its game under `practiceGame:fixture=bot-resolve-jailbreak`.
- `?fixture=bot-select-again` (#1847) deals the `?fixture=bot-label` table and attempt with one Hard of
  Heart (`38V004`), a planet dilemma that selects 2 personnel at random, in place of Well-Prepared Defenses,
  revealed on top of the stack, and starts the bot attempt at Moab IV with its away team of 20
  (`awayTeamSlot` 0), with Let's Try That Again, Shall We? at the end of the core and Dessert Disaster at
  the end of the hand (`PRACTICE_BOT_SELECT_AGAIN_TSV`), so the preview shows the controls of the kept
  roll. It keeps its game under `practiceGame:fixture=bot-select-again`.

The closed hand (or collapsed hand) is a small face-up fan at the bottom edge of the screen
(`data-testid="hand-closed-fan"`, #1489), drawn on top of the bottom row in its own layer,
`LAYER_CLOSED_HAND`, and taking no width in the row. It is the arc of `handArcLayout` with pile cards
(`pileCardSize`), showing the whole of each card above the edge (`CLOSED_FAN_VISIBLE`, 1, #1542), its bottom
edge on the screen's, so its top is about where the touch arc's top was before #1542, and it spans at most `CLOSED_FAN_CORE_CARDS` (2)
cards of the core however many cards the hand holds. The closed dilemma hand
(`dilemmaHand-closed-fan`) sits at the right end of the core and brig box (`flat-rows`), and the hand
at its left end in the dilemma choice, the one place the dilemma hand shows. Everywhere else, on the
full table and in the facing phase, the hand sits in the middle of the screen, slid inward to stay
over the box (`closedFanSpan` in `CardHand.tsx`, #1496). Its cards
carry no `data-card-id` and do not drag: a card of the hand is picked up from the open arc. A hold on
one previews it (`PREVIEW_CARD_ID_ATTRIBUTE`). The fan is no focus layer: no backdrop, and Escape
leaves it alone. Its button is the drop target `hand` (or `dilemmaHand`) over the box of its visible
cards only, and `collisionDetection` puts it before the core or the brig under it. An empty hand draws
nothing, and its dashed "Empty" marker during a drag. With no hand slot, the bottom row starts right
of the left column (`TOUCH_CONTROLS_COLUMN`), so the left column runs down to the bottom edge.

A tap on the closed hand opens it as an arc along the bottom edge of the screen
(`data-testid="hand-arc"`, `handArc.ts`, #1125): on a desktop nearly the whole of each card shows
above the edge, the arc raised by `ARC_DESKTOP_RAISE` (0.875) of its visible height, no higher than keeps
the "→ top" and "→ bottom" row on the screen (#1495, #1542), and no card's bottom edge above the
screen's. About half of each card is below the edge in touch mode, where the arc sits as high as the
plain arc; #1542 dropped the 20% lower of #1149, so the arc shows 25% more of itself. In touch
mode the arc is also flatter, with no sag and an end angle of 7° (`ARC_TOUCH_OPTIONS`), and the
lowest top corner of every card stays at least `max(20, the bottom safe-area inset) + 44` px above
the bottom edge (`arcTouchMinVisible`, #1380, #1383), clear of the iOS edge gesture: 64 px at an inset
of 0 (`ARC_TOUCH_MIN_VISIBLE`), 78 at 34; a desktop arc keeps its sag and its 14°. The
arc stays between the draw deck and the dilemma pile, over the core and the brig. The dilemma hand
shows only in the attempt layout in `'choose'` (#1223): the full table has no dilemma hand, and a tap on
the dilemma pile draws nothing. A tap on the closed dilemma hand opens it as the same arc, in the same
gap (`data-testid="dilemmaHand-arc"`, #1150). At most one hand is open as the arc: while one is open
the other stays a small fan, and a tap on that fan opens it and closes the first. A press on a card of the arc becomes a drag only after
20 px (`HAND_ARC_DRAG_ACTIVATION_DISTANCE`, #1131), not 8, so a thumb that drifts near the bottom
edge still gets the hold preview.

Use `/decks/practice?fixture=piles&reset=1&menu=0` for a check of the hand, of a drag from the hand,
or of anything else that needs cards in the hand, and for a check of dilemmas
under a mission, the brig, the core, a card placed on a ship, a ship on the table, the crew, the
away team, or a long card list panel. Use `/decks/practice?fixture=1&reset=1&menu=0` for a check of
a fresh game, the draw deck, or the dilemma pile. Use `/decks/practice?fixture=attempt&reset=1&menu=0`
for a check of an attempt in progress or of the dilemma stack.

To keep the bottom of the page clear, start the dev server with `NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev`. This hides the consent banner and the Next.js dev tools button.

`agent-browser` is a devDependency, so `npx agent-browser` runs the copy in `node_modules`
and downloads nothing. In CI the dependencies are installed before the agent starts. Do not
run `yarn install`.

The version is pinned to `0.39.1`. Every release from `0.27.1` declares `engines: { node: ">=24" }`,
so it installs only on Node 24, which CI, the agent workflows and `engines.node` in `package.json`
all use (#1238).

To check drag and drop on the practice table, use the script. It takes a card ID and a target name, and it prints the zone the card is in after the drag. The target name is a `data-zone`, or, when no element has that `data-zone`, a `data-testid` (#1026). It is a name, not a CSS selector. A `data-testid` marks a place that is not a drop target of its own, so to aim at one means to drop at that spot: the droppable under the spot routes the drop.

The script prints a `data-zone`, or, for a card that left the DOM, the `data-zone` or `data-testid` of the badge that gained a card. Each printed name is also a valid target, except two fallbacks: the counter of the cards on a mission prints the mission's name, and a crew badge with no `data-zone` ancestor prints the ship's name.

The examples drag hand cards, so they run on `/decks/practice?fixture=piles&reset=1&menu=0`:

```bash
bash scripts/practice_drag.sh card-7 core
bash scripts/practice_drag.sh card-8 brig
```

The popup that lists the cards of one place is the `CardListPanel`. Its grid carries
`data-testid="card-list-panel-<location>"`, where the location is a value of `PanelLocation`
(#856). Every card list panel, the game log, the decklist, the Controls panel and the home screen help
carry an X at their top right, `data-testid="panel-close"` (`PanelCloseButton.tsx`, #1780), named
"Close panel"; a tap closes the panel as a tap on its backdrop does. In a card list panel it sits at
the right end of the line of `panel-controls` (`panel-top-line`), outside the scrolling grid, and
hides with the panel during a drag. The draw deck is the zone `drawDeck` (#838), so its panel is
`card-list-panel-drawDeck`.

The draw deck and the dilemma pile each have three buttons, Shuffle, Download and an eye, stacked
in a column (`data-testid="pile-controls"`) that overlaps the left edge of the pile (#1070). The eye,
"Reveal the draw deck" or "Reveal the dilemma pile", opens the reveal panel, `card-list-panel-drawDeckReveal`
or `card-list-panel-dilemmaPileReveal`. It starts empty. Each tap of "Reveal top" shows one more card
from the top of the pile without moving it, and each tap of "Reveal bottom" one more from the bottom
(#1078). The panel shows one end at a time: the first tap for the other end clears the cards shown.
Its cards reorder like the dilemma stack's, and the reorder changes the pile. A card sent by Top or
Bottom to the end shown stays in the panel, and a card sent to the other end leaves it. Closing it forgets what was revealed.

The panel grid is not a drop target (#861). It has no `useDroppable`, so a drag must not aim at
it. Use the `data-testid` to find the panel, or to open it, and nothing more. If
`practice_drag.sh` prints a `card-list-panel-` name, the card did not move: the script prints the
nearest `data-zone` ancestor of the card, and a card inside the panel keeps the panel as its
ancestor. A drag into an open panel is not possible from the table, because the open panel covers
every card of the table.

The draw deck card on the table has two drop halves, and they keep the older ids
`draw-pile-top` and `draw-pile-bottom`, so a drop into the draw deck aims at one of those two,
and the script then prints `draw-pile-top` or `draw-pile-bottom`. The dilemma pile works the same
way with `dilemma-pile-top` and `dilemma-pile-bottom`. The script prints the half the card reached:
a card on top stays in the DOM as the pile's top card, and a card at the bottom leaves the DOM, so
the script reads the `data-pile-count` of the pile's wrapper (`data-testid="draw-pile"` or
`"dilemma-pile"`) to see it gain a card (#1025).

A mission pile, a closed hand, and a closed dilemma hand all keep their cards out of the DOM as `data-card-id`s (a badge with a count stands in for the cards; the small fan of a closed hand shows the faces, but they carry no `data-card-id`). When the dragged card leaves the DOM, the script reads the `aria-label` of every badge on the table, before and after the drag, and prints whichever one gained a card - the mission pile, `hand`, `dilemmaHand`, `draw-pile-bottom`, or `dilemma-pile-bottom`. If none did, or more than one did, it says so instead of guessing.

The script opens a closed hand or a closed dilemma hand that holds the card, drags the card, and closes the hand again (#1027). It does not open a card list panel, a mission pile, or a ship's crew. When no point of the card is on top, the script names what covers it, for example the backdrop of an open card list panel, and prints the step that clears it.

Do not build the drag by hand. Three things make a hand drag fail, and each one has cost a run its whole turn limit:

1. A mouse down on a card of the open hand closes the fan, and the table then reflows. Coordinates read before the drag point at the old layout, so the drop lands in the wrong zone. Read the rect of the target zone **after** the drag starts.
2. The cards of the fan overlap, and the later card is on top. The centre of a card is often under its neighbour, so the drag moves the wrong card. Find a point where `document.elementFromPoint` returns the card you want.
3. A release near the press point cancels the drag (#774, `releaseCancel.ts`). A release less than 24 px, in a straight line, from the press point puts the card back where it was (#825). Release at a point of the target at least 24 px from the press point. When the whole target is closer than that, the script says so rather than printing `hand`.

`collisionDetection.ts` ranks a drop by `pointerWithin` first, so the pointer must stop inside the rect of the target zone.

`npx agent-browser drag '<from>' '<to>'` works for a card that no other card covers and a target that does not move, such as a drag out of a card list panel. It fails silently on a hand card: it reports `Done` and moves nothing.

Each card in the core and the brig has a drop target of its own, `on-<the card's id>`. A drop there adds the dragged card to the zone, the same as a drop on the zone, so `practice_drag.sh` prints `core` or `brig`. Only a hold over the card for `PLACE_ON_HOLD_MS` (800 ms, `useCardHold.ts`) arms it, shows the `over` ring on that card, and makes the drop place the dragged card on it (#1029). `practice_drag.sh` does not hold: in both modes it sends the drag through `cdp_input.sh` on one connection and releases about 50 ms after the last move (#1043). The mouse commands of `cdp_input.sh` wait `HOVER_SETTLE_MS` (100 ms) between the first move and the press, so a hover preview that the previous call left open closes first and does not eat the press (#1256). Check a placement with the manual mouse sequence below: move onto the card, wait 800 ms or more with `npx agent-browser wait 1000`, then release. The core and the brig share the free space of the bottom row (`flatRowWidths.ts`), and their cards overlap past it.

As a second guard, to aim at `core` or `brig` the script picks a point of the zone where no card is, at least 4 px from any card (#1044). The cards of the core and the brig are art crops as tall as the draw deck's card, 80 px (#1234), more on a large screen. Each zone always fills its share of the bottom row, and the two dashed outlines with the gap between them span from the draw deck to the dilemma pile (#1425). A closed hand's small fan sits over the core and the brig (in the middle of the screen, or over the left end of the core in the dilemma choice, #1496), and the script's point avoids it as it avoids a card (#1489), so a zone has free space right of its last card unless its cards fill it. A zone with no such point gets the point nearest its centre where the zone or one of its cards is on top, so not under a closed hand's small fan, and with none of those the point nearest its centre, as before: that point is on a card, and a drop on a card that no hold armed still adds the card to the zone.

An `agent-browser` call takes about 600 ms, so a sequence of `mouse move` and `wait` calls cannot rest on a card for less than 800 ms. To time a hold, use `cdp_input.sh mouse-path` (or `touch-path`). It presses, makes the 8 px first move, glides to each waypoint `<x>,<y>,<hold-ms>` in turn, rests there for its hold, and releases at the last one, all in one call:

```bash
# 500 ms on core card A, 300 ms in the free part of the core above it, 1000 ms back on A
bash scripts/cdp_input.sh mouse-path 391 575 227,592,500 227,547,300 227,592,1000
```

To see when a card armed, install a `MutationObserver` on `data-highlight` before the call: the armed card's `on-<id>` gets `over`, and the zone goes from `over` to `valid` at the same moment.

A ship has one drop target, `crew-<the ship's card id>`, over its art. A personnel or an equipment dropped there boards the crew (#893), a ship goes to that ship's own ship row (#668), and any other card is placed on the ship, and the ship shows a counter of the cards on it. The ship's crew badge is not a drop target (#923); it only shows the size of the crew, and it shows even when the crew is empty.

A mission card takes a placed card too. Its art has two drop halves (#871), each the full width and half the height of the card: `mission-under-<index>` on top and `mission-on-<index>` below (#917). The top half reaches up over the slivers of the dilemmas under the mission (#990), so a drop on a sliver goes under the mission. They differ only for a dilemma: the top half puts it under the mission, and the bottom half places it on the mission card. During a dilemma drag the half under the pointer reads "Under" or "On", and in the facing phase of the attempt layout "Overcome" or "Place on" (#1424, `MISSION_HALF_LABELS` in `MissionRow.tsx`). A tap on the top half opens the under-the-mission panel, and does nothing when no dilemma is under the mission. A tap on the bottom half opens the away team panel, and does nothing when the away team is empty (#967). A double-tap on the mission card (two taps within 250 ms, `DOUBLE_TAP_MS`) toggles its completion and opens no panel, so a single tap acts only after that window passes (#1059). A completed mission is darkened and turned 90° clockwise inside its slot (#1060); the slivers, the counter and the Flip button stay upright, and nothing else on the table moves. On a desktop every mission slot is as wide as the turned card all the time, and the two drop halves span the slot's width. For the keyboard, a button visually hidden until it has focus, `data-testid="mission-toggle-<index>"`, toggles it too. Six missions act on the player's cards when marked complete (#1757, `completionEffects.ts`, by whole title): Gateway Flee in Terror flips at once; Saturn, Starbase 718, Bassen Rift, Aldea and Cheron Aid Planetary Recovery open a panel, `data-testid="completion-effect"`, that quotes the effect, with candidates (`completion-effect-candidate`, `data-card-choice`), a total against the cap (`completion-effect-total`), Confirm (`completion-effect-confirm`, disabled until the pick is valid), Bassen Rift's "Destroy the ships here" (`completion-effect-destroy`) and Skip (`completion-effect-skip`), which completes with no effect; Escape and the backdrop cancel, and the mission stays not complete. The completion and its effect are one `batch`, one `missionCompleted` entry with `effect`, and one undo; the effect's moves are never charged. Cheron (#1828, the kind `'score'`) counts the different species involved, each personnel's whole `species` lowercased, so a Human/Vulcan is a species of its own (`involvedSpecies`), shows them (`completion-effect-species`), and offers **Score 5** (`completion-effect-confirm`) only at four or more, an `adjustScore` in the batch; its entry keeps the count, Skip too (`CompletionLog.species`, `scored`), "Completed Cheron Aid Planetary Recovery: 4 different species involved; scored 5 points" or "…: 3 different species involved; no points". "Involved" is the unstopped personnel of the attempt in progress at the mission, or else of the last attempt there, which `endAttempt` records as `MissionSlot.involved`, those still in an away team or a crew. A hold on either half shows the mission preview. For every other type both halves do the same thing: a ship goes to the ship row, a personnel or an equipment goes to the away team (#870), and any other card is placed on the mission card. A mission slot with no mission card sends a dilemma under the mission from either half. The mission has no event pile. The cards placed on the mission count in two badges in the badge strip, to the right of the away team badge: the events badge, `data-testid="mission-on-events-<index>"`, with the event icon, counts every placed card that is not a dilemma (#1069), and the dilemma badge, `data-testid="mission-on-dilemmas-<index>"`, with the dual icon, counts the placed dilemmas (#1081). Where the mission is the whole card, on the desktop full table and in the attempt layout on every device, the strip goes away and the counts sit on the card, at its bottom right, each icon as tall as the printed affiliation icons (`data-testid="mission-counts-<index>"`, `missionCountIconHeight`, #1494): the away team, the events and the dilemmas on the desktop table, only the events and the dilemmas in the attempt layout. They stay upright on a completed mission. The desktop mission column no longer counts the strip (`missionColumnHeight`); the attempt layout still reserves its height below the mission (`attemptMissionColumnHeight`), so its sizes do not change. Each shows only when its count is above 0, and a tap on it opens a panel of only its own cards, `card-list-panel-onEvents` or `card-list-panel-onDilemmas`. The mission card also shows the last 3 cards of each group as small cards in a strip along its edge (#1099), below its title and above its point box: the events on the left, `data-testid="mission-on-events-strip-<index>"`, and the dilemmas on the right, `mission-on-dilemmas-strip-<index>`. The attempt layout draws a column beside the card instead (#1180). Each strip sticks out 3 px past the card's edge on its side (#1126). A strip is not a drop target and its small cards have no `data-card-id`, so a drop on a strip lands on the mission half under it. A tap on a strip opens the same panel as its badge once the double-tap window passes, a double-tap on it toggles completion, a hold on a small card previews that card, and the strips turn with a completed mission. Both sit outside every `data-zone`, so `practice_drag.sh` prints them under the mission's name. A drop under a mission prints `mission-under-<index>`, the name of the drop target, whether the card shows as one of the two slivers above the mission or has left the DOM (#920). The stack of slivers is not a drop target, so it has no `data-zone`; the script finds it by its `data-testid`, `mission-under-<index>-stack`. The away team badge, `data-testid="mission-pile-awayTeam-<index>"`, is not a drop target (#924), and it shows only while the away team holds a card (#1565). The bottom half `mission-on-<index>` reaches down over the badge strip (or covers the counts on a whole card), so a drop on the badge routes as a drop on the mission card does: a personnel or an equipment joins the away team, and the landed cue plays on the badge. `practice_drag.sh` prints a move into the away team as `mission-pile-awayTeam-<index>`, the badge's `data-testid`. The script can aim at the badge by that name too, and the drop then lands on `mission-on-<index>`; an empty away team has no badge, so to fill one aim at `mission-on-<index>`:

```bash
# on ?fixture=piles, where card-1 is the Tricorder in the hand
bash scripts/practice_drag.sh card-1 mission-pile-awayTeam-0   # prints mission-pile-awayTeam-0
```

The bare ship row, `ship-row-<index>`, takes only a ship (#886). Any other card dropped there, off any ship, stays where it was, so `practice_drag.sh` prints the zone it came from.

To put a card into a ship's crew, drag it out of a mission's card list panel onto the ship. That drag lands. The drag of a ship onto its ship row prints the ship's own zone:

```bash
# on ?fixture=piles, where the hand holds the ships card-39 and card-40
bash scripts/practice_drag.sh card-39 ship-row-0         # prints crew-card-39
bash scripts/practice_drag.sh card-1 mission-on-0        # an equipment joins the away team
# open that card list panel, then:
bash scripts/practice_drag.sh card-1 crew-card-39        # boards card-1, prints crew-card-39
bash scripts/practice_drag.sh card-9 crew-card-39        # places an interrupt on the ship; prints crew-card-39
```

A tap anywhere on the ship, the counter of the cards on it too, opens its crew panel (#963). The crew panel shows the cards on the ship as tiny cards below the ship, and a drag of a tiny card out of the panel takes it off the ship.

A drag out of the core onto a ship has failed once. See #701.

The **Play** target (#1729, `PlayTarget.tsx`, `playTargetRules.ts`) plays an event that resolves at once.
It shows during a drag only when "Resolve events in a panel" is on, the segment is play and draw, no
attempt is in progress, `resolving` is empty, and the drag carries one card, from the hand, for which
`resolvesOnPlay` is true (`playTargetEligible`), and only while the pointer is above the line:
`PLAY_TARGET_MARGIN` (16 px) above the higher of the bottom row's top and the closed hand fan's top
(`playTargetLine`, read on each `onDragMove`). It goes away below the line and when the drag ends. It
is a droppable, `data-zone="resolving"`, `data-testid="play-target"`, reading Play, over the whole
table above the line, in `LAYER_PLAY_TARGET`, with no pointer events; it shows the `valid` ring and
the `over` ring under the pointer. `collisionDetection.ts` ranks it first in both stages, so a drop
anywhere on it is a play, never a drop on the mission or ship under it. A drop dispatches a `move` to
`resolving`, charged and logged as a play, the panel opens, and its card plays the landed cue. Below
the line every target of the bottom row takes the card as before, uncharged. `resolvesOnPlay` matches
"plays in" and "plays on" in any case: the page's card data is lowercased. `practice_drag.sh` aims at
it as `resolving`: it first glides to a point above the line (`cdp_input.sh --via-eval`), then reads
the target, and prints `resolving`:

```bash
# on ?fixture=costs with the setting on, where These Are The Voyages ends the hand but one
bash scripts/practice_drag.sh <its card id> resolving   # prints resolving
```

### Undo

The undo button, `data-testid="undo-button"` (#1194), sits in the top-left column under the menu
button and the fullscreen button. Its `aria-label` and `title` read "Undo: <the last log entry>",
and it is disabled while the log is empty. A tap takes back the action of the last log entry and
removes the entry. With a fine pointer, Ctrl+Z or Cmd+Z does the same. The saved game holds the
log (#1400), and the undo and redo histories live under a key of their own, the game's key followed
by `:history`, for example `practiceGame:fixture=piles:history` (#1401, `gameHistory.ts`). They hold
the change of each step, the order of every shuffle too, so a reload keeps undo and redo, with the
same results. A save with no usable history, an older one or one whose history does not match the
table, restores the table and the log with empty histories, and the button stays disabled until the
next action. When the quota is full, the history keeps only its newest steps, and the table save
never fails for it. To compare the order of the draw deck before and after an undo, read it from
the save:
`JSON.parse(localStorage.getItem('practiceGame:fixture=piles')).table.drawDeck.map(c => c.id)`.

The page chooses the result of every shuffle before the dispatch, and the action carries it as
`order` (`withShuffleOrders` in `gameLog.ts`): a `shuffle`, the shuffle of a Download, and a
`drawCard` that reshuffles the dilemma pile. `tableReducer` calls no random function.

The redo button, `data-testid="redo-button"` (#1403), does again the last action that undo took
back, and puts its entry back in the log. It sits beside the undo button, in one row, on the full
touch table, so the turn and score column keeps its place, and under it on a desktop and in the
attempt layout, where a row of two would cover the first mission. Its `aria-label` and `title` read
"Redo: <the entry it does again>", and it is disabled while nothing is undone. With a fine pointer,
Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y do the same; Cmd+Y is left to the browser. Redo puts back the
table the action left and never runs it again, so a redone shuffle keeps its order. Any new action
after an undo empties the redo history. A reload keeps it (#1401).

The game log button, `data-testid="game-log-button"` with `aria-label="Game log"` (#1399), sits under
the undo button, last in the top-left column, in every view, the attempt layout too. A tap closes the
game menu splash if it is open and opens the game log, `GameLogPanel`. The splash has no Game log item.

Escape closes the top layer of the table and only that one (#1467, `useEscapeLayer.ts`): the game
menu, a card list panel, the open hand or dilemma hand, the decklist, the game log, the Controls
panel, the attempt popup and the Move to… list. During a drag it does nothing. A new layer that
closes on Escape joins the same stack with `useEscapeLayer` rather than a `keydown` listener of its own.

### A mission attempt

An **Attempt** button (`data-testid="attempt-button"`, #1163) shows in the away team panel of a
planet mission and in the crew panel of a ship on the ship row of a space mission, and nowhere else:
not at a headquarters, not at a completed mission, not in a panel with no unstopped personnel, and not
while an attempt is in progress. It opens the popup, `data-testid="attempt-dialog"`, with two fields,
`attempt-personnel` and `attempt-subtract`, the result `attempt-result` ("draw/spend N"), and
`attempt-start`. Start opens the **attempt layout** (#1164), `data-testid="attempt-layout"`, in place of
the mission row. Its strip across the top, `attempt-strip`, holds the status (`attempt-status`: the
mission's name, and the ship's at a space mission), `attempt-draw-spend`, the button
`attempt-view-full-table` and the button `attempt-done`, which moves every dilemma still in the
dilemma stack under the attempted mission, face up and in stack order, ends the attempt, and brings
back the mission row (#1170). The log gets one entry: "Ended the attempt at <mission>, and moved
<cards> under <mission>", or only its first part when the stack was empty. Below the strip, left to right: the attempted mission, drawn whole and larger than on the
table, the ships column `attempt-ships` (the away team row, then every ship of that mission's ship
row), and the dilemma stack. In `'face'` the body fills the row (#1365): the mission lines up with the
strip's left edge, the stack ends at the content padding on the right, and the personnel row takes
all the width between. At a space mission the ships sit 2 to a row in a column only as wide as its
widest row of ships, with the crew row beside them (#1177, #1365), and no away team badge shows. In `'face'` the dilemma stack is one
whole card, `stack[0]`, as tall as the mission card, and every later card face down to its right as a
sliver: the zone is at most 1.2 times as wide as its top card (`attemptFacingStackSize`, #1218). The
mission grows only while the personnel area keeps 3 cards at the crew panel's width, so it stops
growing where it would take their width, and the dilemma choice, which keeps the facing phase's
`missionScale`, draws the same mission. The bottom row does not change. The dilemma stack mounts only here
(#1170), so the `dilemmaStack` drop target exists only in the attempt layout.

Every attempt keeps its own draw and spend, `Attempt.draw` and `Attempt.spend` (#1759): N, the bot's
Draw and Spend in a bot game, or N changed by the attempted mission (`attemptMissions.ts`, by whole
title): Class 9 Nebula Bypass Disputed Region lowers both by 1 when every unstopped personnel involved
shares an affiliation (`attempt-mission-change` names it), and two toggles of the popup,
`attempt-mission-offer-<key>`, off at first: Mouth of the Wormhole Form Labor Union's "Spend −1" for 6
unstopped Dabo Girls or Waiters, and Rigel X Locate Mysterious Contact's "Draw 2 cards" for 6 unstopped
personnel, which draws 2 cards into the hand, free, in the same `startAttempt` (`drawCards`), and raises
both by 1. The strip, "Drawn 3 of D" and the log read the stored pair; a save from before restores it as
`botDraw`/`botSpend`, else N. Caldos IV Upgrade Colony (#1828) offers `attempt-mission-offer-caldos-iv`,
"Download Howard Heirloom Candle", while no dilemma is beneath it and the draw deck holds a copy
(`AttemptMissionPlace`); the start then carries `downloadId`, takes the copy into the hand and shuffles the
draw deck in the order `withShuffleOrders` chose (`downloadOrder`), in the attempt's one entry, "(downloaded
Howard Heirloom Candle, shuffled the draw deck)". The card is not in the card data yet, so the offer never
shows in a real game.

Crescent Nebula Take Out the Trash (#1828) adds Intelligence to the requirements of each other non-[Fed]
mission with requirements: `src/lib/requirementRules.ts` (`addedRequirements`, `requirementTextsOf`) is the one
rule that the bot (`pileTableInputOf` hands it the changed `skills`), the cost facts (`CostMission.requirements`)
and the deck builder's requirement analysis (`parsedRequirementsOf`) read.

In a bot game (`?fixture=bot`), Start opens straight into `'face'` (#1299). The popup stays open,
with Start reading "The bot is choosing…", while the bot draws Draw dilemmas and chooses a stack
within Spend; then one `botAttempt` action starts the attempt with the chosen stack face down and the
other drawn dilemmas at the bottom of the dilemma pile, face up. It makes one log entry, and one undo
takes it all back. The strip of a bot game has no Draw dilemma, no drawn count and no phase button.

In a bot game's `'face'`, the revealed top card of the facing stack shows the bot's choice for it, a
button over the right of its art, above its text box (`data-testid="dilemma-bot-label"`, #1519): the
label its model's play makes (`pileLabelOf` in `src/lib/dilemmaBot/pile/label.ts`), read once per
revealed top card from the table as it stands (`pileTableInputOf` in `attempt.ts`), so from the
unstopped personnel. The play faces the rest of the stack after it, at the attempt's `botSpend`, with
the cost of the cards revealed before it already spent (`botLabelOf`, #1556): `botAttempt` records the
chosen stack on `Attempt.botStack`, and a `flip` that reveals a stack card in `'face'` adds it to
`Attempt.botRevealed`, so a reload gives the same label. A dilemma whose text has the opponent choose personnel labels the bot's choice, "Chose <name>[, <name>]",
with `PlayState.botChoice` (#1574), and one that has the opponent name a skill, an attribute or a title
labels "Named <it>"; neither label holds the dilemma's title. A title with no model, a Chula title, or a play that makes no label shows none.
A tap dismisses it for the rest of the attempt. It is page state, so a reload shows it again.

Two player cards change the kept roll of the revealed top card while it is unresolved, its row marks
show and its `RevealSnapshot.picks` is non-empty (#1847, `tableReducer.ts`). **Select again**
(`data-testid="dilemma-select-again"`), under Resolve, shows while the core holds Let's Try That Again,
Shall We? and the dilemma's own kind is planet (`dilemmatype` `p`, never a dual dilemma, wherever it is
faced; `selectAgainEventOf`): a tap dispatches `selectAgain`, which moves the event to the discard pile
and replaces the picks with a fresh roll that `withShuffleOrders` makes as it does for a `flip`, in one
`selectedAgain` entry, "Let's Try That Again, Shall We?: Hard of Heart selected again, and …". **Dessert
Disaster** (`dilemma-replace-pick`) shows while the hand holds it, a picked personnel has no staffing icon
(neither `[Cmd]` nor `[Stf]`) and an unstopped, unpicked `[Stf]` personnel is in the attempting row
(`replacePickOptionsOf`): a tap lists each swap, `dilemma-replace-pick-choice` with `data-from` and
`data-to`, "Replace Data with Worf", and a tap on one dispatches `replacePick`, which swaps the id in the
picks and moves the interrupt to the discard pile, in one `pickReplaced` entry. The preview, the row
marks and the Resolve read the new picks, and one undo takes back either.

Beside the label, over the text box of the revealed top card, the same card shows the preview of the
bot's Resolve, `data-testid="dilemma-resolve-preview"` ("Stops <name>", "Kills 2 random personnel",
"No effect", with a tail such as "; 1 of 1 already stopped" for what the player did by hand), and the
**Resolve** button, `data-testid="dilemma-resolve"` (#1589). Both read `botResolveOf` (`attempt.ts`)
on the live table and the attempt's reveal snapshot, which the save keeps, so a reload shows the same
preview. A press plays the roll the reveal kept (#1628), so it applies what the preview names, and
dispatches one `resolveDilemma`, even with no changes: one log entry, "Resolved
<dilemma>: …; it goes under <mission>", and one undo takes it all back. The press applies the
dilemma's effects to the personnel, then moves the dilemma where it goes (#1599, the `move` of the
action, `resolveMoveOf` in `attempt.ts`): under the attempted mission, face up, after the cards there;
or, from the press play's records and the model's `placement` (`destinationOf` in `pile/resolve.ts`),
the core, placed on the mission card, the bottom of the dilemma pile, face up (a `returnsToPile`, or a
title that returns once played or at the end of the turn), or the top of the dilemma pile. The preview
names a destination other than under the mission, "No effect; goes to your core". The next card of the
stack is then on top, face down, so the label, the preview and the button go away until the player's tap
reveals it; Resolve never reveals it. A `resolveDilemma` with no move, as in a save from before #1599,
leaves the dilemma on the stack, and the button reads "Resolved", disabled. Every model with
`goesUnder: false` sets a `placement` (`resolveDestination.test.ts`). The op `topOfDeck` (#1846, Jailbreak) puts a personnel on top of its owner's draw deck, a `move` to the draw deck with `position: 'top'`, logged "put on top of the draw deck Data". The six titles of 60S of #1846 read the table's `planetMissions`, `spaceMissions`, `songsUnderMissions`, `coreNonRitualEvents` and the mission's `affiliationIcons`, and the bot's `botMissions` and `botSongCards`, which `BotPileInfo.missions` and `songCards` carry from the chosen deck's `Missions:` and `Deck:` sections (`botMissionsAndSongsOf`); the Chula pile has neither. The Resolve also changes the stack
(#1600): a fetch (`addBestOnTop` with a title, Vault of Tomorrow from the dilemma pile, Talosian Trial from
beneath any mission, `DilemmaModel.fetchesFrom`) puts the first table card of that title on top of the
stack, face down, for the player's tap (`fetchedCardOf`, the action's `fetchedId`); a dilemma that ends the
stack (`endStack`, Lack of Preparation) returns to the bottom of the dilemma pile, face up, and the rest of
the stack after it, in stack order (`restToPile`). The page finds the cards, so the reducer never searches
by title, and the log names what moved. A fetched card is in `botRevealed` and not in `botStack`; its label
and Resolve count its extra budget as the card at the head of the play. When the Resolve leaves no
unstopped personnel in the attempting row and the stack still holds cards, the strip points to Done:
"No one left", `data-testid="attempt-done-prompt"`, and a ring on `attempt-done` (`attemptDonePrompt`,
derived from the table, so a reload, an undo and a stop by hand agree). Resolve never ends the attempt. When `botResolveOf` gives no Resolve (no model, a player's choice, `move`,
`loseShip`), neither shows, and the player resolves the dilemma by hand. A tap on the label hides only
the label.

Where the dilemma has the player choose personnel ("Choose a personnel … to be stopped", #1593), the
selection of the attempting row is the choice: `botResolve` reads `selectedCardIds`, and the model's own
pick is never shown or marked. A candidate the player already handled by hand (stopped, for a stop, or
out of the row) counts as chosen first, then the selected candidates. Until each choice has its
personnel the Resolve is pending: the preview reads the task, "Choose 1 personnel to be stopped", and
Resolve is disabled; it stays disabled while a selected personnel is one the dilemma does not allow.
Selected equipment is ignored. Distraction and Dramatis Personae give no Resolve.

A Resolve of a dilemma that changes how the personnel are read for the rest of the attempt (Dereliction
of Duty, Harsh Conditions, Accelerated Aging, Parallel Romance, The Clown: Bitter Medicine, Overwhelmed,
and the titles that change the requirements) keeps the change on `Attempt.modifiers` (#1597,
`PileModifiers` in `pile/model.ts`): the play reports its modifiers once the first dilemma is faced
(`PlayContext.modifiers`), `pileResolveOf` returns them by card id when they changed, and the
`resolveDilemma` carries the whole object, so one undo takes it back and `endAttempt` drops it. Each
reveal snapshot keeps the attempt's modifiers as its card turned face up (`RevealSnapshot.modifiers`),
and `revealedPlayOf` seeds the play of the label, the preview, the press and the reveal roll with them
(`PileAttempt.modifiers`), so a later card reads them and the card that set them does not count them
twice. The save keeps both; malformed modifiers drop alone.

Four missions change the cost of a dilemma revealed there (#1760, `missionCostOf` in
`src/lib/dilemmaBot/pile/missionCost.ts`, by whole title): Terlina III makes Unscientific Method cost −2,
Stakoron II and Stakoron Strait make a dual dilemma cost +1, and Wadi Homeworld makes a dilemma whose title
begins with "Chula" cost −1, the change first, then Peremptory Plea's discount, then the 0 floor
(`revealCostOf`). Only `revealedPlayOf` sets it, as `PileAttempt.missionCost`, in a bot game: the label and
the Resolve count the changed costs of the cards revealed before the top card and of the top card, and the
bot's search and choice at Start read printed costs. When the top card's changed cost takes the total past
`botSpend`, its preview reads "Overcome with the 2 after it: Stakoron II raised the cost past the spend"
(`overcome` of `pileResolveOf`), and Resolve is one `resolveDilemma` with `overcome` and `restUnder`: the
card and the rest of the stack go under the mission, face up, in stack order, with no effect; the log says
"Overcome: Stakoron II raised the cost past the spend"; the snapshot keeps `overcome`, and the strip points
to Done with "Stack overcome" (`attemptDonePromptText`). A lowered cost never ends the stack.

Two cards prevent and overcome a dilemma in a bot game (#1761, `preventionOf` in `dilemmaPrevention.ts`,
from the table and the log): Sigma Iotia II Assess Contamination, the attempted mission, prevents the first
dilemma revealed in the attempt that costs 1 or more (printed) and does not require a skill, once a turn
(a `dilemmaResolved` entry with `prevented` this turn at the mission uses it); and Tristan Adams Deranged
Psychiatrist prevents each dilemma of a title his play's choice named this turn, when he was unstopped
among the attempting personnel at the reveal (the reveal snapshot). "Requires a skill" is
`dilemmaRequiresSkill` (`src/lib/dilemmaBot/pile/requiresSkill.ts`): the model's seeded play reading a
skill (`PlayContext.skillRead`, which `PlayState.skill` and a check of a branch that names a skill call)
where the registry holds the title, and a skill named in the game text otherwise. `botResolveOf` takes the
preventing card: the preview reads "Prevented and overcome (Sigma Iotia II)", the bot's label and the
row's marks hide, and Resolve is one `resolveDilemma` with `prevented`, no changes and a move beneath the
mission, logged "Resolved Well-Prepared Defenses: prevented and overcome (Sigma Iotia II); it goes under
…". Tristan Adams's play offers "+2: name a dilemma" (a cost choice with `nameDilemma`, with or without
his −4), which opens a picker, `dilemma-name-picker` (`dilemma-name-search`, `dilemma-name-choice` with
`data-dilemma-title`, `dilemma-name-cancel`), of the bot's dilemma titles in a bot game and every
dilemma title otherwise (`nameableDilemmaTitles`); a choice is one `correctCharge` with `named`, a
`chargeCorrected` entry "(Tristan Adams, named Wavefront)", read back by `namedDilemmasOf`. A game by hand
changes nothing at the reveal.

Self-Replicating Roadblock names a dilemma or an event (#1789, `selfReplicatingRoadblock.ts`). After any
move of it onto a mission card (`roadblockToNameOf`, from the last log entry) the picker of #1761 opens,
`dilemma-name-picker`, headed "Self-Replicating Roadblock: name a dilemma or an event", over the bot pile's
dilemma titles first in a bot game, then every dilemma title, then every event title (`nameableCardTitles`),
with **Skip** in place of Cancel. A choice dispatches `setNamed`, which keeps the title on the placed card
as `CardInstance.named` (any move of the card clears it) and amends the placement's `move` entry
(`LogMove.named`, "…, naming Wavefront"), so one undo takes back both; a name set later is a `cardNamed`
entry of its own. In a card list panel each Roadblock on a mission card shows a badge, `named-card`
(`data-named`, `NamedCardContext.tsx`), "Named: Wavefront" or "Name a card", whose tap opens the picker
again. The table enforces neither "limit one per mission" nor "non-headquarters", and stops no play of a
named event. In a bot game `pileTableInputOf` hands the named titles of the attempted mission to the bot as
`PileAttempt.table.returnedHere`: its play (`faceRest`) spends a named dilemma's cost and returns it to the
pile with no effect, so the search rarely chooses it, and `botResolveOf` gives a revealed named dilemma the
preview "Named by Self-Replicating Roadblock: no effect; returns to the dilemma pile", no label, and a
Resolve that moves it to the bottom of the dilemma pile, face up (`resolveDilemma` with `returned`).

A Resolve that adds a modifier names it (#1598, `modifiersClause` in `pile/resolve.ts`): the preview
of a modifier-only dilemma reads "First skill off for the rest of the attempt" in place of "No effect",
and any other preview and the `dilemmaResolved` log entry end with the same clause. While a modifier is
active in `'face'` of a bot game, the attempt strip shows them, `data-testid="attempt-modifiers"`
(`attemptModifiersText` in `attempt.ts`, `modifiersText`): "Abilities off · First skill off · Navigation
blocked · +1 attributes · −2 attributes: Data, Worf · Overwhelmed · Requirements changed", the parts that
apply. Under a seeded Overwhelmed, a passing check of the revealed dilemma stops the personnel whose
skills met it, and that stop is part of the dilemma's Resolve, previewed as "Stops Data (Overwhelmed)";
the stops of Chula: The Game stay out of it.

Every random selection of the revealed dilemma's own play (#1594, #1628: `selectRandom`, `stopRandom`,
`killRandom`, `selectEachWithout`, `anyOfThree`, `unlessSelected`, Becalmed, a random pick among the
selected, and every bespoke select) rolls at the reveal: the page rolls it before it dispatches the `flip`
that reveals the card (`withShuffleOrders` calls `revealPicksOf`, `pileRevealPicksOf`), and the `flip`
carries it as `picks`, which `RevealSnapshot.picks` keeps as card ids, one list per select. A restore that
takes a fresh snapshot of such a card, or finds one with no roll, rolls it once, outside the reducer. A
select with a `why` (Chula: The Game), a `selectUntil` select of the whole pool in order, `s.roll`, and a
select of a later stack card roll nothing. The preview and the press play with the kept roll, never a new
one, and a dilemma that selects at random with no kept roll has no Resolve. The preview goes step by step,
in counts and with no names, which the row's marks show (#1632): each check on the selected personnel,
which `selectEachWithout`, `selectEachWith`, `anyOfThree` and `unlessSelected` record as a `check`
`PlayEffect` (`PlayState.check`), then the result: "1 of 3 has Integrity, Cunning or Strength > 6: stops
1", "None of 3 has …: no effect", or "Kills 1" for a title with no check; "N random personnel" never
shows. The tails ("1 of 1 already stopped", the modifiers clause, the destination) follow. Where the
selection is the pool of the player's choice (A Pattern of Lies, New Face, Discommendation, Moral Choice)
the pending preview reads "Choose 1 of the selected to be stopped". A Resolve with no random selection
still names its personnel, "Stops Data". The pool is the reveal snapshot's group, so a
selected personnel the player stops by hand after the reveal stays selected and counts as already
stopped. `PileResolve.steps` and `BotResolve.steps` hold the selection and the checks as card ids.

The press carries them on the `resolveDilemma` (`steps`), and the `dilemmaResolved` entry keeps them as
names captured at dispatch, `selected` and `checks` (#1629), so its text lists each step before the
result: "Resolved Becalmed: selected Data, Worf, Troi; Worf has Integrity, Cunning or Strength > 6;
stopped Worf; it goes under Bilana System". An entry from before #1629 has neither and reads as before.
While the revealed top card is unresolved and its reveal snapshot has `picks`, the attempting row marks
each personnel of the kept selection with a round badge in its top-right corner,
`data-testid="attempt-row-bot-mark"`, never the selection ring, which is the player's choice: the card
carries `data-bot-selected="true"`, and `data-bot-check="met"` (a red "!" badge, an amber "?" otherwise)
when it met a check of the dilemma (`BotRowMarks`, `AttemptPersonnelRow.tsx`). The mark goes away once
the snapshot is `resolved` or the next card is on top, and an undo of the Resolve brings it back. While
the marks show, the row draws the selected personnel first, in selection order, then the others in their
usual order (`botMarkedFirst`, #1632), so a selected personnel is in the first row of cards; the order of
the away team or the crew on the table does not change.

An attempt has a phase, `Attempt.phase` (#1189): `'choose'`, the dilemma choice, or `'face'`, facing
dilemmas. Start begins in `'choose'`, with `Attempt.drawn` 0. The choice-phase draw, `drawCard` from
the dilemma pile to the dilemma hand with `counted: true`, adds 1 to `drawn`, and it never stops at
N; a plain draw from the dilemma pile leaves `drawn` alone. A dilemma that enters the stack lands face
up in `'choose'` and face down at every other time. `setAttemptPhase` to `'face'` turns every stack
card face down and sends every card of the dilemma hand to the bottom of the dilemma pile, face up,
in hand order; to `'choose'` it turns the stack face up and moves no card. Each is one log entry. A
save from before #1189 restores in `'face'` with `drawn` 0.

The attempt strip holds the phase button, before View full table (#1192). In `'choose'` it is
**Face dilemmas**, `data-testid="attempt-face-dilemmas"`: a tap is `setAttemptPhase` to `'face'`, so the
stack turns face down and the dilemma hand goes to the bottom of the dilemma pile, face up, and it closes
the dilemma hand's arc. In `'face'` it is **Back to choosing**, `data-testid="attempt-back-to-choosing"`:
a tap is `setAttemptPhase` to `'choose'`, so the stack turns face up and the choice layout shows again;
it leaves the dilemma hand as it is. The button group does not shrink, so on a narrow screen the status
text gives way first.

A `drawCard` from the dilemma pile whose top card is face up first shuffles the whole pile face down,
and then draws the new top card (#1283, `drawReshuffles` in `tableReducer.ts`). The draw's log entry
reads "Shuffled the dilemma pile, then drew a dilemma …", and one undo takes back both. A face-up card
lower in the pile does not shuffle, and the draw deck never does.

The dilemma stack's panel reorders the stack only in `'choose'` (#1209). In `'face'` it keeps the row
and its end labels, but its cards carry no `data-zone`, a drag shows no insertion mark and hides the
panel as every other flat panel does, and it has no Shuffle. A drag out of it still lands anywhere.

In `'choose'` the attempt layout draws the dilemma choice (#1190): the mission on the left at the
facing phase's scale (`computeAttemptChoiceLayout` keeps the `missionScale` of `computeAttemptLayout`),
the dilemma stack face up in the middle, with an empty space of `ATTEMPT_STACK_SIDE_GAP` (16 px) outside each end, outside its drop zone and taken from its width (#1220), and on the right the ships of the mission's ship row, one to a row. At a planet mission the
attempting personnel show there too, as one face-down pile, `data-testid="attempt-personnel-pile"`,
with a count of the away team (#1222): the whole card back, uncropped, exactly as wide and as tall as
the mission card and level with it (#1493), and the ship row, mounted even when empty, stands
in a column of its own right of it. A space mission has no pile (#1235): the right side holds only the
ship row, and the ship's crew badge shows the count of the crew. Where the width
is short, as at 667×375, the stack cards shrink so 3 of them still sit edge to edge; the pile keeps
the mission's size. At a space mission the stack cards shrink the same way (#1220). The stack is still the droppable `dilemmaStack`, shows
even when it is empty, and draws every card face up, side by side, overlapped only past its width: on touch as the
art crop of a table card (#1221), the crop of the placed-on column, and with a fine pointer as the whole card, exactly as wide and
as tall as the mission card, overlapping past the zone's width rather than shrinking, with the end
labels' line above the zone in the band above the body (`attemptStackWholeSize`, `stackWholeCards`,
#1498, #1505); each
card previews on a hold, opens the stack's panel on a tap, and drags off the stack. The pile has no
`data-zone` and no `data-card-id`: it is not a drop target, and a hold on it previews nothing. The
personnel row, its Stop, Stop all and Shuffle buttons, its droppable and the away team badge are not
mounted in `'choose'`. `?fixture=attempt-choose` opens in this layout.

The face-up stack of `'choose'` labels its two ends on a line above its cards, "First" on the
left and "Last" on the right (`data-testid="dilemma-stack-end-labels"`, #1204, #1266), and the stack's
panel uses the same words while the phase is `'choose'`; in `'face'` it keeps "Top (revealed first)"
and "Bottom (revealed last)". Each card of the row has a drop target of its own,
`stack-slot-<the card's id>`, over the part of the card no later card covers, and the right half of
the last card is `stack-slot-end`. They take no pointer events, so a press still reaches the card. A
dilemma of the stack dropped on a slot moves there as the panel's reorder does (`arrayMove`), and on
the end it moves last. A dilemma from anywhere else, the dilemma hand most of all, goes in before the
card of the slot, or last on the end or on the zone right of the last card, face up, in one log entry.
During a drag of a dilemma over the row, a marker, `data-testid="dilemma-stack-insert-indicator"` with
`data-slot`, shows where the drop puts it (`dilemmaStackRowInsertPoint` in `dilemmaStackInsert.ts`).
`practice_drag.sh` aims at a slot by its name and prints `dilemmaStack`:

```bash
# on ?fixture=attempt-choose, after Draw dilemma and a drop or two into the stack
bash scripts/practice_drag.sh card-82 stack-slot-card-77   # goes in before card-77, prints dilemmaStack
```

In `'choose'` the attempt strip also holds the **Draw dilemma** button,
`data-testid="attempt-draw-dilemma"`, and beside it the count, `data-testid="attempt-drawn-count"`,
"Drawn 3 of 9", which reads `Attempt.drawn` and N, `drawSpend` (#1191). Each tap is the counted
choice-phase draw, and then the dilemma hand opens as its arc, if it is closed. The button is disabled
only while the dilemma pile is empty; it never stops at N, and the count goes on past it, "Drawn 10 of
9", in amber, with `data-over="true"`. The strip sits at the top, so the open arc never covers the
button, and the arc's backdrop forwards a tap on the button to it (`passthroughZone` of `CardHand`, which
falls back to a `data-testid`), so the player keeps drawing with the arc open. In `'face'` neither shows. The Download button of the dilemma pile stays the plain draw, which
leaves `drawn` alone.

The cards placed on the attempted mission show in a column right of the mission card, in both phases
(#1180, `AttemptPlacedOnColumn` in `AttemptLayout.tsx`), `data-testid="attempt-placed-on-<i>"`. Its top
and height are the mission card's. It holds the dilemmas in a block above,
`attempt-placed-on-dilemmas-<i>`, and the events below, `attempt-placed-on-events-<i>`; a group alone
takes the whole height. Each card shows as its art crop, every card, overlapped to fit, the most
recently placed lowest and on top. A tap on a block opens that group's panel,
`card-list-panel-onDilemmas` or `card-list-panel-onEvents`, and a hold on a card previews it. The
column has no `data-zone` and its cards no `data-card-id`: the drop target `mission-on-<i>` reaches
over it, so a drop on it is a drop on the mission card's bottom half, and `practice_drag.sh` aims at it
by its `data-testid` and prints the mission's name. The mission card draws no strips while the column
shows; its badges stay. With nothing placed on the mission there is no column, and it takes no width
(`placedOnWidth` 0 in `computeAttemptLayout`). Its width, a ship's at the floor scale, comes from the
middle column's slack first.

```bash
# on ?fixture=attempt, where card-7 is an event in the hand
bash scripts/practice_drag.sh card-7 attempt-placed-on-2   # the events block gains the card
```

Every drop target in the attempt layout keeps its id: `mission-on-<i>`, `mission-under-<i>`,
`ship-row-<i>` and `crew-<id>` with `<i>` the mission's own slot index, and `dilemmaStack`. The mission
row is not mounted during the attempt layout, so the targets of the other missions do not exist then:
tap View full table to bring them back.

The attempting personnel show as cropped table cards, face up, in an area of the middle column (#1165,
#1205, `AttemptPersonnelRow.tsx`). At a planet mission the row is the away team, in place of the away team
badge, above the ships: `data-zone` and `data-testid` `attempt-away-team-<i>`. At a space mission it is
the crew of the attempting ship, beside the ships: `attempt-crew-<the ship's id>`, with no away team
badge (#1365): Move to… and View full table reach the away team. The row reads the live away team or crew, the equipment too, in order, and
the frozen numbers of the attempt do not change. Each card is the art crop with the personnel format
of #1176, with the crew panel's 8 px gap (#1218, `attemptPersonnelGrid`, `attemptPersonnelFit`,
`computeAttemptLayout`), as wide as a card of the crew panel on the full table (`viewerCardSize`, a
desktop too), or less where the screen lacks the room: at 667×375 about 76 px, 3 to a row, at
`?fixture=attempt`, and about 99 px, 3 to a row, at Moab IV on `?fixture=piles` (#1544); on a 1280 px desktop
the away team of Moab IV shows 3 to a row, 170 px wide, at a height of 633, 720 or 800 px. The area
takes all the width the mission, the ships and the stack leave, even with fewer cards, and a row holds
as many cards as fit it, never fewer than 3 (#1365). The mission grows only while 3 would fit. It fills the height
it has and, when the cards do not all fit, shows at least a quarter of a card of the second row, and
scrolls to the rest, `data-testid="<the row's id>-scroll"`. The area keeps no column for a
scrollbar (#1544): like every card list panel element that scrolls, it hides its native scrollbar
(`scrollbar-hidden`, `globals.css`) and shows the page's own thumb on a faint track over its right
edge, `data-testid="scroll-indicator"` (`ScrollIndicator.tsx`), a sibling of the scroller with no
pointer events, always shown while the element overflows. While it scrolls it
carries `PANEL_SCROLLS_ATTRIBUTE` and its cards `touch-action: pan-y`, as a scrolling card list panel
does: a touch whose first move is vertical scrolls it, and one sideways drags the card. A press held
until its preview fires drags the card in any direction, up to the strip too, and never scrolls the
row (#1367): the table cancels the `touchmove`s of that press (`useTouchScrollGuard`). A card list
panel that scrolls works the same way. Each
card carries its `data-card-id`. A tap selects a card, a hold previews it, and above the row, as in
the crew panel, `attempt-row-stop` (Stop or Unstop, while personnel are selected) and `attempt-row-stop-all` (while
a personnel is in the row: Stop all, or Unstop all when every one is stopped, #1560) set `stopped`. `attempt-row-shuffle`, last in that line and shown while the row holds a card, shuffles the away team or the crew (#1179). That line,
`data-testid="attempt-row-buttons"`, sits in the band above the facing body, its top level with the
top of the band, the top of a full stack of slivers above the mission (#1543), so the top of the
first row of cards is level with the top of the mission card and of the dilemma stack (#1376,
`attemptPersonnelButtonsInBand`); the middle column, the personnel and the ships, ends `ATTEMPT_GAP`
(8 px) above the bottom row (#1543); only where the band is shorter
than the line, below a mission card about 90 px tall, does it sit above the cards in the column. On a desktop the slivers of the
dilemmas under the attempted mission poke out by 5% of the card, half the table's 10%, and the band
(`attemptBandHeight` in `tableScale.ts`, both phases) is the halved stack but never shorter than
the line, so the line always sits in it there (#1504). The full table keeps 10% on every device. A drop on the away team row routes as a drop on
`mission-on-<i>`: a personnel or an equipment joins the away team, a ship goes to the ship row, any
other card is placed on the mission card. A drop on the crew row routes as a drop on `crew-<id>`. At a
space mission the facing body has no away team badge (#1365): to aim a drop at the away team, aim at
`mission-on-<i>`.

```bash
# on ?fixture=piles, in an attempt at Moab IV, where card-1 is the Tricorder in the hand
bash scripts/practice_drag.sh card-1 attempt-away-team-0   # prints attempt-away-team-0
```

While a card of the row is selected, the line of buttons above it also holds **Move to…**,
`data-testid="attempt-row-move-to"` (#1341). A tap opens a list above the table,
`data-testid="attempt-move-to-menu"`, with a backdrop: the hand, the top and the bottom of the draw
deck, the discard, the core and the brig, then the away team of each other mission slot whose mission
is a planet mission or a headquarters, never a space mission, then the crew of every ship of the
player, "Crew of <ship> at <mission>", in mission order and then ship-row order, the ships at the
attempted mission too (#1370, `attemptMoveDestinations` in `attempt.ts`). The attempting ship, the row
the cards are in, and the attempted mission's away team are never listed. Each entry is
`attempt-move-to-<key>`: `hand`, `drawDeck-top`, `drawDeck-bottom`, `discard`, `core`, `brig`,
`awayTeam-<i>` and `crew-<the ship's id>`. A tap
on an entry moves every selected card of the row there, in row order, with the `move` a drop there
dispatches, in one log entry that one undo takes back, and closes the list. The frozen numbers of the
attempt stay. The row shows only in `'face'`, so Move to… does too.

During a drag of a card from the row, the whole attempt strip, `attempt-strip`, is a hold target
(#1342, #1368): it shows the `valid` ring, and a rest of `PLACE_ON_HOLD_MS` anywhere in it switches
to the full table mid-drag, so the drop can land there. A release on the strip moves nothing.

View full table shows the normal table, and the attempt goes on: the overlay on the mission card,
`attempt-overlay-<index>`, then holds only `attempt-back-to-attempt`, "Back to attempt", which returns to
the attempt layout. The full table shows no dilemma stack: go back to the attempt to use it. Which view shows is page state, not part of the save. It is keyed on the
attempt's mission and ship (`attemptViewKey`, #1189), so a change of phase or a draw keeps the full table.

On `/decks/practice?fixture=piles&reset=1&menu=0`, Moab IV (mission 0) is a planet mission with an
away team of 20: tap the lower half of its card, wait out the double-tap window, then tap Attempt and
Start. Bilana System (mission 2) is a space mission with the crewed ship: tap the ship, then Attempt.
The attempt is part of the save, so it survives a reload and opens in the attempt layout. Start a check
with `reset=1`. For a check of the attempt itself rather than of how it starts, open
`/decks/practice?fixture=attempt&reset=1&menu=0`, which deals the table with the attempt at
Bilana System already in progress, in the attempt layout.

### Desktop mode: a fine pointer

Headless Chromium has no pointer device, so the practice table draws its touch layout:
`useFinePointer` returns false, and the CSS `(pointer: fine)` rules (the size of `CardPreview`)
do not match. Any check of an issue whose title or acceptance checks name the desktop, a mouse,
or hover must open the page with the script:

```bash
bash scripts/agent_browser_desktop.sh 'http://localhost:3000/decks/practice?fixture=1&reset=1'
bash scripts/agent_browser_desktop.sh 'http://localhost:3000/decks/practice?fixture=piles&reset=1&menu=0'   # a check of the hand
```

Quote the URL, because it holds `&`. The script starts Chromium with
`--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2`,
through a wrapper around Chrome that it passes as `--executable-path`, because agent-browser splits
`--args` on every comma and Chrome reads only the first setting of a list separated by semicolons.
It then prints `pointer: fine = true` and `hover: hover = true` and exits 0, or prints `false` and
exits 1. The flag changes the device
the browser reports, so JavaScript and CSS agree. Use this script and no other method. Do not
patch `window.matchMedia` with `--init-script`: that changes only what JavaScript sees, CSS still
sees `pointer: none`, and the page draws a layout no real device draws.

The mode gives a fine pointer and a pointer that hovers, so `(hover: hover)` matches too. Tailwind
4 applies a `hover:` class only under `@media (hover: hover)` (#375), so a plain
`npx agent-browser open`, the touch layout, shows no hover state at all.

With a fine pointer the preview, `CardPreview`, is at most 499 px tall, the native height of the
card images (`PREVIEW_MAX_HEIGHT` in `previewSize.ts`, #946, #1458), and 90% of the window below
that. It opens only when it is at least 1.25 times as tall as the whole card under the pointer
(`previewEnlarges`): an art crop counts as the whole card at its width, and a completed mission as
its long side. So on a large screen a hover or a hold on the attempted mission or the top card of
the facing dilemma stack shows no preview. The hold still fires, so its timing, its swallowed click
and the drag distance stay the same. A touch device opens every preview.

The script closes every `agent-browser` session first, because `--args` applies only when the
daemon starts and is ignored silently otherwise. Any earlier page state in the browser is gone.
Every later `npx agent-browser` command, `practice_drag.sh` too, talks to the same browser and
stays in desktop mode until the next `close`. To check the touch half of a comparison, run
`npx agent-browser close` and open the page again with a plain `npx agent-browser open`.

### Touch, modifier keys, and screen size

`agent-browser` drives only a mouse, and it reports a screen of 800×600. For the rest,
use `scripts/cdp_input.sh` (#1035). It sends raw CDP input to the open page on one connection
(the built-in `WebSocket` of Node 24, no package), and prints the pointer events the page
saw, with their pointer type, their modifier keys and the element they hit. A point is `<x> <y>`
or a CSS selector, whose centre is the point.

**Touch.** A finger tap, a touch pan, and a touch drag of a card, on `?fixture=piles`:

```bash
bash scripts/cdp_input.sh tap 20 20                  # a tap on the open hand's backdrop closes it
bash scripts/cdp_input.sh pan '[data-testid="card-list-panel-awayTeam"]' 0 -200
bash scripts/practice_drag.sh --touch card-7 core    # prints core
```

```
pan 633 265 -> 633 65
scrollTop 0 -> 196
saw: pointerdown touch on data-card-id=card-13; pointercancel touch on data-card-id=card-13
```

`pan <selector> <dx> <dy>` moves the finger from the centre of the element by `dx`, `dy`, so a
negative `dy` scrolls the content down. It prints the element's `scrollTop` before and after. A
pan the browser takes ends in `pointercancel`, and no card moves. `practice_drag.sh --touch` finds
the points as the mouse mode does, and prints the zone the same way. A touch drag through dnd-kit
on the table works.

Do not use `Input.synthesizeScrollGesture`: it scrolls nothing in headless mode.

**Double-tap.** A double-tap on a mission card needs two presses within 250 ms (`DOUBLE_TAP_MS`),
and each run of `tap` or `click` starts its own Node process, which takes longer than that.
`double-tap` and `double-click` send both presses on one connection, about 100 ms apart:

```bash
bash scripts/cdp_input.sh double-tap '[data-card-id="<the mission's card id>"]'     # touch mode
bash scripts/cdp_input.sh double-click '[data-card-id="<the mission's card id>"]'   # desktop mode
```

**Modifier keys.** `agent-browser keydown Shift` does not set `shiftKey` on the mouse events
that follow. `--mod` takes `shift`, `ctrl`, `meta` and `alt`, comma-separated:

```bash
bash scripts/cdp_input.sh click '[data-card-id="card-11"]'
bash scripts/cdp_input.sh mouse-drag 408 48 300 150 --mod shift
```

A box must start on the empty space of the grid. The scrollbar at the right edge of a grid that
scrolls is not empty space: a press there starts a scrollbar drag, and the page sees no
`pointermove`. Check the start point with `document.elementFromPoint` first. A box also fails
when a card's hover preview is open, as it is after a real click opened the panel and left the
pointer on a card: the press only closes the preview. Open the panel with a DOM `click()` instead.

**A drag out of a panel that scrolls.** The first move of `touch-path` and `mouse-path` is 4 px
right and 8 px up, so in a grid that scrolls the browser takes a touch as a pan
(`panelScrollSensor.ts`). `--first <dx>,<dy>` sets a first move mostly sideways (#1093):

```bash
bash scripts/cdp_input.sh touch-path 297 190 377,194,150 319,593,400 --first 10,0
```

**Screen size.** Launch the browser with `--screen-info={1920x1080}`:

```bash
bash scripts/agent_browser_desktop.sh --screen 1920x1080 'http://localhost:3000/decks/practice?fixture=1&reset=1&menu=0'
bash scripts/cdp_input.sh click '[data-testid="fullscreen-button"]'   # the table is then 1920x1080
```

The script prints `screen = 1920x1080`. For a large screen with no fine pointer, run
`npx agent-browser close --all`, then
`npx agent-browser --args "--screen-info={1920x1080}" open '<url>'`. `--args` takes effect only on a
fresh browser, so close first. A screen size set by `Emulation.setDeviceMetricsOverride` ends when
its CDP session ends, so it does not last past one helper call. Fullscreen needs a trusted click,
so use `cdp_input.sh click` or a snapshot ref, not a DOM `click()`.

### The service worker and offline checks

The practice page registers a service worker (#1051), built from `src/app/sw.ts` into
`public/sw.js` by `@serwist/next`. `yarn dev` builds no worker and registers none, so a check of the
worker or of offline play needs the production server:

```bash
yarn build && NEXT_PUBLIC_AGENT_BROWSER=1 yarn start
```

Never run it alongside `yarn dev`: both use port 3000 and the `.next` folder. Only
`/decks/practice` registers the worker, through `useServiceWorker`. Its scope is `/`, and its
precache holds the `_next/static` chunks and the HTML of `/decks/practice`, never a card image.
`/cardimages/*` and the card data come from the offline deck cache (`OFFLINE_CACHE_NAME` in
`offlineCache.ts`) when it holds them, and from the network otherwise.
A playtester's `/api/playtest/` (#1615) is answered from the same cache: an image cache first, as
`/cardimages/*`, and `/api/playtest/cards` network first, with the cached copy only when the fetch
fails. Make available offline caches both for a deck that holds a playtest card, the refresh of
#1054 leaves them alone, and nothing clears the playtester's local copies (the offline cache, the
saved deck, the saved game) on sign-out.

To reload the page with the network blocked, use `cdp_input.sh offline-reload`. It sends
`Network.emulateNetworkConditions` with `offline: true` to the page and to every service worker,
on one connection, then reloads the page or opens the URL you give it, and prints what loaded:

```bash
bash scripts/cdp_input.sh offline-reload 'http://localhost:3000/decks/practice?fixture=1&menu=0'
```

```
offline: 1 service worker(s) and the page
url: http://localhost:3000/decks/practice?fixture=1&menu=0
controlled by a service worker: true
title: Webula – Star Trek CCG Card Search
images: 0, not loaded: 0
```

The network comes back when the command ends, so read the page with `npx agent-browser snapshot`
or `eval` after it: the page stays as it loaded. A page the worker did not serve shows the
browser's offline error page, and its URL starts with `chrome-error://`. A load before the
worker controls the page has nothing cached, so open the page online first and check
`navigator.serviceWorker.controller`.

When a new build takes control of an open page (`controllerchange` on a page that already had a
controller), the game menu shows "A new version of Webula is available" with Reload and Dismiss
(`data-testid="update-prompt"`), and the menu button shows a dot (`data-testid="update-dot"`)
(#1104). The page asks the registration for an update each time it comes back to `visible`
while online. To trigger that check without leaving the tab, run
`npx agent-browser eval "navigator.serviceWorker.getRegistration().then(r=>r.update())"`.

### A click that does not click

`npx agent-browser click 'button:has-text("<label>")'` also fails silently on this page. It reports success and the button does not fire. Use the DOM instead, and read the result in the same call:

```bash
npx agent-browser eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Shuffle');b.click();return 'clicked'})()"
```

A click by `ref=eN` from a snapshot does work. Take a snapshot first, then click the ref.

The Jest tests call `onDragEnd` directly, so only the browser drag checks the pointer sensor and the drop targets on the real layout. When you add a zone or a draggable card on `/decks/practice`, give it a `data-zone` or `data-card-id` attribute. A zone name is a value of `Zone` in `tableReducer.ts`.

Only give `data-zone` to a real drop target. A `data-zone` on an element that is not a droppable makes a drag aim at a place that accepts nothing. Use `data-testid` for an element a test must find but a drag must not target.

### To check a state that exists only during a drag

`agent-browser drag` finishes the whole drag in one call, so it shows nothing in the middle. To read a mid-drag state, such as a drop zone highlight, hold the drag open with a manual mouse sequence:

```bash
npx agent-browser mouse move <x> <y>      # over the card to drag
npx agent-browser mouse down
npx agent-browser mouse move <x+4> <y-8>  # small move first
npx agent-browser mouse move <tx> <ty>    # then move to the target zone
npx agent-browser eval "..."              # read the DOM here, mid-drag
npx agent-browser mouse up
```

The small first move is the part that matters. The `PointerSensor` in `page.tsx` has an `activationConstraint` of 8 px, so a single large move does not start the drag, and the page shows no drag state at all. Two runs lost their turn limit before somebody found this.

Use `npx agent-browser get box '[data-zone="..."]'` to get the coordinates.

### To check a state that exists only after a drop

The landed cue, the bump of a count badge and the drag overlay last about 450 ms
(`LANDED_CUE_MS`). One `agent-browser` call takes longer, so a snapshot after the drag never
shows them. Record them with the watcher instead (#1036):

```bash
bash scripts/watch_landed.sh install            # a MutationObserver starts recording
bash scripts/practice_drag.sh card-8 core       # a hand card of ?fixture=piles
bash scripts/watch_landed.sh print              # prints the record, then clears it
```

```
+2574ms drag-overlay appeared
+4346ms landed-ring core
+4347ms data-landed core
+4606ms drag-overlay removed
```

The record lists each element that gains `data-landed`, each `landed-ring` inserted, each count
that gains `animate-landed-bump` (a drop into a pile that shows only a count, such as the closed
`hand`), and the drag overlay's content, `data-testid="drag-overlay-card"`, appearing and being
removed. Each line names the element by its `data-zone`, `data-testid` or `aria-label`, or by its
nearest ancestor that has one. A second `print` right after the first prints `(empty)`.

The observer lives in the page until a navigation, so run `install` again after an `open` or a
reload. Under `agent-browser set media … reduced-motion` the motion-safe bump does not play and
the static ring shows instead, so the record lists `landed-ring` and no `animate-landed-bump`.

### The clips of the Controls panel

A row of `src/app/decks/practice/controls.ts` that sets `clip` plays a short clip of its gesture
in the Controls panel (#1089). The files are `public/controls/<id>-<touch|mouse>.{webm,mp4,webp}`,
the paths of `clipFiles`. `scripts/record_controls.sh` records them (#1091):

```bash
NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev                          # in another shell
bash scripts/record_controls.sh mission-drop-halves           # both columns of one row
bash scripts/record_controls.sh mission-drop-halves touch     # one column
bash scripts/record_controls.sh --all                         # every row that sets `clip`
```

It opens the fixture of the clip, touch with a plain `agent-browser open` and mouse with
`agent_browser_desktop.sh`, shows a circle at the pointer that fills on a press, runs the gesture
with `practice_drag.sh` or `cdp_input.sh`, and records the screen with CDP `Page.startScreencast`.
`ffmpeg` crops the frames to the part of the table the gesture uses and encodes WebM, MP4 and a
WebP poster. The script stops when `ffmpeg` is missing (`sudo apt-get install ffmpeg`), and warns
when a file is over 200 KB. The gesture of each row is one entry of `GESTURES` in
`scripts/record_controls.mjs`; to give a row a clip, add its entry, record it, and set `clip`.

No CI job runs the recorder. When you change a gesture that a clip shows, run the recorder for
that row and commit the new files in the same PR. `controlClipFiles.test.ts` fails when a row
sets `clip` and a file is missing or over 200 KB.

`next dev` writes to `.next/dev` under Next.js 16, and `next build` writes to the rest of `.next`, so a `yarn build` while the dev server runs no longer breaks the server (#372). `yarn start` still cannot run beside `yarn dev`: both use port 3000.

## Fixing bugs
When asked to fix a bug do your best to write a test that fails without the bug fix. Weigh up the cost and brittleness of writing the test and comment in the PR with the circumstances that made you feel like you couldn't write a useful test. 

## Fixing Existing PRs

When asked to fix or update an existing pull request:
1. Check out the PR's existing branch (do NOT create a new branch from main).
2. Make targeted changes on top of the existing commits.
3. Run `yarn test`, `yarn typecheck`, `yarn lint` and `yarn build`, then fix any failures.
4. Commit with a message like `fix: <short description> (follow-up for #<pr-number>)`.
5. Push to the same branch — this will update the open PR automatically.
6. Do NOT open a new PR unless explicitly asked.

### Fallback: no push permission to the original branch

If you do not have permission to push to the original branch:
1. Create a new branch based on the original PR's branch (NOT from main).
2. Commit your changes there.
3. Open a new PR targeting the original PR's branch as the base (not main).
4. Describe the new PR as a fix/follow-up for the original PR number.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

This file provides guidance to agents like Claude Code, OpenCode, and Amp when working with code in this repository.

## What goes in this file

This file is for the whole factory: the commands, the conventions and the traps that any
agent needs on any task. A feature does not go into this file. Put a feature's behaviour in
its code (a comment beside it), its tests, or a file in `docs/`.

Add to this file or edit it only for one of these circumstances:

1. **A new command, script or tool** that agents run, such as a new `scripts/*.sh` helper, a
   new `yarn` script, or a new flag of `practice_drag.sh`.
2. **A change to validation, CI, deployment or the workflows**, such as a new CI job, a new
   trigger label, or a change to the turn limit.
3. **A trap that cost an agent a run, or that would fail silently**, such as a check that
   reports success and does nothing. Write the trap and how to avoid it, in a few sentences.
4. **A new convention for the whole repository**, such as a naming rule, a rule about
   secrets, or a rule about which files must never be committed.
5. **A new practice table fixture**: one line with its name and when to use it. Describe
   the deal in a comment beside the fixture in the code.
6. **Text in this file that the change makes false.** Correct it or delete it. Do not add
   new detail around it.

Everything else stays out, even when the change is large: a new zone, panel, model, reducer
action, log text, test id or card title. An instruction in an issue or a plan to "document
the feature in AGENTS.md" does not override this rule. A plan, a PR or a review that changes
this file names the circumstance.

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

### The rulebook

`docs/rulebook/` holds the text of the Second Edition Rulebook, version 4, April 2015
(#1939), verbatim, one Markdown file per top-level section and the Glossary with one
`##` heading per entry. `docs/rulebook/README.md` lists the files, the icon names
(`[Fed]`, `[Cmd]` as in the card data) and how to find the page of a line. When a
model, a test or the answer to a rules question depends on a rule, such as how an
ability is timed, answer from these files, not from memory, and cite the section and
the page with a quote, in the code comment, the issue or the pull request:

```bash
grep -rn "facing a dilemma" docs/rulebook/
grep -n "^## " docs/rulebook/13-glossary.md   # the Glossary's entries
```

Later rulings of The Continuing Committee can override version 4.

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

Scale 1 is a 320 px tall table, so at 667×375 the table draws at a scale of about 1.17. A layout
that must fit the minimum screen must fit it at that scale. `agent-browser` opens an 800×600 page.
To check that a layout fits the minimum screen, set the size first:

```bash
npx agent-browser set viewport 667 375
```

Headless Chromium, a desktop and Android give a safe-area inset of 0 on every side, so a check there
draws the table as if no inset existed and does not test the inset layout of an iPhone.

Read `docs/practice-table.md` before you change the layout or the scale of the practice table, its
turn controls, the turn and its counters, or a card-text model.

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

The practice table has thirty-five fixtures. Each one deals the same table on every load.

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
- `?fixture=orders` (#1866) deals the `?fixture=piles` table, the same cards and the same ids, with Indebtedness,
  Optimism and Rule of Acquisition #6 at the end of the core, Damar Ambitious Glinn and Quark Resistance Informant,
  a [Fer] personnel, at the end of the crew of the ship at Bilana System, and Galor, a [Car] ship, at the end of the
  hand (`PRACTICE_ORDERS_TSV`), and Renewal Scroll (#1837) at the end of the core with Kira Nerys The Intendant in the
  discard pile (`PRACTICE_ORDERS_DISCARD`). After "Go to orders" the core cards and Damar in the crew panel show the "Order"
  badge. It keeps its game under `practiceGame:fixture=orders`.
- `?fixture=permissions` (#1916) deals the `?fixture=piles` table, the same cards and the same ids, with Particle 010,
  whose play needs three [Bor] personnel, at the end of the hand, and Rule of Acquisition #6 at the end of the core
  (`PRACTICE_PERMISSIONS_TSV`). With "Check uniqueness and limits" on, a play of Particle 010 into the core shows a
  `charge-warning` with `data-rule="playRequirement"`, and a draw from the draw deck one with `data-rule="spendToDraw"`.
  Anij Guiding Light follows Particle 010 at the end of the hand (#1917): with no Ba'ku Planet in play, a drag of her
  makes no slot glow, and her play warns with `data-rule="playPlace"`.
  It keeps its game under `practiceGame:fixture=permissions`.
- `?fixture=triggers` (#1904) deals the `?fixture=piles` table, the same cards and the same ids, with VIP Welcome
  at the end of the core, Enrique Muniz Dependable Troubleshooter at the end of the crew of the ship at Bilana
  System, U.S.S. Enterprise-E Federation Envoy on the ship row of Moab IV, a [Fed] planet mission (`extraShips`),
  and Elim Garak Cold-Blooded Mastermind, a [DS9] Cardassian of cost 3, at the end of the hand
  (`PRACTICE_TRIGGERS_TSV`). A double-tap on Moab IV offers the Envoy's score (`trigger-offer`); a play of Garak
  offers VIP Welcome's draw and Enrique's. It keeps its game under `practiceGame:fixture=triggers`.
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
  Unexpected Difficulties is a trigger row of source `botDeck` (#1906, `src/lib/triggers/titles/bot.ts`, event
  `dilemmasDrawn`, the bot-only step `botRedrawDilemmas`): `BotPileInfo.triggers` lists the `botDeck` titles of the
  deck's `Deck:` section (`BOT_TRIGGER_TITLES`), `botRedraws` asks `botPileHasTrigger(pile, 'dilemmasDrawn')`, and a
  saved `botPile` with the old `unexpectedDifficulties: true` still reads as holding it (`botPileTriggerTitles`).
  `pendingTriggersOf` never offers a `botDeck` row to the player.
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
`LAYER_CLOSED_HAND`, and taking no width in the row. It is the arc of `handArcLayout` with cards of 75% of
the open arc's card (`CLOSED_FAN_CARD_SHARE`, #1872), showing about half of each card above the edge at its
lowest top corner (`CLOSED_FAN_VISIBLE`, 0.5; #1542 had shown the whole card), never less than the touch floor
(`arcTouchMinVisible`) on a touch screen, so its cards sit closer together and its top lower than the open
arc's, and it spans at most `CLOSED_FAN_CORE_CARDS` (3, #1872) cards of the core however many cards the hand holds, and a fan at one end of the box at most half of it. The closed dilemma hand
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

The game menu's Settings hold "Search piles in a carousel: On/Off" (`game-menu-pile-carousel`, #1899, a
spike of #1898), under `practice-pile-carousel`, off by default. With it on, the search of the draw deck,
the dilemma pile (#1900) and the discard pile (#1901) opens `PileCarousel` (`data-pile`) in place of the grid
panel. Each keeps its panel's actions: the draw deck Download, Discard, Top, Bottom and Shuffle; the dilemma
pile the same, with Download only while the dilemma hand shows (#1223); the discard pile Remove from game
(`remove-from-game-button`, "Return to game" when every selected card is removed) and no Shuffle, its cards
newest first, the slider's ends Newest and Oldest. The carousel's stage keeps
`data-testid="card-list-panel-<pile>"`, and its root is `pile-carousel`. One card sits large in the middle (`pileCarouselLayout.ts`), its neighbours smaller and
turned away on each side, as many as fit, at most 4. A tap on a side card brings it to the middle, a tap on
the middle card selects or deselects it, and a hold previews any of them. Only the middle card carries a
`data-card-id` and drags out, under `panelDraggableId`, and the carousel hides during the drag, so
`practice_drag.sh <the middle card's id> core` lands. From the top: the top bar holds "Search draw deck",
a `?` whose tooltip holds the instructions (`pile-carousel-help`), Shuffle and the X; then the actions row
(`pile-carousel-actions`), the count, Clear, and Download, Discard, Top and Bottom, which act on the
selection in pile order with the panel's actions; then the carousel; and right under it the bottom bar
(`pile-carousel-bottom`), centred and half the screen wide (at least 18rem), previous and next around a slider over the pile (`pile-carousel-slider`), with a
mark on it for each selected card (`pile-carousel-tick`) and Top, "N of M" (`pile-carousel-position`) and
Bottom below it. The actions row, the cards and the slider bar sit together, centred in the space under
the top bar (`pile-carousel-body`), so the slider stays right under the cards on a tall screen: the cards
take that height less the two rows (their `offsetHeight`), never more than the native image. The top bar
also holds a large eye button, `pile-carousel-hide`, that hides the carousel to show the table
(`data-peeking="true"` on the root, page state); a button at the top centre, `pile-carousel-show`, "Back to
search <pile> · N selected", brings it back with its place and selection. Escape brings back a hidden
search first, then closes the tooltip, then the carousel.

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

The saved game holds the log, and the undo and redo histories live under a key of their own, the
game's key followed by `:history`, for example `practiceGame:fixture=piles:history`. To compare the
order of the draw deck before and after an undo, read it from the save:
`JSON.parse(localStorage.getItem('practiceGame:fixture=piles')).table.drawDeck.map(c => c.id)`.

Read `docs/practice-table.md` before you change undo, redo, a shuffle or Escape.

### A mission attempt

On `/decks/practice?fixture=piles&reset=1&menu=0`, Moab IV (mission 0) is a planet mission with an
away team of 20: tap the lower half of its card, wait out the double-tap window, then tap Attempt and
Start. Bilana System (mission 2) is a space mission with the crewed ship: tap the ship, then Attempt.
The attempt is part of the save, so it survives a reload and opens in the attempt layout. Start a check
with `reset=1`. For a check of the attempt itself rather than of how it starts, open
`/decks/practice?fixture=attempt&reset=1&menu=0`, which opens with the attempt at Bilana System in
progress, or `?fixture=attempt-choose`, which opens in the dilemma choice.

The mission row is not mounted during the attempt layout, so the drop targets of the other missions
do not exist then: tap View full table to bring them back. The targets of the attempted mission keep
their ids, `mission-on-<i>`, `mission-under-<i>`, `ship-row-<i>` and `crew-<id>`. The `dilemmaStack`
drop target exists only in the attempt layout. At a space mission the facing body has no away team
badge: to aim a drop at the away team, aim at `mission-on-<i>`.

```bash
# on ?fixture=attempt-choose, after Draw dilemma and a drop or two into the stack
bash scripts/practice_drag.sh card-82 stack-slot-card-77   # goes in before card-77, prints dilemmaStack
# on ?fixture=attempt, where card-7 is an event in the hand
bash scripts/practice_drag.sh card-7 attempt-placed-on-2   # the events block gains the card
# on ?fixture=piles, in an attempt at Moab IV, where card-1 is the Tricorder in the hand
bash scripts/practice_drag.sh card-1 attempt-away-team-0   # prints attempt-away-team-0
```

Read `docs/practice-table.md` before you change an attempt, its phases or the dilemma bot.

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

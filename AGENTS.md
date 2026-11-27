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

Start the dev server with `NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev`, which hides the consent banner and
the Next.js dev tools button. `agent-browser` is a devDependency pinned to `0.39.1`, which needs
Node 24, so `npx agent-browser` runs the copy in `node_modules`. Do not run `yarn install`.

The practice table saves its game in localStorage, and a fixture keeps its game under
`practiceGame:fixture=<value>`, so a reload shows the game of the last visit. `reset=1` deals the
fixture again, and the new game replaces the save. The game menu splash opens on every load and
covers the table; `menu=0` starts with it closed. The usual check URL is
`/decks/practice?fixture=1&reset=1&menu=0`. `practice_drag.sh` stops with a message when the
splash is open.

Each fixture deals the same table on every load. The deal of each one, its cards, their places and
ids, and what a check sees, is in the comment beside it in the code: its branch in
`PracticeDrawContent` (`PracticeTable.tsx`), its TSV constant in `src/lib/practiceDeck.ts`, its
entry of `BOT_REVEAL_FIXTURES` (`attempt.ts`), and, for the piles deal, `resetWithPiles` and the
`FIXTURE_*` constants in `tableReducer.ts`.

- `?fixture=1`: a plain new game with no hand ("Draw 7"). Use it for a fresh game, the draw deck or the dilemma pile.
- `?fixture=piles`: a hand of 7, an away team at Moab IV (mission 0), a crewed ship at Bilana System (mission 2), the brig and the core. Use it for most checks of the table.
- `?fixture=costs`: the piles table and cards with cost changes in the hand. Use it for the cost of a play, a counted choice or a Download.
- `?fixture=resolving`: the costs table with an event already resolving. Use it for the resolve prompt.
- `?fixture=recall`: the costs table with Recall events in the discard pile. Use it for a play from the discard pile.
- `?fixture=attributes`: the piles table with attribute changes in the core. Use it for the arrows of the attribute bands.
- `?fixture=completion`: the piles table with the missions whose completion acts on your cards. Use it for completion effects.
- `?fixture=set67`: the piles table with the missions of set 67. Use it for Cheron's species count.
- `?fixture=missions`: the piles table with Earth and Nimbus III. Use it for a mission's spend of counters and download.
- `?fixture=playable`: the piles table with a headquarters and cards with play places in the hand. Use it for the play-place highlight.
- `?fixture=kmtar`: the piles table with Diplomacy missions and K'mtar in the hand. Use it for his download of events.
- `?fixture=tain`: the piles table with Intelligence missions and "when you play" personnel in the hand. Use it for play effects that examine or score.
- `?fixture=downloads`: the piles table with personnel that download in the hand. Use it for a download into hand or to a place.
- `?fixture=60s`: the piles table with cards of set 60S. Use it for Blue Skies' cap and their downloads.
- `?fixture=dissident`: the piles table with The New Resistance and Dissidents. Use it for the reveal and the reduced cost.
- `?fixture=orders`: the piles table with order cards in the core and crew. Use it for the orders step.
- `?fixture=permissions`: the piles table with a play requirement and a draw ban. Use it for the rule warnings of a play or a draw.
- `?fixture=triggers`: the piles table with cards that trigger on a play or a completion. Use it for trigger offers.
- `?fixture=unique`: the piles table with second copies of unique and limited cards. Use it for the uniqueness and limit warnings.
- `?fixture=attempt`: the piles table with an attempt at Bilana System in facing, a dilemma stack and placed cards. Use it for an attempt.
- `?fixture=attempt-choose`: the same attempt in the dilemma choice. Use it for the dilemma choice.
- `?fixture=bot`: the piles table as a bot game with the Chula pile. Use it for a bot game.
- `?fixture=bot-costs`: the bot table with Ptol in the hand. Use it for a cost that reveals the bot's dilemma pile.
- `?fixture=bot-roadblock`: the bot table with Self-Replicating Roadblock in the hand. Use it for an event that names a dilemma.
- `?fixture=bot-label`: a bot attempt with a revealed dilemma on top of the stack. Use it for the bot's label.
- `?fixture=bot-resolve-noeffect`: a bot attempt whose revealed dilemma has no effect. Use it for a Resolve that changes nothing.
- `?fixture=bot-resolve-choice`: a bot attempt where the player chooses whom to stop. Use it for a Resolve that waits for a selection.
- `?fixture=bot-resolve-pattern`: a bot attempt with a random selection kept by the reveal. Use it for a kept roll.
- `?fixture=bot-resolve-becalmed`: a bot attempt with a kept roll and an attribute check. Use it for a preview of a check.
- `?fixture=bot-resolve-modifier`: a bot attempt whose dilemma changes the skills for the attempt. Use it for attempt modifiers.
- `?fixture=bot-resolve-overcome`: a bot attempt where the mission raises a cost past the spend. Use it for an overcome.
- `?fixture=bot-resolve-prevent`: a bot attempt where the mission prevents the dilemma. Use it for a prevented dilemma.
- `?fixture=bot-resolve-60s`: a bot attempt with a dual dilemma of set 60S. Use it for a label that names an attribute.
- `?fixture=bot-resolve-jailbreak`: a bot attempt whose dilemma puts personnel on the draw deck. Use it for that Resolve.
- `?fixture=bot-select-again`: a bot attempt at Moab IV with cards that change a kept roll. Use it for a reroll.

The hand of `?fixture=piles` holds the Tricorder (`card-1`), two events (`card-7`, `card-8`), two
interrupts (`card-9`, `card-10`) and two ships (`card-39`, `card-40`). The examples below use them.
`docs/practice-table.md` describes the places of the table; read it before you change one.

#### `practice_drag.sh`

To check a drag and drop on the practice table, use the script. It takes a card ID and a target
name, a `data-zone`, or, when no element has that `data-zone`, a `data-testid` (a name, not a CSS
selector), and prints the zone the card is in after the drag. For a card that left the DOM (a
mission pile, a closed hand, a pile's bottom), it prints the badge whose `aria-label` gained a card,
and says so when none or more than one did. Each printed name is a valid target, except two
fallbacks: the counter of the cards on a mission prints the mission's name, and a crew badge with
no `data-zone` ancestor prints the ship's name. If it prints a `card-list-panel-` name, the card did
not move. The script opens a closed hand that holds the card and closes it again; it opens no card
list panel, mission pile or crew. When the card is covered, it names what covers it and how to
clear it. `--touch` drags with a finger.

```bash
bash scripts/practice_drag.sh card-7 core
bash scripts/practice_drag.sh card-8 brig
bash scripts/practice_drag.sh card-39 ship-row-0                 # prints crew-card-39
bash scripts/practice_drag.sh card-1 mission-pile-awayTeam-0     # prints mission-pile-awayTeam-0
bash scripts/practice_drag.sh --touch card-7 core
```

| Target | Takes |
|---|---|
| `hand`, `dilemmaHand` | the card into the hand |
| `core`, `brig` | the card; the script aims at free space, not under the closed hand's fan |
| `on-<id>` | a core or brig card: the zone, or placed on that card after an 800 ms hold |
| `draw-pile-top`, `draw-pile-bottom`, `dilemma-pile-top`, `dilemma-pile-bottom` | the card on that end; the script prints the half |
| `mission-under-<i>` | a dilemma under the mission |
| `mission-on-<i>` | a dilemma placed on the mission; a personnel or equipment to the away team; a ship to the ship row |
| `mission-pile-awayTeam-<i>` | the badge, shown only with an away team; a drop there lands on `mission-on-<i>` |
| `ship-row-<i>` | a ship only; any other card stays where it was |
| `crew-<ship id>` | a personnel or equipment boards; a ship goes to its row; any other card is placed on the ship |
| `dilemmaStack`, `stack-slot-<id>` | the attempt layout's stack, before that card |
| `resolving` | the Play target, which shows only while a resolve-on-play event is dragged from the hand with "Resolve events in a panel" on |

A card list panel's grid (`card-list-panel-<location>`, for the draw deck `card-list-panel-drawDeck`)
is not a drop target: use its `data-testid` to find or open the panel, not to aim a drag. A drag
out of an open panel lands; a drag into one from the table is not possible. To put a card into a
crew, drag it out of a mission's card list panel onto `crew-<ship id>`.

Do not build a hand drag by hand. A mouse down on the open hand closes the fan and the table
reflows, so read the target's rect after the drag starts; the cards of the fan overlap, so find a
point where `document.elementFromPoint` returns the card; and a release less than 24 px from the
press point cancels the drag. `collisionDetection.ts` ranks a drop by `pointerWithin` first, so the
pointer must stop inside the target. `npx agent-browser drag '<from>' '<to>'` works only for a card
no other card covers, such as one in a card list panel: on a hand card it reports `Done` and moves
nothing.

`practice_drag.sh` does not hold, so it never places a card on a core or brig card. To check a
placement, time the hold with `cdp_input.sh mouse-path` (or `touch-path`): it presses, makes the
8 px first move, glides to each `<x>,<y>,<hold-ms>` in turn, and releases at the last, in one call.
A sequence of `agent-browser` calls cannot rest for less than about 600 ms each. To see when a card
armed, watch `data-highlight` with a `MutationObserver`: the armed `on-<id>` gets `over`.

```bash
bash scripts/cdp_input.sh mouse-path 391 575 227,592,500 227,547,300 227,592,1000
```

Give `data-zone` only to a real drop target, and `data-card-id` to a draggable card; a zone name is
a value of `Zone` in `tableReducer.ts`. Use `data-testid` for an element a test must find but a
drag must not target. The Jest tests call `onDragEnd` directly, so only the browser checks the
pointer sensor and the drop targets on the real layout.

### Undo

To compare the draw deck before and after an undo, read it from the save; the histories are under
the game's key followed by `:history`:
`JSON.parse(localStorage.getItem('practiceGame:fixture=piles')).table.drawDeck.map(c => c.id)`.

### A mission attempt

On `?fixture=piles`, Moab IV (mission 0) is a planet mission with the away team: tap the lower half
of its card, wait out the 250 ms double-tap window, then tap Attempt and Start. Bilana System
(mission 2) is a space mission with the crewed ship: tap the ship, then Attempt. The attempt is
saved, so start with `reset=1`. The mission row is not mounted in the attempt layout, so the other
missions' drop targets do not exist then: tap View full table. At a space mission, aim a drop at
the away team at `mission-on-<i>`.

```bash
# on ?fixture=attempt-choose, after Draw dilemma and a drop or two into the stack
bash scripts/practice_drag.sh card-82 stack-slot-card-77   # prints dilemmaStack
# on ?fixture=attempt, where card-7 is an event in the hand
bash scripts/practice_drag.sh card-7 attempt-placed-on-2
# on ?fixture=piles, in an attempt at Moab IV
bash scripts/practice_drag.sh card-1 attempt-away-team-0   # prints attempt-away-team-0
```

### Desktop mode: a fine pointer

Headless Chromium has no pointer device, so the page draws its touch layout and `(hover: hover)`,
which every Tailwind `hover:` class needs, does not match. A check that names the desktop, a mouse
or hover must open the page with the script, and no other method:

```bash
bash scripts/agent_browser_desktop.sh 'http://localhost:3000/decks/practice?fixture=piles&reset=1&menu=0'
```

Quote the URL. It prints `pointer: fine = true` and `hover: hover = true` and exits 0, or `false`
and exits 1. Do not patch `window.matchMedia` with `--init-script`: CSS still sees no pointer. The
script closes every session first, because `--args` applies only when the daemon starts; later
`npx agent-browser` commands stay in desktop mode until `npx agent-browser close`. On a large
desktop screen a preview opens only when it is 1.25 times the card under the pointer, so a hover on
the attempted mission shows none.

`agent-browser` opens an 800×600 page. For the minimum screen, run
`npx agent-browser set viewport 667 375`.

### Touch, modifier keys, and screen size

`scripts/cdp_input.sh` sends raw CDP input to the open page and prints the pointer events the page
saw. A point is `<x> <y>` or a CSS selector.

```bash
bash scripts/cdp_input.sh tap 20 20
bash scripts/cdp_input.sh pan '[data-testid="card-list-panel-awayTeam"]' 0 -200   # prints scrollTop before and after
bash scripts/cdp_input.sh double-tap '[data-card-id="<the mission card id>"]'      # double-click on desktop
bash scripts/cdp_input.sh mouse-drag 408 48 300 150 --mod shift                    # shift, ctrl, meta, alt
bash scripts/cdp_input.sh touch-path 297 190 377,194,150 319,593,400 --first 10,0
```

A pan the browser takes ends in `pointercancel`. Do not use `Input.synthesizeScrollGesture`: it
scrolls nothing headless. A double-tap needs two presses within 250 ms, so use `double-tap`, not
two `tap` runs. `agent-browser keydown Shift` sets no `shiftKey` on later mouse events: use `--mod`.
A selection box must start on empty grid space, not the scrollbar, and with no hover preview open
(open the panel with a DOM `click()`). The first move of `touch-path` and `mouse-path` is mostly
upward, which a scrolling grid takes as a pan: in a panel use `--first` with a sideways move.

For a screen size, `bash scripts/agent_browser_desktop.sh --screen 1920x1080 '<url>'`, then
`cdp_input.sh click '[data-testid="fullscreen-button"]'`; fullscreen needs a trusted click. With no
fine pointer: `npx agent-browser close --all`, then
`npx agent-browser --args "--screen-info={1920x1080}" open '<url>'`.

### The service worker and offline checks

`yarn dev` builds and registers no service worker. For a check of the worker or offline play, run
`yarn build && NEXT_PUBLIC_AGENT_BROWSER=1 yarn start`, never beside `yarn dev` (both use port
3000). Only `/decks/practice` registers it. Open the page online first and check
`navigator.serviceWorker.controller`, then:

```bash
bash scripts/cdp_input.sh offline-reload 'http://localhost:3000/decks/practice?fixture=1&menu=0'
```

The network comes back when the command ends; the page stays as it loaded, so read it with
`snapshot` or `eval`. A URL that starts with `chrome-error://` is a page the worker did not serve.
To ask for an update, run
`npx agent-browser eval "navigator.serviceWorker.getRegistration().then(r=>r.update())"`.

### A click that does not click

`npx agent-browser click 'button:has-text("<label>")'` fails silently on this page: it reports
success and the button does not fire. Click by `ref=eN` from a snapshot, or use the DOM and read
the result in the same call:

```bash
npx agent-browser eval "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()==='Shuffle');b.click();return 'clicked'})()"
```

### To check a state that exists only during a drag

`agent-browser drag` finishes in one call. To read a mid-drag state, such as a drop highlight, hold
the drag open:

```bash
npx agent-browser mouse move <x> <y>      # over the card to drag
npx agent-browser mouse down
npx agent-browser mouse move <x+4> <y-8>  # small move first
npx agent-browser mouse move <tx> <ty>    # then to the target
npx agent-browser eval "..."              # read the DOM here
npx agent-browser mouse up
```

The small first move matters: the `PointerSensor` needs 8 px, so a single large move starts no
drag. Get coordinates with `npx agent-browser get box '[data-zone="..."]'`.

### To check a state that exists only after a drop

The landed cue, a badge's bump and the drag overlay last about 450 ms, shorter than one call.
Record them:

```bash
bash scripts/watch_landed.sh install            # again after every open or reload
bash scripts/practice_drag.sh card-8 core
bash scripts/watch_landed.sh print              # prints the record, then clears it
```

Under `agent-browser set media … reduced-motion` the record lists `landed-ring` and no
`animate-landed-bump`.

### The clips of the Controls panel

A row of `src/app/decks/practice/controls.ts` that sets `clip` plays a clip from
`public/controls/`. With the dev server running:

```bash
bash scripts/record_controls.sh mission-drop-halves           # both columns of one row
bash scripts/record_controls.sh mission-drop-halves touch     # one column
bash scripts/record_controls.sh --all
```

It needs `ffmpeg`, and warns when a file is over 200 KB. A row's gesture is its entry of `GESTURES`
in `scripts/record_controls.mjs`. No CI job runs it: when you change a gesture a clip shows,
record that row and commit the files in the same PR. `controlClipFiles.test.ts` fails when a file
is missing or over 200 KB.

`next dev` writes to `.next/dev`, so a `yarn build` while the dev server runs does not break it.

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

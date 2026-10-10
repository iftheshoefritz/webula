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
- React 18 with TypeScript
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

## Validation

Before you open or update a PR, run all three commands. All three must pass.

```bash
yarn test       # Jest test suite
yarn typecheck  # tsc --noEmit -p . : the types of every file, the tests too
yarn build      # type checks of the app code, ESLint, and static page pre-render
```

`yarn test` alone is not enough. It does not check types: `next/jest` compiles
with SWC, which strips the types, so a test with a type error still runs and
passes.

`yarn build` alone is not enough either. Vercel deploys with `yarn build`, and
that step catches three more classes of error:

1. TypeScript type errors in the app code, not in the tests.
2. ESLint errors.
3. Errors thrown at build time while Next.js pre-renders the static pages.

`next build` compiles every file that `tsconfig.json` includes, and then drops
each diagnostic from a file that matches `*.test.*`, `*.spec.*`, `__tests__/` or
`__mocks__/` (`runTypeCheck` in `node_modules/next/dist/lib/typescript/`). So a
type error in a test passes the build. 103 of them piled up on `main` that way
before `yarn typecheck` existed (#1062). A helper a test imports, such as
`src/tests/fixtures/makeCardData.ts`, is not a test file, so the build does
check it.

CI runs the three commands as three parallel jobs, `test`, `typecheck` and
`build`, so a red check tells you which one failed. Run them independently while
you work.

Vercel runs all three in one chain. The `buildCommand` in `vercel.json` is
`NODE_ENV=test yarn test --ci && yarn typecheck && yarn build`, so a test
failure or a type error stops the deployment before the build starts.

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

`ready-for-dev` is the one exception: only a person applies it. Leave it off the issues you
create, such as the sub-issues of the issue you work on, and off the issues you update.
A run that a bot starts stops at once with "Workflow initiated by non-human actor", and the
repository gets an `agent-error:startup-failure` label for work that never ran. When you
make an issue that is ready to implement, say so in the issue body and leave the label to
the owner.

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

### Browser checks

The practice table saves its game in localStorage and restores it on the next load (#976). A
fixture route keeps its game under its own key, `practiceGame:fixture=1` or
`practiceGame:fixture=piles`, so a reload of `/decks/practice?fixture=1` shows the game of the last
visit and not a fresh deal. To start a check from the fresh fixture deal, open
`/decks/practice?fixture=1&reset=1`. The `reset=1` parameter deals a new game, and the new game
replaces the save.

The game menu splash opens on every load of the practice table (#781) and covers the table. To
start with it closed, add `menu=0` to the URL (#1028). The usual check URL is
`/decks/practice?fixture=1&reset=1&menu=0`. A check of the splash itself leaves `menu=0` off.
`practice_drag.sh` stops with a message when the splash is open, rather than report a drag that
did not land.

The practice table has two fixtures. Each one deals the same table on every load.

- `?fixture=1` deals a plain new game: the missions, a hand of 7, and the rest of the deck in the
  draw deck and the dilemma pile. The brig, the core, the dilemma stack and the ship rows are empty.
- `?fixture=piles` (#802, #1024) deals the cards in deck order, with no shuffle. Mission 0 has an
  away team of 20 personnel. Mission 1 has a ship with a crew of 12 and one event placed on it, so
  the ship shows its counter of placed cards. Mission 2 has 3 dilemmas under it, shown as slivers.
  The brig holds 2 personnel, the core holds 4 events, and the dilemma stack holds 4 dilemmas face
  down. The hand, the draw deck and the dilemma pile get the rest.

Use `/decks/practice?fixture=piles&reset=1&menu=0` for a check of the dilemma stack, dilemmas under a
mission, the brig, the core, a card placed on a ship, a ship on the table, the crew, the away team,
or a long card list panel. Use `/decks/practice?fixture=1&reset=1&menu=0` for a check of a fresh game, the
hand, the draw deck, or the dilemma pile.

To keep the bottom of the page clear, start the dev server with `NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev`. This hides the consent banner and the Next.js dev tools button.

`agent-browser` is a devDependency, so `npx agent-browser` runs the copy in `node_modules`
and downloads nothing. In CI the dependencies are installed before the agent starts. Do not
run `yarn install`.

The version is pinned to `0.27.0`, the last release with no `engines` field. Every release
from `0.27.1` needs Node 24, and CI runs Node 20. Do not raise the version on its own.

To check drag and drop on the practice table, use the script. It takes a card ID and a target name, and it prints the zone the card is in after the drag. The target name is a `data-zone`, or, when no element has that `data-zone`, a `data-testid` (#1026). It is a name, not a CSS selector. A `data-testid` marks a place that is not a drop target of its own, so to aim at one means to drop at that spot: the droppable under the spot routes the drop.

The script prints a `data-zone`, or, for a card that left the DOM, the `data-zone` or `data-testid` of the badge that gained a card. Each printed name is also a valid target, except two fallbacks: the counter of the cards on a mission prints the mission's name, and a crew badge with no `data-zone` ancestor prints the ship's name.

```bash
bash scripts/practice_drag.sh card-5 core
bash scripts/practice_drag.sh card-8 brig
```

The popup that lists the cards of one place is the `CardListPanel`. Its grid carries
`data-testid="card-list-panel-<location>"`, where the location is a value of `PanelLocation`
(#856). The draw deck is the zone `drawDeck` (#838), so its panel is
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

A mission pile, a closed hand, and a closed dilemma hand all keep their cards out of the DOM (a badge with a count stands in for the cards). When the dragged card leaves the DOM, the script reads the `aria-label` of every badge on the table, before and after the drag, and prints whichever one gained a card - the mission pile, `hand`, `dilemmaHand`, `draw-pile-bottom`, or `dilemma-pile-bottom`. If none did, or more than one did, it says so instead of guessing.

The script opens a closed hand or a closed dilemma hand that holds the card, drags the card, and closes the hand again (#1027). It does not open a card list panel, a mission pile, or a ship's crew. When no point of the card is on top, the script names what covers it, for example the backdrop of an open card list panel, and prints the step that clears it.

Do not build the drag by hand. Three things make a hand drag fail, and each one has cost a run its whole turn limit:

1. A mouse down on a card of the open hand closes the fan, and the table then reflows. Coordinates read before the drag point at the old layout, so the drop lands in the wrong zone. Read the rect of the target zone **after** the drag starts.
2. The cards of the fan overlap, and the later card is on top. The centre of a card is often under its neighbour, so the drag moves the wrong card. Find a point where `document.elementFromPoint` returns the card you want.
3. A release near the press point cancels the drag (#774, `releaseCancel.ts`). A release less than 24 px, in a straight line, from the press point puts the card back where it was (#825). Release at a point of the target at least 24 px from the press point. When the whole target is closer than that, the script says so rather than printing `hand`.

`collisionDetection.ts` ranks a drop by `pointerWithin` first, so the pointer must stop inside the rect of the target zone.

`npx agent-browser drag '<from>' '<to>'` works for a card that no other card covers and a target that does not move, such as a drag out of a card list panel. It fails silently on a hand card: it reports `Done` and moves nothing.

Each card in the core and the brig has a drop target of its own, `on-<the card's id>`. A drop there adds the dragged card to the zone, the same as a drop on the zone, so `practice_drag.sh` prints `core` or `brig`. Only a hold over the card for `PLACE_ON_HOLD_MS` (800 ms, `useCardHold.ts`) arms it, shows the `over` ring on that card, and makes the drop place the dragged card on it (#1029). `practice_drag.sh` does not hold: in both modes it sends the drag through `cdp_input.sh` on one connection and releases about 50 ms after the last move (#1043). Check a placement with the manual mouse sequence below: move onto the card, wait 800 ms or more with `npx agent-browser wait 1000`, then release. The core and the brig grow into the free space of the bottom row (`flatRowWidths.ts`), and their cards overlap past it.

As a second guard, to aim at `core` or `brig` the script picks a point of the zone where no card is, at least 4 px from any card (#1044). During a drag the zone grows to at least 80 px tall, and its cards sit at the bottom, so there is free space above them. A zone with no such point gets the point nearest its centre, as before.

An `agent-browser` call takes about 600 ms, so a sequence of `mouse move` and `wait` calls cannot rest on a card for less than 800 ms. To time a hold, use `cdp_input.sh mouse-path` (or `touch-path`). It presses, makes the 8 px first move, glides to each waypoint `<x>,<y>,<hold-ms>` in turn, rests there for its hold, and releases at the last one, all in one call:

```bash
# 500 ms on core card A, 300 ms in the free part of the core above it, 1000 ms back on A
bash scripts/cdp_input.sh mouse-path 391 575 227,592,500 227,547,300 227,592,1000
```

To see when a card armed, install a `MutationObserver` on `data-highlight` before the call: the armed card's `on-<id>` gets `over`, and the zone goes from `over` to `valid` at the same moment.

A ship has one drop target, `crew-<the ship's card id>`, over its art. A personnel or an equipment dropped there boards the crew (#893), a ship goes to that ship's own ship row (#668), and any other card is placed on the ship, and the ship shows a counter of the cards on it. The ship's crew badge is not a drop target (#923); it only shows the size of the crew, and it shows even when the crew is empty.

A mission card takes a placed card too. Its art has two drop halves (#871), each the full width and half the height of the card: `mission-under-<index>` on top and `mission-on-<index>` below (#917). The top half reaches up over the slivers of the dilemmas under the mission (#990), so a drop on a sliver goes under the mission. They differ only for a dilemma: the top half puts it under the mission, and the bottom half places it on the mission card. A tap on the top half opens the under-the-mission panel, and does nothing when no dilemma is under the mission. A tap on the bottom half opens the away team panel, and does nothing when the away team is empty (#967). A double-tap on the mission card (two taps within 250 ms, `DOUBLE_TAP_MS`) toggles its completion and opens no panel, so a single tap acts only after that window passes (#1059). A completed mission is darkened and turned 90° clockwise inside its slot (#1060); the slivers, the counter and the Flip button stay upright, and nothing else on the table moves. On a desktop every mission slot is as wide as the turned card all the time, and the two drop halves span the slot's width. For the keyboard, a button visually hidden until it has focus, `data-testid="mission-toggle-<index>"`, toggles it too. A hold on either half shows the mission preview. For every other type both halves do the same thing: a ship goes to the ship row, a personnel or an equipment goes to the away team (#870), and any other card is placed on the mission card. A mission slot with no mission card sends a dilemma under the mission from either half. The mission has no event pile. The cards placed on the mission count in two badges in the badge strip, to the right of the away team badge: the events badge, `data-testid="mission-on-events-<index>"`, with the event icon, counts every placed card that is not a dilemma (#1069), and the dilemma badge, `data-testid="mission-on-dilemmas-<index>"`, with the dual icon, counts the placed dilemmas (#1081). Each shows only when its count is above 0, and a tap on it opens a panel of only its own cards, `card-list-panel-onEvents` or `card-list-panel-onDilemmas`. Both sit outside every `data-zone`, so `practice_drag.sh` prints them under the mission's name. A drop under a mission prints `mission-under-<index>`, the name of the drop target, whether the card shows as one of the two slivers above the mission or has left the DOM (#920). The stack of slivers is not a drop target, so it has no `data-zone`; the script finds it by its `data-testid`, `mission-under-<index>-stack`. The away team badge, `data-testid="mission-pile-awayTeam-<index>"`, is not a drop target (#924). The bottom half `mission-on-<index>` reaches down over the badge strip, so a drop on the badge routes as a drop on the mission card does: a personnel or an equipment joins the away team, and the landed cue plays on the badge. `practice_drag.sh` prints a move into the away team as `mission-pile-awayTeam-<index>`, the badge's `data-testid`. The script can aim at the badge by that name too, and the drop then lands on `mission-on-<index>`:

```bash
bash scripts/practice_drag.sh card-1 mission-pile-awayTeam-0   # prints mission-pile-awayTeam-0
```

The bare ship row, `ship-row-<index>`, takes only a ship (#886). Any other card dropped there, off any ship, stays where it was, so `practice_drag.sh` prints the zone it came from.

To put a card into a ship's crew, drag it out of a mission's card list panel onto the ship. That drag lands. The drag of a ship onto its ship row prints the ship's own zone:

```bash
bash scripts/practice_drag.sh card-10 ship-row-0         # prints crew-card-10
bash scripts/practice_drag.sh card-1 mission-on-0            # a personnel joins the away team
# open that card list panel, then:
bash scripts/practice_drag.sh card-1 crew-card-10        # boards card-1, prints crew-card-10
bash scripts/practice_drag.sh card-2 crew-card-10        # boards a personnel, places an event on the ship; prints crew-card-10
```

A tap anywhere on the ship, the counter of the cards on it too, opens its crew panel (#963). The crew panel shows the cards on the ship as tiny cards below the ship, and a drag of a tiny card out of the panel takes it off the ship.

A drag out of the core onto a ship has failed once. See #701.

### Desktop mode: a fine pointer

Headless Chromium has no pointer device, so the practice table draws its touch layout:
`useFinePointer` returns false, and the CSS `(pointer: fine)` rules (the size of `CardPreview`)
do not match. Any check of an issue whose title or acceptance checks name the desktop, a mouse,
or hover must open the page with the script:

```bash
bash scripts/agent_browser_desktop.sh 'http://localhost:3000/decks/practice?fixture=1&reset=1'
```

Quote the URL, because it holds `&`. The script starts Chromium with
`--blink-settings=primaryPointerType=4;availablePointerTypes=4`, then prints
`pointer: fine = true` and exits 0, or prints `false` and exits 1. The flag changes the device
the browser reports, so JavaScript and CSS agree. Use this script and no other method. Do not
patch `window.matchMedia` with `--init-script`: that changes only what JavaScript sees, CSS still
sees `pointer: none`, and the page draws a layout no real device draws.

The mode gives a fine pointer, not a hover media query: `(hover: hover)` stays false.

The script closes every `agent-browser` session first, because `--args` applies only when the
daemon starts and is ignored silently otherwise. Any earlier page state in the browser is gone.
Every later `npx agent-browser` command, `practice_drag.sh` too, talks to the same browser and
stays in desktop mode until the next `close`. To check the touch half of a comparison, run
`npx agent-browser close` and open the page again with a plain `npx agent-browser open`.

### Touch, modifier keys, and screen size

`agent-browser` 0.27.0 drives only a mouse, and it reports a screen of 800×600. For the rest,
use `scripts/cdp_input.sh` (#1035). It sends raw CDP input to the open page on one connection
(Node 20 with `--experimental-websocket`, no package), and prints the pointer events the page
saw, with their pointer type, their modifier keys and the element they hit. A point is `<x> <y>`
or a CSS selector, whose centre is the point.

**Touch.** A finger tap, a touch pan, and a touch drag of a card:

```bash
bash scripts/cdp_input.sh tap 20 20                  # a tap on the open hand's backdrop closes it
bash scripts/cdp_input.sh pan '[data-testid="card-list-panel-awayTeam"]' 0 -200
bash scripts/practice_drag.sh --touch card-5 core    # prints core
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
`pointermove`. Check the start point with `document.elementFromPoint` first.

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
bash scripts/practice_drag.sh card-8 core
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

Do not run `yarn build` while the dev server runs. It overwrites the `.next` cache the dev server uses, and the server then needs a restart.

## Fixing bugs
When asked to fix a bug do your best to write a test that fails without the bug fix. Weigh up the cost and brittleness of writing the test and comment in the PR with the circumstances that made you feel like you couldn't write a useful test. 

## Fixing Existing PRs

When asked to fix or update an existing pull request:
1. Check out the PR's existing branch (do NOT create a new branch from main).
2. Make targeted changes on top of the existing commits.
3. Run `yarn test` and `yarn build`, then fix any failures.
4. Commit with a message like `fix: <short description> (follow-up for #<pr-number>)`.
5. Push to the same branch — this will update the open PR automatically.
6. Do NOT open a new PR unless explicitly asked.

### Fallback: no push permission to the original branch

If you do not have permission to push to the original branch:
1. Create a new branch based on the original PR's branch (NOT from main).
2. Commit your changes there.
3. Open a new PR targeting the original PR's branch as the base (not main).
4. Describe the new PR as a fix/follow-up for the original PR number.

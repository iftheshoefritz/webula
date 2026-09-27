# Ubiquitous language

This file maps the words of the *Star Trek* CCG Second Edition Rulebook (version 4,
April 2015, <https://www.trekcc.org/op/rulebook.pdf>) to the identifiers in this
codebase.

Use it for two reasons:

1. To name a new thing with the word the rulebook already uses.
2. To find where the code uses a different word, and why.

Rules for this codebase:

- Use one word for one meaning. The tables below give the word.
- When a game term has a code name, use the code name in code and the game term
  in prose, in a comment, and in a UI label.
- When you add a game concept the code does not model yet, add a row here.

## 1. Card types

The rulebook lists seven card types. The data file `public/cards_with_processed_columns.txt`
holds them in the `Type` column. `useDataFetching` lowercases every value, so all
comparisons in the code are lowercase.

| Rulebook term | Code | Where |
|---|---|---|
| personnel | `'personnel'` | `card.type` |
| ship | `'ship'` | `card.type` |
| equipment | `'equipment'` | `card.type` |
| event | `'event'` | `card.type` |
| interrupt | `'interrupt'` | `card.type` |
| mission | `'mission'` | `card.type`, `cardPileFor` |
| dilemma | `'dilemma'` | `card.type` |

## 2. Card fields

| Rulebook term | Code | Note |
|---|---|---|
| card title | — | See "card title and subtitle" below. |
| subtitle | — | See "card title and subtitle" below. |
| cost | `cost` | A numeric field. A card with no printed cost counts as cost zero. |
| affiliation | `affiliation` | The rulebook shows an affiliation by an icon. The data holds the word. |
| species | `species` | The rulebook shows a species by the word, never by an icon. |
| skills | `skills` | One string of skill names. |
| keywords | `keywords` | `useDataFetching` changes `U.S.S.` to `uss` and `I.K.S.` to `iks`. |
| game text | `gametext` | Search abbreviation `t:`. |
| attributes (personnel) | `integrity`, `cunning`, `strength` | Numeric fields. |
| attributes (ship) | `range`, `weapons`, `shields` | Numeric fields. |
| staffing requirements | `staff` | Command and staff icons. |
| other icons | `icons` | Era icons and series icons. |
| class (ship) | `class` | `SHIP_CLASSES` in `src/lib/missionRequirements.ts`. |
| mission type | `missiontype` | `'h'` headquarters, `'p'` planet, `'s'` space. |
| dilemma type | `dilemmatype` | dual, planet, or space. |
| quadrant | `quadrant` | Alpha, Beta, Delta, Gamma, Mirror. |
| span | `span` | The move cost of a mission. |
| points | `points` | The score of a mission. |
| unique | `unique` | `'y'` or `'n'`. The rulebook marks a unique card with a dot before the title. |

A numeric field is a field that a search filters by a number or a range of numbers,
such as `cost:2` or `range:3-5`. `numericColumns` and `numericAbbreviations` in
`src/lib/constants.ts` list them. The code calls this class "numeric" and never
"range", because `range` is one of its fields: the ship attribute, the move distance of
a ship (#855). The `ranges:` option passed to `search-query-parser` keeps its name,
because that key belongs to the library.

### Card title and subtitle

The rulebook keeps these apart. Rule "naming cards": you name a card by its title
only, and two cards with the same title are the same card, even when the subtitles
differ.

The data file does not keep them apart. The `Name` column holds the title and the
subtitle as one string, for example `Seven of Nine Part of the Greater Whole`. The
code carries this string in two fields:

- `name` — the lowercase form, used for a search.
- `originalName` — the form with the original letter case, used for a display and
  for the LackeyCCG export format.

There is no field that holds the title alone. A rule that needs the title alone
cannot be written from this data.

### Version

`*VP`, `*A`, `*AP` and `*VAP` at the end of a name mark a reprint with other art.
These are not rulebook terms. `stripVersionSuffix` in `src/lib/cardCount.ts` removes
the suffix. `getCardCounts` then reports two numbers, and this codebase names them:

- **card** — one game identity, after the suffix is removed.
- **version** — one printed row of the data file.

A card identity in a deck is the `CollectorsInfo` value, not the name.

## 3. Deck structure

The rulebook and the deck builder disagree about the word "deck".

- The rulebook: a **deck** is the draw deck of at least 35 cards. The five
  **missions** and the **dilemma pile** of at least 20 dilemmas are separate.
- The code: the `DeckList` type in `src/types/index.ts` is the whole saved object. It
  holds the missions, the dilemmas and the draw cards together. The name is not
  `Deck`, so the word "deck" keeps its rulebook meaning (#836).

`cardPileFor` in `src/app/decks/deckBuilderUtils.ts` splits a `DeckList` into three
piles, named by `DeckPile`:

| `DeckPile` | Holds | Rulebook term |
|---|---|---|
| `'mission'` | mission cards | the five missions |
| `'dilemmaPile'` | dilemma cards | the dilemma pile |
| `'drawDeck'` | every other type | the deck |

The values match the practice table zones `'dilemmaPile'` and `'drawDeck'` (#837).
A deck saved before #837 holds `pile: 'dilemma'` and `pile: 'draw'` on its rows.
`withCurrentPiles` computes each pile again from the card type when the deck loads, so
the old values are never read.

The deck builder UI shows the three tabs as "Missions", "Dilemmas" and "Draw".

Deck building limits from the rulebook, for a check you may add later: five
missions, at least two of them not headquarters; at least 20 dilemmas; at least
35 deck cards; at most three copies of one card title.

## 4. The practice table

`/decks/practice` is a play area for one player. `Zone` in
`src/app/decks/practice/tableReducer.ts` names its flat zones.

| Rulebook term | `Zone` | Note |
|---|---|---|
| deck (the draw deck) | `'drawDeck'` | The label on the table is "Draw deck". |
| hand | `'hand'` | The rulebook limit of seven cards is not enforced. See [section 7](#7-names-kept-and-why). |
| discard pile | `'discard'` | |
| core | `'core'` | The rulebook puts events here. The zone takes any card type. |
| brig | `'brig'` | The rulebook holds captives here. The highlight accepts personnel. |
| dilemma pile | `'dilemmaPile'` | |
| dilemma stack | `'dilemmaStack'` | The face-down stack for one mission attempt. Index 0 is revealed first. |
| — | `'dilemmaHand'` | No rulebook term. A face-up working area for dilemmas. See [section 7](#7-names-kept-and-why). |

**Word "pile":** the `Zone` of the draw deck is `'drawDeck'`, so no zone is named
`'pile'` any more (#838). In `deckBuilderUtils.ts`, a "pile" is one of the three
deck-building categories, and `PilePanel` is the list panel of any place on the
table. Read the file before you read the word.

**Word "stack":** in this codebase, "stack" means the dilemma stack only. A hand
is "open" or "closed", never "stacked".

### Places that are not flat zones

| Rulebook term | Code | Note |
|---|---|---|
| the five missions in a row | `MissionSlot`, `MISSION_SLOTS = 5` | The row always has five slots, even for a deck with fewer missions. See [section 7](#7-names-kept-and-why). |
| a ship in line with a mission | `ShipRowLocation`, `zone: 'shipRow'` | Addressed by mission index. See [section 7](#7-names-kept-and-why). |
| aboard a ship | `CrewLocation`, `zone: 'crew'`, `CardInstance.crew` | Addressed by the ship's own id, so a ship move keeps its crew. |
| away team (personnel at a planet mission) | `MissionPileLocation`, pile `'awayTeam'`, `MissionSlot.awayTeam` | The pair of `crew`, the personnel aboard a ship. The drop target id is `mission-pile-awayTeam-<index>` and the label is "Away team". **The code uses the one name at every mission type**, so it reads wrong at a headquarters mission and at a space mission, where the rulebook has no away team. The owner accepts this: the pile is the same place at every mission, and one name is clearer than three. |
| overcome dilemmas beneath the mission | `MissionPileLocation`, pile `'underMission'` | The UI label is "Under the mission". |
| play and place (a card placed on another card) | `PlacedOnLocation`, `CardInstance.placedOn`, `findPlacedOnTarget`, `placedOnTargets`, `targetId` | The code held the noun "host" for the card underneath. "Host" is not a rulebook word, so #840 removed it: every comment and label says "the card it is placed on", and no new noun took its place. The stack is one level deep. |

### Card state

| Rulebook term | Code |
|---|---|
| draw (the top card of the deck into the hand) | action `drawCard`, from `'drawDeck'` to `'hand'`; the same action moves the top dilemma from `'dilemmaPile'` to `'dilemmaHand'` |
| stopped / unstopped | `CardInstance.stopped`, action `setStopped` |
| face up / face down | `Face`, `ZONE_FACE`, action `flip` |
| shuffle | action `shuffle`, `shuffleArray` |
| turn | `TableState.turn`, action `nextTurn`, which unstops every personnel |
| score | `TableState.score`, action `adjustScore`, clamped to `SCORE_MIN`..`SCORE_MAX` |

The rulebook win score is 100 points. `SCORE_MAX` is 140, so the counter can show a
score above the win score. See [section 7](#7-names-kept-and-why).

## 5. Headquarters and playability

The rulebook says that you **play** personnel, ships and equipment **at** a
headquarters mission, and that the mission's game text says which cards may be
played there.

The code says "reports to" for the same idea. "Reports to" is not a rulebook term.
[Section 7](#7-names-kept-and-why) gives the reason the code keeps it.

| Idea | Code |
|---|---|
| the list of headquarters missions | `HQ_NAMES` in `src/lib/hqPlayability.ts` |
| which cards a headquarters accepts | `HQ_PLAYABILITY` |
| game text that lets a card play aboard a ship | `DECK_PLAYABILITY` in `src/lib/deckPlayability.ts` |
| the headquarters options of the loaded deck | `getReportsToOptions` in `src/lib/reportsToOptions.ts` |
| the search fields | `reportsto:` (`rt:`) and `playable:currentDeck` |

`reportsto` and `playable` are computed search fields. They are not columns of the
data file.

A bracket token in the game text, such as `[Baj]` or `[Rom]`, means an affiliation.
An icon column value, such as `[Stf]` or `[DS9]`, means an icon. `hqPlayability.ts`
holds this rule at the top of the file.

## 6. Rulebook terms the code does not model

The deck builder and the practice table do not run the rules. The practice table
lets you drag any card to almost any zone; `zoneAccepts.ts` only changes a
highlight, and a drop always lands.

So the code has no name for these rulebook terms:

- the turn segments: play and draw cards, execute orders, discard excess cards
- counters, and the cost of a card in counters
- the orders: beam personnel, move a ship, attempt a mission, order actions
- a mission attempt, mission requirements, facing a dilemma, overcoming a dilemma
- command and owner, "your" and "an opponent's"
- combat, engagement, damage, captive
- present, equipped with, download, response action, prevent, replace, exchange
- in play and not in play

Do not invent a name for one of these in a component. If you need one, add the
rulebook term to this file first, then use it.

## 7. Names kept, and why

The owner decided to keep each name below, though it differs from the rulebook (#833,
#843). The sections above give the rulebook term beside each code name. This section
gives the reason, so that the next reader does not open the same issue again.

| Name | Reason to keep it |
|---|---|
| `reportsto`, the search fields `reportsto:` and `rt:` | The rulebook says that you play a card at a headquarters mission. But `reportsto:` is a search field that players type, and other *Star Trek* CCG tools use the same word. A rename breaks every saved search and every bookmark. |
| `dilemmaHand` | The rulebook does not name the place, because in a game it exists only inside one mission attempt. This codebase does not model the phases of a turn, so the dilemma hand exists all the time and needs a name. |
| `shipRow`, `MissionSlot` | They name a layout of the screen, not a game concept. The rulebook has no word because the table is a picture, not a rule. |
| `SCORE_MAX = 140` | The win score is 100 in a normal game, but certain cards change it. This codebase does not model those cards. It only allows a higher maximum, so the counter can show a score above 100. |
| The hand takes any number of cards | The rulebook applies the limit of seven at the discard step of a turn, and this codebase does not model the steps of a turn. The practice table never stops a drop. |

## 8. Cases found by the second search

A second search of the code (#835) found these cases. The number is the number of the row
in #833. Cases 1 to 11 are the ones the sections above already describe.

The owner decided every case but one. A row goes away when its rename lands and the
sections above hold the new name.

| # | The case | Decision |
|---|---|---|
| 12 | `expandDeck` returns the draw cards alone, so its "deck" is the rulebook deck. The `DeckList` it takes is the whole saved object. | **Pending.** The owner has not decided this one. |
| 13 | "Seed" is a rulebook word for placing cards at the start of a game. The code uses it for the `?fixture=piles` test deal instead, and calls the start of a game "deal" and "reset". The opening hand of seven cards is the bare number `7` in `reset`. | **Rename the fixture constants** (#854). `SEED_PILE_PERSONNEL` becomes `FIXTURE_AWAY_TEAM`, `SEED_CREW` becomes `FIXTURE_CREW`, `seedPiles` becomes `fixturePiles`. The action `resetWithPiles` and the URL `?fixture=piles` stay, because a change of the URL breaks the browser checks of `AGENTS.md`. The same task gives the opening hand a constant, `OPENING_HAND_SIZE`. |
| 14 | "Download" is a rulebook word for an effect that takes a card from your deck and puts it into play. The UI uses it for opening the draw deck or the dilemma pile to take any card by hand. | **Deferred to #827.** That issue models the download more completely, so the word is right and only partly modeled today. When #827 lands, section 6 stops listing download as not modeled and section 4 gains a row for it. |
| 16 | The limit of three copies counts one `collectorsinfo` value. The rulebook limit counts one card title, so two versions of one card let a deck hold six copies. | **Keep, and see "A rule the code does not enforce" below.** #834 blocks a fix, because no field holds the card title alone. |
| 17 | "Pile" has a third meaning: `PilePanel` is the popup list of any place on the table, such as the core, the brig, a crew, a ship row or the cards placed on a card. None of these is a pile. | **Rename** (#856). `PilePanel` becomes `CardListPanel`, and `PanelZone` becomes `PanelLocation`, which joins the `*Location` family the code already uses for a place a card can be. Not "zone": "zone" already names three types with three meanings, and `data-zone` and the drag scripts depend on it. "Panel" stays, because `DecklistPanel` uses it the same way and the modals say Modal. |

### A rule the code does not enforce

The rulebook allows three copies of one card title in a deck. The deck builder counts by
`collectorsinfo`: `findExisting` keys the deck by that value, and `belowMaximumCount` caps
each key at 3. Two versions of one card, such as a card and its `*VP` reprint, hold two
`collectorsinfo` values, so a deck can hold six copies and the builder allows it.

A count by title needs a field that holds the title alone, and no field does. #834 tracks
that. Until #834 lands, this stays a known gap, not a bug to fix.

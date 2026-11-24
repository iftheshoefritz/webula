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
| span total | `moveSpanTotal` in `src/app/decks/practice/shipRange.ts` | The range a move between two missions uses (#1635): the two printed spans, plus 2 between two quadrants (`QUADRANT_SPAN`) unless a card waives it. `TableState.rangeUsed` adds it up per ship. |
| Range on the table | `shipRangeOnTable` in `shipRange.ts` | A ship's printed Range plus what the card text in play gives it (#1635), read at each move. The log's "left" and the ship's "used/Range" pill read it. |
| range and span models | the modifier rows of `src/lib/modifiers/titles/` whose quantity is `range`, `span` or `quadrantWaiver`; `RANGE_SPAN_REGISTRY` in `src/app/decks/practice/rangeModels.ts`, their titles | One or more rows per card whose text changes a ship's Range or a span total, by the title less its version suffix (`cardTitleOf`, `src/lib/cardTitle.ts`). The hooks of `RangeSpanModel` were replaced by rows in #1887; `RANGE_SPAN_REGISTRY` is a read-only index of their titles. |
| static modifier (not a rulebook term) | `ModifierRow` in `src/lib/modifiers/model.ts`, `MODIFIER_ROWS` in `src/lib/modifiers/index.ts` (#1887) | One card text that changes a quantity while its card is in play, as plain data: `title`, `source` (the place the card must stand), `target` (relative to the source), `changes` (each quantity with its change), an optional `condition` of the table view (`Condition`), and `scope`. Rows live by what they change under `src/lib/modifiers/titles/`. One evaluator per quantity reads them: `attributeOf` and `rangeOf` sum the changes and floor the total at 0, `spanOf` applies the waiver, the reductions, the floor and the set values in that order. `eachTitleOnce` counts a title once for a target: the cost rows of a mission and of a personnel set it (#1888). The cost rows (#1888) live on their cost model, `CostModel.rows` (`withRows` and the builders `own`, `ownWhen`, `inCore`, `atMission`, `byPersonnel`, `onLimit` and `nextPlay` of `src/lib/costModels/rows.ts`), gathered in registry order as `COST_ROWS`, and carry the `label` their suggestions show; their condition is read over `costFactsSource`. One evaluator reads them: `rowCost` for a cost, `rowLimit` for the counters. |
| trigger ("When …", "Whenever …"; an interrupt's response) | `TriggerRow` in `src/lib/triggers/model.ts`, `TRIGGER_ROWS` in `src/lib/triggers/index.ts`; `GameEvent`, `gameEventsOf` in `gameEvents.ts`; `pendingTriggersOf` in `triggers.ts` (#1903) | A card text that waits for a game event, as plain data: `title`, `text`, `event` (a `GameEvent` kind and a filter), `source` (the place the card must be: `core`, `missionCard`, `mission`, `table`, `hand`, `self`, `botDeck`), `condition`, `may`, `useCost`, a use `limit` (`UseLimit`, #1834) and effect steps. An offer is derived from the last action entry of the log and never stored, addressed by `TriggerTarget`. The table never forces one. Only a dilemma Resolve's `kill` is a kill. |
| ability used during an attempt ("While this personnel is attempting a mission, you may …"); "until the end of this mission attempt"; "at the end of this turn" | `AttemptAbility` in `src/lib/attemptAbilities/index.ts`, `attemptAbilitiesOf` in `attemptAbilities.ts`; `TimedChange` (`Attempt.timed`); the delayed trigger rows of `src/lib/triggers/titles/delayed.ts` (`afterAbility`) (#1835) | An ability the attempt strip offers while its card is an unstopped personnel of the attempting group. Its change of numbers lasts until the attempt ends (`Attempt.timed`); its "killed at the end of this turn" is a delayed trigger, offered when the next turn starts, set up by the use's `attemptAbilityUsed` entry. |
| source place of a modifier (not a rulebook term) | `SourcePlace` | Where the row's card stands: `self` (the card is its own target: a personnel in an away team or a crew, a ship on a ship row, or for its Range a ship anywhere), `group`, `aboard`, `placedOnShip`, `shipRow`, `missionCard` (placed on a mission card), `mission`, `core`, `commanded` (a personnel in an away team or a crew, stopped too), `moveMission`, `moveShip` and `attempt` (no card: an earlier dilemma of the attempt, #1889, which no evaluator reads); for a cost row (#1888) `played` (the card being played, for its own cost), `core` (its title in the core), `mission` (the mission card of one of the player's slots, asked with its slot) and `unstopped` (an unstopped personnel of an away team or a crew, never the brig). The target of each is a `TargetRelation`: `self`, `group`, `crew`, `itsShip`, `shipsOnRows`, `any`, `move`, `play` (the played card), `turnLimit` (the counters of the turn), `attempting` (every attempting personnel, #1889) or `card` (the one card of `targetId`, #1889). `rowsByTitle` refuses a row whose pair no evaluator of its quantity reads, a discount of the next play out of its scope, and a cost row of a mission or a personnel that does not count each title once. |
| quantity of a modifier (not a rulebook term) | `Quantity` | `integrity`, `cunning`, `strength` (a personnel's attributes), `range`, `weapons`, `shields` (a ship's attributes), `span` (the span total of a move) and `quadrantWaiver` (the 2 a move adds between two quadrants), `cost` (the cost of a play: "is cost −1", #1888) and `counterLimit` (the counters the player may spend this turn: "spend an additional counter", a grant, or "cannot spend more than seven counters", a cap, #1888). |
| "To play this …, you must …", "cannot attempt", "may (and must) play to", "cannot spend counters" (a permission, not a rulebook term) | `PermissionQuantity`, `Permission` in `src/lib/modifiers/model.ts` (#1915) | A modifier row whose change is `allow` or `forbid` an action, with a `condition`: `play` (the played card's own requirement, source `played`, target `play`), `playPlace` (where the played card may go, `played` to `play`), `attempt` (a ship's crew, `shipRow` to `crew`, or every attempt, `core` to `attempting`) and `spendToDraw` (a core card, `core` to `turnLimit`). A forbid row means the action breaks the rule unless the condition holds. A permission has no number and is in no amount's sum. `rowsByTitle` refuses one at a place no check reads, and one that neither allows nor forbids. The rows (#1916, `titles/permissions.ts`): a `play` forbid row for each "To play this …, you must command …" (one helper, `mustCommandPersonnel`, over a count and the icons, "[Pa][Kli]" an icon and an affiliation; Delta Flyer Rebuilt's four space missions; a negated condition, `commandsNone`, with words of its own; `commandsCardTitled` for {To Rule in Hell}; a Thief), and Rule of Acquisition #6's `spendToDraw`. `forbiddenBy` lists the rows a card breaks. |
| play requirement warning, spend-to-draw warning (not rulebook terms) | `RuleWarning` of `rule: 'playRequirement'` and `'spendToDraw'` in `playRules.ts` (#1916) | The warning of a play whose card's `play` row fails on the table before the move, and of a charged draw from the draw deck while a core card forbids a spend of counters to draw (`drawWarningsOf`): its title and the words of the failed condition, "Particle 010: you must command three [Bor] personnel". Shown only with "Check uniqueness and limits" on. |
| ongoing group, primitive (not rulebook terms) | `OngoingGroup`, `ongoingGroupOf`, `ONGOING_PRIMITIVES` in `src/lib/modelCoverage.ts` (#1915) | The group of a sentence of an `ongoing` clause of the model backlog, and what would model it: a play requirement, a play place, an attempt restriction or a counter spend (a permission; Code of the Ushaan's cap is a counter-limit cap), a reminder (nothing), an attribute change (an attribute row), and what the table lacks: a gain, an opponent, command, stop immunity, an engagement, a play cost, a fragment (the clause before) or unclassified. |
| while (a card is in play) | `Scope` `'whileInPlay'` | The scope of every static modifier: the row applies while its card stands in its source place. The rulebook's "while" also opens a condition ("While you command a Maneuver event"), which is the row's `condition` or its change. `'nextPlay'` (#1888) is the scope of "the next … you play this turn": a discount the card's own play leaves, its label, its counters and the test of the play it discounts, which `pendingDiscountsOf` reads from the log. `'thisAttempt'` (#1889) is the scope of an attempt, in the row below. |
| until the end of the attempt, for the rest of the attempt | `Scope` `'thisAttempt'`, `attemptRowsOf` and `attemptModifiersOf` in `src/lib/modifiers/attempt.ts` (#1889) | The scope of the bot's attempt modifiers as rows: the bonus (`attrBonus`) of `PileModifiers` is one row of the source `attempt` and the target `attempting`, every attempting personnel, and each loss (`attrLoss`) one row of the target `card`, its `targetId`, each changing Integrity, Cunning and Strength. The rows carry one fixed title, `ATTEMPT_ROW_TITLE`, since `PileModifiers` keeps no dilemma. The save keeps `PileModifiers`; the rows are converted for the text (`modifierParts`), never stored, never in `MODIFIER_ROWS`, and never evaluated by `attributeOf`: the bot's play applies them. |
| is attributes +1 | `each(PERSONNEL_QUANTITIES, 1)` (`attributes` in `titles/attributes.ts`), or for a ship `range`, `weapons` and `shields` (`shipAttributes` in `titles/ships.ts`) | "Attributes" names every attribute of the card: a personnel's Integrity, Cunning and Strength, a ship's Range, Weapons and Shields. One sentence is one row with one shared change under each quantity. |
| is Range +2 | the `range` change of a row | A change of the `range` quantity, read by `rangeOf`. |
| Weapons +1 for each … (limit +3) | a change that counts and caps, `Math.min(3, …)` | The count is read from the table view at each read, so the value follows the table. |
| do not add 2 to the span total | the `quadrantWaiver` change of a row | Read only for a move between two missions of different quadrants, from either mission (`moveMission`), the ship (`moveShip`) or the core. |
| the Range required becomes | the `span` change `{ set }` of a row | Shadows of the Night: applied last, after the reductions (`{ reduce }`) and the floor at 0. |
| points | `points` | The score of a mission. |
| unique | `unique` | `'y'` or `'n'`. The rulebook marks a unique card with a dot before the title. |
| in play | `inPlay` of `src/lib/tableView.ts` (#1877), and `inPlayCards` in `src/app/decks/practice/playRules.ts`, its instances | The player's cards the rules count as in play (#1821): the away teams, the ship rows, the crews, the core, and the cards placed on a mission card, a ship or a core card. Not the hand, the draw deck, the discard pile, the dilemma pile, hand and stack, the cards under a mission, the resolving zone, nor the brig: the brig holds the opponent's personnel, and the table does not model whose card is whose, a known gap. |
| persona | `cardTitleOf` of `cardDisplayName` in `playRules.ts` | The versions of one title are one card for uniqueness (#1821): "Data" and "Data *VP" conflict. The card data's `Name` holds the subtitle, so two personas of one personnel with different subtitles read as two titles, a known gap. |
| limit one per mission, limit one per ship | `limitsOnePerMission`, `limitsOnePerShip`, `ruleWarningsOf` in `playRules.ts` | A card whose text says "(limit one per mission)" or "(limit one per ship)" (#1821): a second card of its title on the same mission card or ship breaks it. The table warns (`RuleWarning`, `LogMove.warnings`) and never refuses the move. |
| name a card | `CardInstance.named`, `setNamed`, `LogMove.named` | The title a card on the table named when it was played (#1789): Self-Replicating Roadblock names a dilemma or an event once it is placed on a mission card. The field is generic, for any card that names a card; a move of the card clears it. |
| playtest set (not a rulebook term) | `set` of a playtest row, `PlaytestSetInfo`, `playtestSetKey` | A group of playtest cards in testing, named by the `Set` column of its upload, such as a set and its version letter (#1644). Its key, and the `set` of its rows, is the name lowercased. Only a playtester sees one. A playtest card of any set has a `CollectorsInfo` that starts with `PT-` (`isPlaytestCard`). |

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

To show a card's name, call `cardDisplayName` in `src/lib/cardCount.ts`. It returns
`originalName` with any version suffix removed, or `name` when a row has no
`originalName`.

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

`extractDrawDeck` returns the draw deck of a `DeckList`, one entry per copy, and
`extractMissions` and `extractDilemmas` return the other two piles (#863).

The values match the practice table zones `'dilemmaPile'` and `'drawDeck'` (#837).
A deck saved before #837 holds `pile: 'dilemma'` and `pile: 'draw'` on its rows.
`withCurrentPiles` computes each pile again from the card type when the deck loads, so
the old values are never read.

The deck builder UI shows the three tabs as "Missions", "Dilemmas" and "Draw".

A **Championship deck** is a deck that a player played at a trekcc.org championship event,
such as the 2026 World Championship. It is not a rulebook term. The code calls the concept
`ChampionshipDeck` (`src/lib/championshipDecks.ts`), the files live in the top-level
`championship-decks/` folder, served by `/api/championship-decks` (#1327), and the deck picker
lists them in a read-only folder, "Championship decks". A user without early access sees only
the decks with `authorizedUse`. The id of such a deck is `championship:<file name>`. A deck report
saved before #1326 holds the old prefix, `tournament:`, and both prefixes resolve to the
same file. The `tournamentId` field of `index.json` keeps trekcc.org's word: it is trekcc's
ID of the event.

A **Beginner Deck** is one of the starter decks of trekcc.org by Lucas Thompson. It is not a
rulebook term. The code calls the concept `BeginnerDeck` (`src/lib/beginnerDecks.ts`), the
files live in `public/beginner-decks/`, and the deck picker lists them flat in a read-only
folder, "Beginner decks" (#1323). The id of such a deck is `beginner:<file name>`. The
Championship decks and the Beginner Decks together are the **public decks**
(`src/lib/publicDecks.ts`).

Deck building limits from the rulebook, for a check you may add later: five
missions, at least two of them not headquarters; at least 20 dilemmas; at least
35 deck cards; at most three copies of one card title.

## 4. The practice table

`/decks/practice` is a play area for one player. `Zone` in
`src/app/decks/practice/tableReducer.ts` names its flat zones.

| Rulebook term | `Zone` | Note |
|---|---|---|
| deck (the draw deck) | `'drawDeck'` | The label on the table is "Draw deck". |
| hand | `'hand'` | The closed (or collapsed) hand is a small face-up fan on top of the bottom row, and the open hand is the arc (`CardHand`, `handArc.ts`, #1489). A new game deals no hand (#1115): before the first turn the turn controls show "Draw 7" (#1736, `drawOpeningHand`, `TableState.openingHand`), one free draw of up to 7 cards logged as one entry, and the player may draw by hand instead, at the usual charge. The rulebook's opening hand of seven is offered, not enforced; its hand limit of seven is the discard segment (#1605). See [section 7](#7-names-kept-and-why). |
| discard pile | `'discard'` | |
| core | `'core'` | The rulebook puts events here. The zone takes any card type. |
| an event played and resolving (the rulebook has no zone for it) | `TableState.resolving`, the zone `'resolving'`, `resolvesOnPlay` in `src/lib/playCost.ts`, the log text "Resolved <card>, and it went to the discard pile" (#1727) | The rulebook plays an event, its text resolves, and an event with no "Plays in …" or "Plays on …" clause ends "Destroy this event", so it goes to the discard pile. The table holds that one event between the play and the discard pile: one card or `null`, never a list. A `move` into it is refused while it holds a card, and `advanceSegment` and `nextTurn` wait until it is empty. `resolvesOnPlay` names the events that resolve at once: an event with no such clause; never an interrupt. Not the bot's dilemma Resolve (`resolveDilemma`), a different thing. |
| brig | `'brig'` | The rulebook holds captives here. The highlight accepts personnel. It is the player's own brig. |
| the opponent's brig (the bot's brig) | `'botBrig'` | Where a dilemma of the bot places the player's personnel as captives (#1580). A hidden zone: nothing on the table draws it, it has no `data-zone` and is no drop target. A `move` into it clears `stopped`, and the log names it "the bot's brig". The save, undo and redo cover it, and a new game leaves it empty. |
| resolve a dilemma (the bot's revealed dilemma) | `Attempt.revealSnapshot`, `RevealSnapshot`, the `resolveDilemma` action, `ResolveOp`, the log kind `dilemmaResolved` (#1587) | In a bot game's `'face'`, the `flip` that adds a stack card to `botRevealed` records the attempting personnel, with their stopped flags, as the reveal snapshot. `resolveDilemma` applies the dilemma's effects to the cards still in the attempting row, in order (`stop`, `kill`, `remove`, `brig`, `holdInCore`, `returnToHand`), once per revealed card, and marks the snapshot `resolved`. The log reads "Resolved <dilemma>: killed X, stopped Y", or "no effect". On the page (#1589), `botResolveOf` gives the preview, `dilemma-resolve-preview`, and the **Resolve** button, `dilemma-resolve`, whose press rolls the random picks and dispatches the `resolveDilemma`. Where the player chooses personnel (#1593), the row selection is the choice (`PlayContext.chooses`, `PileResolveInput.selected`): the personnel already handled by hand count first, and until the choice is made the Resolve is `pending`, its preview the task ("Choose 1 personnel to be stopped") and its button disabled. The model's own pick is never shown. A dilemma that changes how the personnel are read for the rest of the attempt (abilities off, blocked skills, first skill off, attribute changes, Overwhelmed, changed requirements) leaves `Attempt.modifiers` (#1597, `PileModifiers`, `PlayModifiers` by personnel index in the play): `resolveDilemma` carries the whole modifiers after the dilemma, each reveal snapshot keeps the attempt's modifiers as the card turned face up, and the label and the Resolve of a later card start their play from them (`PileAttempt.modifiers`). The bonus and the losses convert to `thisAttempt` rows (#1889, `attemptRowsOf`), which the text reads. The preview and the log name what a Resolve adds, "first skill off for the rest of the attempt" (#1598, `modifiersClause`), and the attempt strip shows the active ones, `attempt-modifiers` (`modifiersText`). The Resolve then moves the dilemma where it goes (#1599): its destination, `PileDestination` (`'under'` or a `DilemmaPlacement`: `core`, `placedOn`, `pileBottom`, `pileTop`), and the `move` of the action. A fetch puts a card on top of the stack (`fetchedId`, #1600), an `endStack` returns the rest of the stack to the pile (`restToPile`), and with no one left the strip points to Done (`attempt-done-prompt`). |
| dilemma pile | `'dilemmaPile'` | A dilemma not chosen for a stack goes to the bottom face up. A `drawCard` that reaches a face-up dilemma on top first shuffles the whole pile face down, as the rulebook says (`drawReshuffles`, #1283), and the draw's log entry names the shuffle. A face-up card lower in the pile does not trigger it. |
| dilemma stack | `'dilemmaStack'` | The stack for one mission attempt. Index 0 is revealed first. During the dilemma choice its ends read "First" and "Last" (`DILEMMA_STACK_CHOICE_END_LABELS`, #1204, #1266), and a drop on the face-up row puts a dilemma between two cards. A dilemma lands in it face up during the dilemma choice (`Attempt.phase === 'choose'`), and face down at every other time (`ZONE_FACE.dilemmaStack`, #1189). It exists only during an attempt, in the attempt layout (#1170): the mission row and the full table during an attempt show no stack, and a restored save with stack cards and no attempt sends them to the bottom of the dilemma pile, face down. |
| — | `'dilemmaHand'` | No rulebook term. A face-up working area for dilemmas. See [section 7](#7-names-kept-and-why). |

**Word "pile":** only one thing is a pile now. In `deckBuilderUtils.ts`, a "pile" is one
of the three deck-building categories (`DeckPile`), and the dilemma pile, the discard pile
and a mission's under-the-mission pile are piles of cards on the table. The `Zone` of the
draw deck is `'drawDeck'`, so no zone is named `'pile'` (#838), and the popup that lists
the cards of one place is the `CardListPanel`, not a "pile panel" (#856).

**The popup that lists cards:** `CardListPanel` shows the cards of one place, and
`PanelLocation` names that place. `PanelLocation` joins the `*Location` family above,
because its values are the kinds of place a card can sit in: a mission pile, the core, the
brig, a crew, a ship row, a flat zone, or the cards placed on a card. Its drop target id is
`card-list-panel-<location>`. The word is not "zone", because "zone" already names three
types with three meanings — `Zone`, `ZoneKind` and this one — and the `data-zone` attribute
and `scripts/practice_drag.sh` depend on it. The word "panel" is right, because
`DecklistPanel` uses it the same way and the two modals say Modal.

**Word "stack":** in this codebase, "stack" means the dilemma stack only. A hand
is "open" or "closed", never "stacked".

### Places that are not flat zones

| Rulebook term | Code | Note |
|---|---|---|
| the five missions in a row | `MissionSlot`, `MISSION_SLOTS = 5` | The row always has five slots, even for a deck with fewer missions. See [section 7](#7-names-kept-and-why). |
| a ship in line with a mission | `ShipRowLocation`, `zone: 'shipRow'` | Addressed by mission index. See [section 7](#7-names-kept-and-why). |
| aboard a ship | `CrewLocation`, `zone: 'crew'`, `CardInstance.crew` | Addressed by the ship's own id, so a ship move keeps its crew. |
| away team (personnel at a planet mission) | `MissionPileLocation`, pile `'awayTeam'`, `MissionSlot.awayTeam` | The pair of `crew`, the personnel aboard a ship. The drop target is the mission's bottom half, `mission-on-<index>`; `mission-pile-awayTeam-<index>` is the `data-testid` of the away team badge, which is not a drop target (#924) and shows only while the away team holds a card (#1565). The label is "Away team". **The code uses the one name at every mission type**, so it reads wrong at a headquarters mission and at a space mission, where the rulebook has no away team. The owner accepts this: the pile is the same place at every mission, and one name is clearer than three. |
| overcome dilemmas beneath the mission | `MissionPileLocation`, pile `'underMission'` | The UI label is "Under the mission". On the table, a drop on the top half of the mission card, `mission-under-<index>` (#871, #917), puts a dilemma here. During a dilemma drag the half reads "Under", and "Overcome" in the facing phase of the attempt layout (#1424). |
| play and place (a card placed on another card) | `PlacedOnLocation`, `CardInstance.placedOn`, `findPlacedOnTarget`, `placedOnTargets`, `targetId` | The code held the noun "host" for the card underneath. "Host" is not a rulebook word, so #840 removed it: every comment and label says "the card it is placed on", and no new noun took its place. The stack is one level deep. On the table, a drop on the bottom half of the mission card, `mission-on-<index>` (#871, #917), places a dilemma on the mission. During a dilemma drag the half reads "On", and "Place on" in the facing phase of the attempt layout (#1424). The badge strip of a mission splits its placed cards by type (#1081): the dilemmas count in a badge with the dual icon, and every other card in a badge with the event icon. Their panels are the `PanelLocation`s `'onDilemmas'` and `'onEvents'`, a filter of `placedOn` by `card.type` and not a zone of their own; a core or brig card keeps one panel, `'on'`. The mission card also shows the last 3 cards of each group as small art crops in a strip on its edge (#1099): the events on the left, the dilemmas on the right; the strips are not drop targets, a tap opens the group's panel, and they turn with a completed mission. |
| completed mission | `MissionSlot.completed`, action `setMissionCompleted`, a double-tap on the mission card and the focus button `mission-toggle-<i>` of `MissionRow` (#991, #1059) | A double-tap (two taps within `DOUBLE_TAP_MS`, 250 ms) toggles it. A completed mission shows its card darker and turned 90° clockwise inside its slot (#1060), and its card's label ends in ", completed". The focus button, visually hidden until it has keyboard focus, reads "Mark <name> complete" or "Mark <name> not complete". Completing a mission scores nothing automatically: the player changes the score by hand. |
| mission attempt | `TableState.attempt` (`Attempt`), actions `startAttempt` and `endAttempt`, `canAttempt` and `attemptDefaults` in `attempt.ts` (#1163) | One attempt at a time. It starts from the Attempt button of the away team panel at a planet mission or of the crew panel of a ship at a space mission, and holds the slot index, the attempting ship (`shipId`, space only) and the two numbers the player confirmed. The table enforces no rules after the start: the numbers stay frozen. The save carries it. Attempt done (`endAttempt`) moves every dilemma still in the dilemma stack under the attempted mission, face up, in stack order, and then ends the attempt, in one log entry (#1170). The attempt also holds its phase (`phase`) and the count of dilemmas drawn in the choice phase (`drawn`, #1189); a save from before #1189 restores in `'face'` with `drawn` 0. |
| the dilemma choice, and facing dilemmas | `Attempt.phase`, `'choose'` and `'face'` (`AttemptPhase`); actions `setAttemptPhase` and `drawCard` with `counted` (#1189) | The two phases of an attempt. A new attempt starts in `'choose'`. The choice-phase draw (`drawCard` from the dilemma pile to the dilemma hand with `counted: true`) adds 1 to `drawn` and never stops at N. Choose → face turns the stack face down and sends the dilemma hand to the bottom of the dilemma pile, face up, in hand order; face → choose turns the stack face up and moves no card. Each change of phase is one log entry. |
| the attempt layout, and the full table during an attempt | `AttemptLayout` (`AttemptLayout.tsx`), `computeAttemptLayout` (`tableScale.ts`), page state `fullTableFor` in `PracticeTable.tsx` (#1164) | The two views of an attempt in progress. The attempt layout shows the attempted mission, its ships and away team, and the dilemma stack in place of the mission row; View full table shows the mission row, with no dilemma stack (#1170), and Back to attempt returns. The view is page state, not part of the save: a restored game opens in the attempt layout. |
| the personnel in the attempt, the dilemmas under the mission, and the number of dilemmas the opponent draws and spends | `Attempt.personnel`, `Attempt.subtract`, `drawSpend` (`drawSpend.ts`) | The popup's defaults are the unstopped personnel of the panel (no equipment) and `underMission.length`. The UI calls the result "draw/spend N", N = personnel − subtract, floored at 0. |

### Card state

| Rulebook term | Code |
|---|---|
| draw (the top card of the deck into the hand) | action `drawCard`, from `'drawDeck'` to `'hand'`; the same action moves the top dilemma from `'dilemmaPile'` to `'dilemmaHand'` |
| stopped / unstopped | `CardInstance.stopped`, action `setStopped` |
| Recall | `recallOf`, `hasRecall`, `recallRefused` (`playCost.ts`), `CostModel.recall`, `resolvingRecalled` (#1764) | "Recall: N." in `Keywords`, or granted by a card's text. A play from the discard pile into the resolving zone at cost + N; the event then ends removed from the game. |
| removed from the game | `CardInstance.removedFromGame`, action `setRemovedFromGame`, the Remove from game button of the discard pile panel (#1564) | The practice table marks a card only while it is in the discard pile: the card stays there and counts in the pile, shows the stopped look and a "Removed from game" label, and a move out of the discard pile clears the mark. The next turn leaves it alone. |
| face up / face down | `Face`, `ZONE_FACE`, action `flip` |
| flip a double-sided mission over ("flip this mission", "flip it over") | `CardInstance.flipped`, action `flipMission`, card field `backimagefile` (the second name of `ImageFile`), the Flip button of `MissionRow` (#765). **This is not `face`/`flip`.** `face: 'down'` shows `cardback.jpg` for every card, and `flip` never applies to a mission card. A flipped mission shows its back face image, and a move clears `flipped`. |
| shuffle | action `shuffle`, `shuffleArray` |
| download (take a chosen card from the deck) | the "Download" button of a `CardListPanel`, callback `onDownload`, handler `downloadSelection` in `page.tsx`: one `move` per selected card from `'drawDeck'` to `'hand'`, or from `'dilemmaPile'` to `'dilemmaHand'` (`DOWNLOAD_HAND`), then `shuffle` of that pile (#827). `DownloadPileButton` opens the panel. The rulebook's download puts the card into play; this action puts it into the hand, and the player plays it from there, at the cost of any play. |
| reveal (look at the top or bottom cards of your own pile) | the reveal panel, `PanelLocation` `'drawDeckReveal'` or `'dilemmaPileReveal'`, state `openReveal` in `page.tsx` (#1070). The eye button of `PileControls` opens it empty, and "Reveal top" or "Reveal bottom" (`onReveal`, #1078) adds the card nearest that end of the pile not yet shown. The panel shows one end at a time (`openReveal.end`), so a tap for the other end first clears it. Nothing moves. A reorder in the panel is the `reorder` action on the pile, and Top / Bottom (`onSendToDeck`) are `move` with a `position`. In the rulebook, to reveal a card is to show it to your opponent; here the player looks at the cards alone, and closing the panel forgets them. |
| turn | `TableState.turn`, action `nextTurn`, which unstops every personnel |
| the segments of a turn: Play and Draw Cards, Execute Orders, Discard Excess Cards | `TableState.segment` (`TurnSegment`): `'playAndDraw'`, `'orders'`, `'discard'`; action `advanceSegment`, `nextSegmentOf` (#1605) | The next-turn button advances: play and draw → orders → the next turn, or → discard first when the hand holds more than 7 (`HAND_LIMIT`). An attempt started in play and draw moves the turn to orders. A segment never refuses a move. The column shows "Play", "Orders" or "Discard" (`data-testid="turn-segment"`). "Segment" is the turn; "phase" is the attempt (`Attempt.phase`), and the two never share a word. |
| score | `TableState.score`, action `adjustScore`, clamped to `SCORE_MIN`..`SCORE_MAX` |

### The game log

The rulebook has no log. The practice table keeps one in memory (#1065): `gameLog.ts` and
`GameLogPanel.tsx`, opened by the "Game log" item of the game menu. It is not part of the
saved game, and a deal, a reset or a restore empties it, and the undo history with it.

| Idea | Code | Note |
|---|---|---|
| game log | `GameState.log`, `gameReducer` | The page's reducer: `tableReducer` plus the log. |
| log entry | `LogEntry`, `logEntryFor` | One entry per player action. An action that changes nothing makes none. |
| one player action of several table actions | `GameAction` `batch` | A group drag, and a selection's Discard, Flip, Download or Top / Bottom. |
| an unseen card | `LogCard` `null`, text "a card" | A draw, and a drag that showed the card back (#814). |
| a place in the text | `LogPlace`, `placeText` | The text names the zones as above. It names a ship row by its mission alone, "<mission>" (#1633), so a ship that moves between missions reads "from Excavation to Moab IV". It says "the crew of <ship>", "the away team at <mission>", "the pile under <mission>", "the cards on <card>", and "the dilemma hand". A slot with no mission card is "Mission <n>". |
| the log as text, grouped by turn | `gameLogText`, `logByTurn` | A "Turn N" line per `TableState.turn`, then under it the rulebook name of each segment (`TURN_SEGMENT_HEADINGS`, `LogEntry.segment`, #1605) before its entries. The entry of `nextTurn` heads the new turn. An entry from before #1605 reads as play and draw. |
| counter | `SegmentCounters`, `segmentCounters`, `segmentCountersText` in `gameLog.ts` (#1606) | The rulebook gives a player 7 counters to spend in the play and draw segment. The table keeps no counter: the log shows, under each turn's play and draw heading, the counters that segment's entries charged, "7 counters: 6 on cards, 1 on draws", derived from the entries alone, so an undo takes an entry's cost off. No total shows for a segment that charged nothing. A total over 7 shows as it is; nothing is refused. |
| cost (the printed cost of a card, in counters) | `printedCost`, `Charge` in `src/lib/playCost.ts`; `LogMove.costs`, the `draw` entry's `cost`, the `cost` of the `move` and `drawCard` actions | The `Cost` column of the card data, an empty one 0. The page adds it to the action before the dispatch (`withShuffleOrders`), and the reducer ignores it. The text reads "(cost 3)", a cost of 0 too (an interrupt). The table reads the game text only of the titles the cost registry models (#1654); a download makes no play free, and every other discount and extra counters charge the plain rule. |
| play (a card, from the hand, for its cost) | `moveCharge` in `src/lib/playCost.ts`, the text "Played <card> at <mission> (cost 3)" | In the play and draw segment only, a move of a card that is not a dilemma from the hand to a ship row, a crew, an away team, the core, on another card or the resolving zone. A move from the hand to the resolving zone (`'resolving'`, #1727) is a play too, and its text reads "Played <card> (cost 1)". A move from anywhere else, to the brig or the discard, and every move in orders or discard is no play. The code's "place" (`placedOn`, the `on` target) means a card put on another card, and not the rulebook's "place", the free alternative to "play": a card put on another card from the hand is a play at its cost. |
| draw (a card, for 1 counter) | `drawCharge` in `src/lib/playCost.ts`, the text "Drew a card from the draw deck into the hand (cost 1)" | In the play and draw segment only, a tap on the draw deck that draws a card into the hand. The dilemma pile's draw and a pile's Download cost nothing. |
| cost model, the cost registry | `CostModel`, `COST_REGISTRY`, `costModelOf` in `src/lib/costModels/registry.ts`; the models in `src/lib/costModels/titles/*.ts` (#1654) | What the table reads of a card's text that changes what its play costs. One model per title (`cardTitleOf`, so "*VP" and "(IDR)" share one), and the registry throws on a title two lists define. Each names its `family`: `'ownCost'` for a card that changes its own cost, `'limit'` for a card that adds to the turn's limit (#1655). A model's `label` is the name its suggestions show when it is not the title, "Tricia Jenkins". A model reads `CostFacts`, a plain description the page builds from the table (`costFactsOf`): the personnel the player commands, the core and the hand. It moves no card and refuses nothing. Its static cost changes are cost rows (#1888, `CostModel.rows`): the registry is the index of the titles, each entry with its declared `family` and `label`, and it generates the hooks `playCost`, `costOfPlay`, `missionCostOfPlay`, `personnelCostOfPlay`, `limitGrant`, `limitCap` and `pendingDiscount` of a title from its rows; the readers ask the rows (`modelCostAt`, `rowLimit`). What is no static change stays on the residual model: the choices, `usesForPlay`, a reveal, a discard, `recall`, `discardPlayCost`, `firstTurnGrant` and `turnChoices`. |
| suggestion, its source | `PlayCost`, `CostSource`, `CostChoice` in `src/lib/costModels/model.ts`; `LogMove.sources`, `LogCharge.source`; `data-testid="charge-source"` and `"charge-choice"` | The cost the table charges a play, with what gave it: the model's title and a short reason, "you command a Borg". A "may" is a choice beside the printed cost, "Discard a card: −2", that the player takes with `correctCharge` and its `source`. The log text reads "(cost 3, Borg Nanoprobes: you command a Borg)". A play with no model has no source, as an entry from before #1654. |
| grant to the limit, a choice of the limit | `LimitGrant`, a `counterLimit` row (`onLimit`, #1888) and the `CostModel.limitGrant` the registry generates from it, `limitGrantsOf` in `src/lib/costModels/`; `tableLimitGrants`, `TurnCounters.grants`, the `source` and `target` of `adjustCounterLimit` and of a `counterLimit` entry in `gameLog.ts`; `data-testid="turn-counters-limit-parts"` (#1655) | The counters a card adds to what the player may spend this turn. A grant holds while the table holds its condition, read from the table as it stands: Surprise Party, +1 while it is in the core, so the limit follows it out. `turnCounterLimit` is 7, the grants, and the player's changes. A choice of the limit is a "may" of a play, Tricia Jenkins's "Raise the limit: +5", that the player takes with `adjustCounterLimit` and its `source`, so the entry reads "Set this turn's counters to 12 (Tricia Jenkins)". The counter names the grants, "Counters 0 of 8 (Surprise Party +1)", and the list the parts, "7 + 1 Surprise Party". |
| pending discount, Dismiss | `PendingDiscount`, a `nextPlay` row (`nextPlay`, #1888) and the `CostModel.pendingDiscount` the registry generates from it, `pendingDiscountOf` in `src/lib/costModels/`; `pendingDiscountsOf`, `CostSource.discount`, the `dismissDiscount` action and the `discountDismissed` entry in `gameLog.ts`; `data-testid="pending-discount"` and `"pending-discount-dismiss"` (#1656) | A discount a card's play leaves for a later play of the same turn: Sarish Rez, the next [Fed][DS9] personnel costs 2 less, never below 0. It is derived from the log: each play of a card whose model makes one, less the play whose charge used it (its source names the play that made it, "Sarish Rez: −2 on the next [Fed][DS9] personnel") and less a Dismiss. A used discount stays used when the player corrects that play. The turn ends it. The list of the turn's counters shows it, "Sarish Rez: next [Fed][DS9] personnel −2", with Dismiss, one log entry that one undo takes back. A card's own model comes before it. |
| undo | `GameAction` `undo`, `GameState.undo`, `data-testid="undo-button"` | The back button under the fullscreen button, and Ctrl/Cmd+Z with a fine pointer (#1194). It takes back the player action of the last entry and drops the entry, with no entry of its own. `GameState.undo` keeps the table from before each entry, so it also holds the order a shuffle replaced; the text never shows it. The undo history is not saved. |
| redo | `GameAction` `redo`, `GameState.redo` (`RedoStep`), `data-testid="redo-button"` | The forward button beside the undo button on the full touch table, and under it on a desktop and in the attempt layout; Ctrl/Cmd+Shift+Z and Ctrl+Y with a fine pointer (#1403). It does again the last action that undo took back: `GameState.redo` keeps each undone entry with the table its action left, so a redone shuffle keeps its order and the action never runs again. Any new table change empties it, and so do a deal, a reset and a restore. Not saved. |
| the table, as a card's text reads it ("you command", "at this mission", "your missions") | `TableView` in `src/lib/tableView.ts`, built by `tableViewOf` in `src/app/decks/practice/tableView.ts` (#1875) | Not a rulebook term. One plain description of the player's table, from which `costFactsOf` projects `CostFacts` (#1876): every mission slot (`ViewMission`, the fields of `CostMission`, its requirements after `requirementTextsOf`, so Crescent Nebula counts, the cards under it and placed on it, its away team and its ships with their crews), the core with the cards placed on each card, the hand, the discard pile (with `removedFromGame`), the draw deck, the dilemma pile (and whether it is the bot's), the brig, the events the player commands, the score, the turn, the segment, `rangeUsed` and `botPile`. Every entry keeps its instance id, its `cardTitleOf` title and its row. The plays and the pending discounts of the turn come from the log, so the caller passes them. It inherits the brig's ownership gap ("in play"). `CostFacts` is a projection of it (#1876); `PileTableInput` and `BotTableFacts` become projections of it. The range, span and attribute models read it in place of `RangeTable` and `AttributeTable` (#1878), through `TableRead` (`tableReadOf` in `src/app/decks/practice/tableView.ts`): the view, built once by `tableViewOfInput` from the part of the table the readers are given, and the `CardInstance` of each entry by id. |
| the cards you command: personnel, ships, events, missions | the selectors `personnel`, `ships`, `events`, `missions`, `select` and `count` of `tableView.ts` (`PersonnelQuery`, `ShipQuery`, `EventQuery`, `MissionQuery`, `Selection`) | Not a rulebook term. `personnel` reads every away team and crew, by slot, with `affiliation`, `species`, `skill` (`SKILL_INDEX`), `keyword`, `icon`, `at` (a slot) and `aboard` (a ship id), whole lowercased words as `commanded.ts` matches them. `unstopped` is required, never a default. `events` is the set of `commandedEventsOf`: the core's, and those placed on the mission cards and the ships, never one placed on a core card. `missions` leaves out an empty slot unless `includeEmpty`, and takes `title` (the whole `cardTitleOf` title, "Nimbus III Staff Backwater Embassy") and `titled` (a version in any case: the title, or the title then its subtitle, "Bajor", "Unicomplex"), #1877. No selector reads the brig; `inPlay` gives the cards in play, never the brig. |
| a personnel who has a trait: a skill, an affiliation, a species, a keyword, an icon | `traitTest`, `TraitQuery`, `TraitAccess` in `tableView.ts`; `personnelIs`, `hasAny`, `affiliationIs`, `speciesIs`, `keywordIs`, `iconIs` in `src/lib/dilemmaBot/pile/families.ts` (#1868) | Not a rulebook term. The one trait predicate: `traitTest` compiles a query once (its words lowercased, its skills resolved to `SKILL_INDEX`, an unknown one throws, its icon normalised) into a plain function that allocates nothing per call, read through the `TraitAccess` of its reader. The table view's selectors read the printed traits of the card; the dilemma tests (`PLAY_TRAITS`) read `s.group[k]`, its skills live through `PlayState.skill`, so the blocked skills, the partner-settled profiles and `skillRead` apply, and its keywords and icons from `traits`, which a personnel with none lacks. `anySkill` is "any one of these skills", as `hasAny`. Attributes and cost (`attrAbove`, `attrBelow`, `costAtMost`) stay with the dilemma tests. |
| a table source: the table as a selector or a condition reads it | `TableSource`, `TableReader`, `sourceOf`, `viewSource` in `tableView.ts`; `costFactsSource` in `src/lib/costModels/factsSource.ts` (#1876) | Not a rulebook term. Every selector and condition reads a `TableReader`: a `TableView`, or a `TableSource` that gives the raw lists (`personnelOf`, `shipsOf`, `eventsOf`, `missionsOf`, `coreOf`, `playsOf`). `costFactsSource` is the source of a cost model's `CostFacts`, so a model calls the shared conditions with its signature unchanged and a test's hand-built facts work too: the unstopped personnel with no slot read `CostFacts.commanded`, every other personnel query `missions[].personnel`; it knows no crew, so `aboard` finds no one, and a slot with no name is empty. `minusWhen(condition, off)` turns a held condition into the printed cost less `off`, with the condition's words. |
| copies in the core | `core` (`CoreQuery`, `SourceCoreCard`) in `tableView.ts` (#1876) | Not a rulebook term. The cards of the core of a title, in core order, each with its id, type, keywords, printed cost and `placed`, the number of cards placed on it: the copies of Disadvantage Into Advantage and Spiteful Strategy, the cards on Energize, the uses of Delivery Boy and The New Resistance. |
| the first … each turn | `firstThisTurn`, `playsThisTurn` in `tableView.ts` (#1876) | No card played earlier this turn passes the test, whatever it cost (`CostFacts.plays`, `TableView.plays`). Its words are "first <what> this turn": "first Android this turn". |
| command (the two meanings the code keeps) | `PersonnelQuery.unstopped` | The rulebook's "you command" is the cards you own in play. The code counts personnel two ways, and a later issue settles on one. Unstopped personnel only: the cost and play models (`CostFacts.commanded`, #1751), `unstopped: true`; the cost registry reads it so through `costFactsSource` (#1876), and so do the conditions of the play models, shared conditions of `tableView.ts` (#1877), and only the abilities of Gaila and Par Lenor, which test that the card is on the table, count a stopped one. Stopped personnel included: the range and attribute models (`commandedPersonnel` in `src/app/decks/practice/tableView.ts`, #1878), `PileTableInput.commanded` and `BotTableFacts.commanded`, `unstopped: false`. Neither counts the brig. |
| a condition of a card text: "if you command …", "for each … you command", "events you command" | `Condition`, `commands`, `commandsEach`, `commandsEvents` in `tableView.ts` | Not a rulebook term. A condition is `holds(view, at?)` and `text(view, at?)`, and `text` in its options replaces the default words. `commands` prints as `ifCommand`: "you command a Borg", or with a minimum above 1 the count, "you command 3 [Fed] personnel". `commandsEach` prints as `forEach`: "you command 6 Borg (limit 5)". `commandsEvents` prints as `forEachEvent` and Gowron: "you command 1 Assault event", "you command 3 events". |
| a mission requiring a skill, "each of your non-headquarters missions requires" | `missionRequires`, `requiresSkill` in `tableView.ts` | The skill names a word of the requirement text, either side of an "or". With `each`, every non-headquarters mission names it, an empty slot is no mission, and with no such mission it holds: "each of your non-headquarters missions requires Intelligence", as `playConditionOf` prints it. |
| the cards you command with a keyword, of any type | `keywordCards`, `distinctTitleCount`, `commandsKeywordCard` in `tableView.ts` (#1878) | Not a rulebook term. The core and the cards placed on each mission card and each ship, whose `keywords` hold the word whole, of a type when given; never a card placed on a core card, nor the brig. `distinctTitleCount` counts two copies of one title once (Jasad's Capture and Punishment cards); `commandsKeywordCard` holds for one or more (I.K.S. Chontay's Maneuver event, Morgan Bateson's Temporal event). |
| completed missions, a completed mission requiring a skill | `completedMissions`, `completedMissionRequiring` in `tableView.ts` | `completedMissionRequiring` prints as the cost models: "you completed Tarod IX (requires Diplomacy)". `completedMissions` counts between a `min` and a `max`; no reader prints it yet, and its default words, "you completed 2 missions", are new. |
| at this mission, aboard this ship | `atThisMission`, `aboardThisShip`, `ConditionAt` in `tableView.ts` | The personnel of a query at the played card's slot, or in the crew of its ship, the card itself left out (`ConditionAt.id`), as `otherSpeciesHere`. "a Gul or Legate at this mission", "2 Remans at this mission", "your non-Cardassian is at this mission". |

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
| where a card may be played on the practice table (play at a headquarters, play aboard a ship, play at a mission) | `playPlacesOfRow` in `src/lib/playPlaces/` (a `PlayPlaces` of away teams, crews and ship rows), `playPlacesOf` in `src/app/decks/practice/playPlaces.ts`. A `{Title}` in the text names a persona: it matches a card whose title is the reference or starts with it and a space, so `{Earth}` is Earth Cradle of the Federation. During a drag from the hand in play and draw the targets it names show `data-highlight="eligible"` and the others `dimmed` (#1856); nothing is enforced |

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

- the orders: beam personnel, move a ship, attempt a mission, order actions
- overcoming a dilemma (the dilemma bot checks the mission requirements, see [section 9](#9-the-dilemma-bot); the practice table models a mission attempt only as `TableState.attempt`, and facing dilemmas only as a phase of it, `Attempt.phase`, see [section 4](#4-the-practice-table); a phase is the attempt's, a segment the turn's)
- owner, and "an opponent's" (for "command" and "your", see [section 4](#4-the-practice-table), the table view)
- combat, engagement, damage, captive
- equipped with, response action, prevent, replace, exchange (the dilemma bot reads "present with", see [section 9](#9-the-dilemma-bot))
- download as a card effect that puts a card into play (the practice table models only the part that takes a chosen card from a pile into the hand, see [section 4](#4-the-practice-table))
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
| `dilemmaHand` | The rulebook does not name the place, because in a game it exists only inside one mission attempt. The model keeps the zone at all times, but the table shows the dilemma hand only in the dilemma choice of an attempt (#1223). |
| `shipRow`, `MissionSlot` | They name a layout of the screen, not a game concept. The rulebook has no word because the table is a picture, not a rule. |
| `SMALL_CARD_WIDTH`, `SMALL_CARD_ART_HEIGHT` | A size of the screen, not a card type. The small card is not a ship: it sizes a ship in the ship row, but also every card of any type in the core and the brig, and part of the height of the dilemma stack. The names were `SHIP_CARD_WIDTH` and `SHIP_CARD_ART_HEIGHT` until #931. They sit in `TableCard.tsx` beside `TABLE_CARD_WIDTH` and `TABLE_CARD_ART_HEIGHT`, the larger size. |
| `SCORE_MAX = 140` | The win score is 100 in a normal game, but certain cards change it. This codebase does not model those cards. It only allows a higher maximum, so the counter can show a score above 100. |
| `resetWithPiles`, `?fixture=piles` | The fixture deal of the practice table, a test scaffold and not a game step (#854). "Seed" is the rulebook word for placing cards at the start of a game, so no fixture name says it: the constants are `FIXTURE_AWAY_TEAM`, `FIXTURE_CREW`, `FIXTURE_BRIG`, `FIXTURE_CORE`, `FIXTURE_PLACED`, `FIXTURE_UNDER_MISSION` and `FIXTURE_DILEMMA_STACK` (#1024), and `FIXTURE_SHIP_SLOT` names the mission of the crewed ship and of the dilemmas under it (#1166), and the parameter of `dealDeck` is `fixturePiles`. The real start of a game is "deal" and the action `reset`. The action and the URL value keep "piles", because a change of the URL breaks the browser checks of `AGENTS.md`. |
| The hand takes any number of cards | The rulebook applies the limit of seven at the discard step of a turn, and this codebase does not model the steps of a turn. The practice table never stops a drop. |

## 8. Cases found by the second search

A second search of the code (#835) found these cases. The number is the number of the row
in #833. Cases 1 to 13 and case 17 are the ones the sections above already
describe.

The owner decided every case. A row goes away when its rename lands and the
sections above hold the new name.

| # | The case | Decision |
|---|---|---|
| 14 | "Download" is a rulebook word for an effect that takes a card from your deck and puts it into play. The UI uses it for opening the draw deck or the dilemma pile to take any card by hand. | **Resolved by #827.** The panel's Download button takes the chosen cards into the hand and shuffles the pile, so section 4 has a row for download and section 6 lists only the into-play part as not modeled. `DownloadPileButton` keeps its name. |
| 16 | The limit of three copies counts one `collectorsinfo` value. The rulebook limit counts one card title, so two versions of one card let a deck hold six copies. | **Keep, and see "A rule the code does not enforce" below.** #834 blocks a fix, because no field holds the card title alone. |

### A rule the code does not enforce

The rulebook allows three copies of one card title in a deck. The deck builder counts by
`collectorsinfo`: `findExisting` keys the deck by that value, and `belowMaximumCount` caps
each key at 3. Two versions of one card, such as a card and its `*VP` reprint, hold two
`collectorsinfo` values, so a deck can hold six copies and the builder allows it.

A count by title needs a field that holds the title alone, and no field does. #834 tracks
that. Until #834 lands, this stays a known gap, not a bug to fix.

## 9. The dilemma bot

The dilemma bot (#1282) chooses the dilemma stack for the opponent in the dilemma choice. It
lives in `src/lib/dilemmaBot/`. The page `/dilemma-lab` lets you test it. The practice table deals
the Chula pile as the dilemma pile of a bot game (#1289), and there Start lets the bot choose the
stack (#1299).

The bot is the pile bot (#1320): `src/lib/dilemmaBot/pile/` models any dilemma pile as entries of a
registry, so it plays the Chula pile (#1507) and the Championship piles, such as Think Tank 50's and
Cardassian in Gamma Quadrant. The practice table (#1508) and the lab (#1509) both use it, and its
beam search, `choosePileStack`, is its only search (#1510). `scripts/dilemma_bot_pile_pilot.ts`
measures it.

| Game term | Code | Note |
|---|---|---|
| the opponent's dilemma pile | `OPPONENT_DILEMMAS`, `COPIES_OF_EACH` in `opponentPile.ts`; `drawLabTitles` in `pile/labAttempt.ts` | A fixed pile: 3 copies of each of 9 Chula dilemmas, each with its title, its collector's info and its cost. The lab draws from it as titles. |
| the Chula pile on the table | `chulaPileDeck(data)` in `chulaPile.ts`, `collectorsKey` in `opponentPile.ts` | The pile as a `DeckList` of card rows, 27 cards, each found by its collector's info, not its title, since other versions such as `Chula: The Dice (Promo)` share it. |
| a game against the bot | `TableState.opponent: 'bot'` | Not a rulebook term. Absent in a game of one player. Only a new game sets or clears it. A bot game's dealt deck is the player's deck with the Chula pile in place of its dilemmas. `?fixture=bot` deals one. |
| the bot's draw and spend | `Attempt.botDraw`, `Attempt.botSpend`, `drawSpendText` in `drawSpend.ts`; the popup's fields `attempt-bot-draw`, `attempt-bot-spend` | Not a rulebook term: in the rules both equal N. The table cannot work out the bot's limits for certain, so in a bot game the player sets them in the attempt popup before Start (#1291). Each field shows N until the player edits it. Absent in a game with a deck's dilemmas. The text reads "draw D, spend S", or "draw/spend N" when both are N. |
| the mission requirements | `RequirementBranch`, `parseRequirementBranches`, `meetsRequirements` in `requirements.ts` | The skills and the attribute checks, such as `Cunning>34`. `parseMissionRequirements` in `src/lib/missionRequirements.ts` reads the skills only. |
| the attempting personnel, and the copies of Chula: The Game on the mission | `PileAttempt` in `pile/model.ts` | The attempting personnel, the mission's requirements, the mission, the ship at a space mission, the player's table, and the copies of Chula: The Game on the mission. **This is not `Attempt` of the practice table** (`TableState.attempt`). |
| a legal dilemma stack | `isLegalPileStack`, `legalPileStacks` in `pile/search.ts` | Drawn dilemmas only, each of a type that fits the mission, no title twice unless its model is `repeatable`, and a total cost, for this attempt, of N or less (`stackCostOf`, which reads the order). |
| the cost the bot may spend at reveal | `PileAttempt.spend`, `PileAttempt.revealedCost`, `PlayState.costLeft`, `revealCostOf` in `pile/model.ts` | N, the spend of the attempt (#1555), plus the `extraBudget` of every title of the chosen stack, and of a fetched title from its reveal, less the total cost of the dilemmas revealed so far, with the discounts of `stackCostOf`: both read one step, `revealCostOf`, so a stack legal at N never goes over on its own titles. A fetched dilemma counts too. Absent `spend`: no cost rule. |
| a dilemma overcome over the cost | `PlayState.overBudget`, `faceRest` in `pile/play.ts` | A dilemma whose reveal takes the total cost over what the bot may spend: it and every dilemma after it, a fetched one too, are overcome at once, not faced, and go beneath the mission (#1555). |
| a fetch of nothing | `PileResult.fetchedNothing`, `PileStackScore.fetchedNothing`, `PlayState.addBestOnTop` | A fetching dilemma (Vault of Tomorrow, Talosian Trial) that fetched nothing: no candidate fits the cost left, none helps (fails the attempt where the play without it does not, does more lasting damage, or stops more personnel), or it was not faced. The search never chooses a stack with one (#1555). |
| the probability that a stack fails the attempt | `PileStackScore.pFail` | |
| lasting damage | `PileStackScore.damage` | Not a rulebook term. The average lasting damage, with the weights of #1320 (`lastingDamage`, below). A stop does not count: stopped personnel are unstopped each turn. |
| the dilemmas a stack puts under the mission | `PileStackScore.under`, `underOf` in `pile/search.ts`; `PileResult.backToPile`, `PileResult.notUnder` | The average over the plays: every dilemma of the stack whose model goes beneath the mission, so not Chula: The Game, faced or not, less the dilemmas a play sent elsewhere, back to the pile (`backToPile`, #1518) or, when its effect fired, to the core or a ship (`notUnder`, `PlayState.notPlacedUnder`, #1534). A static `goesUnder: false` is only for a title that never goes beneath this mission. |
| the bot's choice of a stack | `choosePileStack`, `beamPileSearch`, `BEAM_DEFAULTS`, `rankPileScores`, `CONFIDENT`, `CANNOT_FAIL`, `DecisionMode` in `pile/search.ts` | The beam search (#1320): it builds the stacks one dilemma at a time, keeps the best `width` of each length, and gives the best finalists more plays. The rank is P(fail) first, then the lasting damage, then the dilemmas under the mission (#1282); from a P(fail) of `CONFIDENT` the bot takes the most damage among the sure stacks, and below `CANNOT_FAIL` the most damage of all. |
| the bot's attempting personnel on the table | `pileAttemptOf(input)` in `pile/tableAttempt.ts`; `attemptingCards(table, missionIndex, shipId?)`, `botTableFactsOf(table)` in `attempt.ts` | Builds a `PileAttempt` from card rows, not from `TableState` (#1298, #1508): the unstopped personnel of the attempting cards (the away team at a planet mission, the crew of the ship at a space mission; no equipment), the mission's requirements, the mission, the ship, the player's table, the copies of Chula: The Game placed on the mission, and the table facts (`BotTableFacts`, #1352) that `useBotAttemptStart` builds with `botTableFactsOf` and passes on to `pilePersonnelOf`. Its `random` is true when the requirements cannot be read, and the caller then picks a random legal stack. |
| the bot's draw on the table | `drawFromDilemmaPile(pile, count)` in `tableReducer.ts`; `drawnPileTitles(rows)` in `pile/tableAttempt.ts` | Up to D draws from the dilemma pile, with the shuffle of a face-up top card before each draw (#1283). It is random, so the page calls it, not the reducer. `drawnPileTitles` gives the title of each drawn card, in draw order; a card with no name is left out. |
| the map back from the bot's stack to the drawn cards | `pileStackCardIds(drawn, stack)` in `pile/tableAttempt.ts` | Each title of the chosen stack takes the first drawn card of that title not taken yet, so the stack's order holds and two copies of a title stay apart. |
| the search of the bot | `useSearchWorker` in `useSearchWorker.ts`; `answerSearch`, `SearchRequest`, `SearchResponse` in `searchRequest.ts`; `search.worker.ts` | Shared by `/dilemma-lab` and the practice table. The worker and the main-thread fallback both answer with `answerSearch`. The kind `'table'` runs `choosePileStack` with no baseline; the lab's `'lab'` scores a 2,000-play baseline too. |
| the bot's dilemma choice on the table | `botAttempt` (a `TableAction` and a `LogEntry` kind) in `tableReducer.ts` and `gameLog.ts`; `useBotAttemptStart` in `useBotAttemptStart.ts` | Start in a bot game (#1299). The page draws the bot's dilemmas, asks the search for the stack with the popup's Spend, and then dispatches one `botAttempt`: it starts the attempt, puts the drawn cards in the dilemma hand, moves the chosen ones to the stack in the bot's order, and switches to `'face'`, so the rest go to the bottom of the dilemma pile face up. One log entry counts the cards drawn and stacked without naming the stack, and one undo takes it all back. While the bot chooses, Start reads "The bot is choosing…" and undo does nothing. |
| a personnel's gain from its own game text, and when it applies | `PersonnelGain`, `GainCondition`, `MissionCondition`, `AttemptedMission`, `parseGains`, `gainHoldsAt`, `attemptedMissionOf`, `personnelGainsOf`, `GAIN_OVERRIDES` in `gains.ts` | Not a rulebook term (#1349, #1350, parts 1 and 2 of #1340). The skills (as levels) and attribute changes a personnel gives itself. The condition `'facing'` is "while this personnel is facing a dilemma, …", and `'attempting'` is "while this personnel is attempting a mission, …". A `MissionCondition` narrows either to the attempted mission: a space or planet mission (`missiontype`), a quadrant ("[DQ] mission", `quadrant`), or its points ("worth 50 or more points", "worth 30 or fewer points"). `AttemptedMission` is the fields of the attempted mission's row that it reads, and `attemptedMissionOf` takes them from a row, for the practice table and the lab alike. Two more heads need a partner (#1356, part 3a of #1340): "while this personnel is present with <partner>, …" is `'attempting'`, and "while this personnel is facing a dilemma and you have <partner> present, …" is `'facing'`; see "present with" below. The self clause "he/she and each … present (is\|are\|gains) …" counts its self part only, so Seven of Nine, Annika reads as an `'attempting [dq]'` gain. A choice ("you may"), a count ("for each"), a loss, an "if" condition, any other qualifier ("that requires …", "with an event on it", "region: …", an affiliation icon) and a gain for other personnel give none. `GAIN_OVERRIDES`, keyed by the lowercased name less its version suffix, replaces the parse of a card the parser reads wrong. |
| a gain while a condition on the player's own table holds | `TableCondition`, `BotTableFacts`, `tableConditionHolds`, `PersonnelGain.table`, `PartnerTest.personnel`, `PartnerTraits.type` in `gains.ts`; `partnerTraitsOf` in `simulator.ts`; `botTableFactsOf` in `attempt.ts` | Not a rulebook term (#1352, part 4 of #1340). A gain whose head reads the player's own table: the completed missions ("while you (do not) command a completed (space) mission", "two completed space missions", "fewer than two completed missions"), the discard pile ("while you have <cards> in your discard pile", "while <cards> is/are in your discard pile", with the cards read as a `PartnerTest` where "personnel" tests the card type, "cards" means any card, and "ten or more" is a count), or the core ("while you command an event in your core"). The gain is `'attempting'`, with a `TableCondition` that counts completed missions, discard pile cards or core events between a `min` and a `max`. `BotTableFacts` is what the conditions read, built once per bot attempt by `botTableFactsOf`: the `missiontype` of each completed mission, the `PartnerTraits` and type of each discard pile card, the number of events in the core, and the `PartnerTraits` of each personnel the player commands (`commanded`, #1360): every away team and every ship's crew, at every mission. The brig is not read. With no facts, the dilemma lab's case, every table condition holds. A head that compares with an opponent (Rusot: "than each of your opponents"; Richardson: "each player") and a head on the hand, captives, an event keyword or title, a mission keyword or "three [X] personnel" give no gain. |
| a personnel loses all of its skills while you command a [Bor] non-Dissident personnel | `SkillLoss`, `parseSkillLoss`, `personnelLossOf`, `PersonnelGain.nextAbility`, `PartnerTest.notTraits`, `SPHERE_117`, `isSphere117`, `sphere117Holds`, `asSphere117Dissident` in `gains.ts`; `botPersonnelOf` in `simulator.ts`; `LabDeck.sphere117` in `DilemmaLabClient.tsx` | Not a rulebook term (#1360). "While you command a [Bor] non-Dissident personnel, this personnel loses all of his skills and his next ability" (Tuvok, Mostly Assimilated, and the other Borg Dissidents). The loss is plain data: a `TableCondition` of the kind `'commanded'`, which counts the personnel of `BotTableFacts.commanded` that pass one of its tests ("non-dissident" is a negated trait), and `nextAbility`. While it holds, `botPersonnelOf` sets every skill to 0 in both profiles and drops the gains that `parseGains` marks `nextAbility`, those of the sentence after the loss (Seven of Nine, Annika; Tuvok, Mostly Assimilated). `PartnerTraits.skills` keep the printed skills. The brig is not commanded. With no facts, the dilemma lab's case, the loss always holds, and the lab sends the game text of every card with a loss. Sphere 117, Renegade Borg Sphere (#1363): "while each of your missions is a [DQ] mission, each {Drone} you own gains Dissident and loses Drone". `sphere117Holds` is true when the player has a Sphere 117 and at least one mission, all of them [DQ]; an empty mission slot does not count. On the practice table, `botTableFactsOf` reads a Sphere 117 on any ship row, and while it holds a commanded Drone reads Dissident in place of Drone (`asSphere117Dissident`). In the lab, `LabDeck.sphere117` is set for a deck with a Sphere 117 in its draw deck and only [DQ] missions, the headquarters too, and the lab passes it to `botPersonnelOf` as `lossSuspended`. Partner tests keep the printed keywords. |
| present with | `PartnerRequirement`, `PartnerTest`, `PartnerTraits`, `parsePartner`, `passesPartnerTest`, `PARTNER_TRAIT_WORDS` in `gains.ts`; `BotPersonnel.traits`, `BotPersonnel.partnerGains`, `PartnerGainEntry`, `partnerGainEntriesOf`, `partnerGroupOf` (the group step), `withPartnerGains`, `PileAttempt.livePartners`, `LivePartnerProfile`, `LivePartnerGain` in `simulator.ts` | A gain "while … present with <partner>" needs `count` **other** personnel of the attempting group (1 by default; "two", "three"), each passing one of the alternatives joined by "or". A personnel is never its own partner, and a stopped personnel is not present: `pileAttemptOf` leaves stopped personnel out of the group. A `PartnerTest` is a conjunction of printed traits: an affiliation from a bracket token through `AFFILIATION_ABBREVIATIONS` of `deckPlayability.ts`, perhaps negated ("non-[na]"); a card icon, any other bracket token ("[pa]", "[maq]"); a skill (`SKILL_INDEX`), read from the partner's **base** skills, never its gains; a title, "{odo}", a prefix of the lowercased name; and a bare word, which passes when it is in the partner's keyword list **or** its species list. A bare word must be in `PARTNER_TRAIT_WORDS`, each a keyword or a species of the card data; a plural after a count ("macos") drops its "s", and "{dissident}", a word of that list in braces, is a keyword, not a title. "a", "an" and "your" mean the bot's own group, and "personnel" is filler. Any other word, "stopped", an opponent's partner and two different partners (Amanda Cole, Sfreett, Talak'talan) give no gain. `botPersonnelOf` keeps the partner gains that hold at the mission in `partnerGains` and counts none; `partnerGroupOf`, called once per group by `pileAttemptOf` and by the lab's crew and random-crew check, resolves each to the indexes of its partners (`partnerGainEntriesOf`), counts in `personnel` every gain whose count is met against the whole group as the attempt starts, and keeps in `PileAttempt.livePartners` the base profiles and the met-able gains of each personnel with one (`withPartnerGains` gives the `personnel` alone). The gain is live in a play (#1357, part 3b of #1340): `playPileStack` settles it again (`PlayState.settleBeforeDilemma`) before each dilemma, after the copies of Chula: The Game on the mission stop their personnel, against the unstopped personnel, so a partner that a dilemma stops, or that Chula: Pick One to Save Two returns to the hand, ends the gain from the next dilemma on, never within the dilemma that removed it. The requirements check after the last dilemma reads the `'attempting'` gains settled against the final unstopped personnel, and the player's choices against each set they test. An attempt with no `livePartners` takes the path with no refresh. The play does no string matching. |
| the dilemma checks, and the mission-requirements check after the last dilemma | `BotPersonnel.attrs` and `skills` (the dilemma profile), `BotPersonnel.requirementProfile`, `requirementProfileOf` in `simulator.ts` | Not rulebook terms. Every check of a dilemma reads the dilemma profile, the base plus the `'facing'` and `'attempting'` gains. The requirements check at the end of `playPileStack`, and the prediction of it in Chula: Pick One to Save Two, read the requirements profile, the base plus the `'attempting'` gains. `botPersonnelOf` builds both once, for the attempted mission it is given: a gain with a `MissionCondition` counts only when that mission meets it, and with no mission it never counts. A gain that needs a partner is settled per group as the attempt starts, by `partnerGroupOf`, into the same two profiles by its condition, and `playPileStack` settles it again before each dilemma and before the requirements check (see "present with"). |
| a dilemma, as the bot plays it | `DilemmaModel` in `pile/model.ts`; `REGISTRY`, `modelOf`, `pileTitleOf` in `pile/registry.ts`; the models in `pile/titles/*.ts`, one file per group of titles, built with `dilemmaList` of `pile/define.ts` | One model per title, and one title per model: `REGISTRY` throws on a title two files define. A new group of titles is a new file of `titles/`, added to the list in `registry.ts`. "Sylvia *VP" and "Sylvia" are one model. `kind` is the dilemma's type (planet, space or dual), `printedCost` its cost, `cost` its cost for the attempt under the assumptions of #1320, `status` `'play'` or `'ignore'`, `category` the category of #1320 when it reads the bot's side, and `family` the shape of its text. |
| the shape of a dilemma's text | the builders of `pile/families.ts`: `unless`, `chooseOrElse`, `selectRandom`, `selectUntil`, `botChooses`, `allButOne`, `anyOfAffiliation`, `playerStops` | Not a rulebook term. For example "Unless you have <requirements>, <effect>" is `unless(requirements, effect)`. |
| the opponent chooses, you choose | `PlayState.botChooses`, `PlayState.playerChooses` in `pile/play.ts` | The bot takes the personnel whose loss fails the attempt, then the most valuable. The player takes one whose loss keeps the requirements met. |
| the bot's choice shown to the player | `PileResult.labels` | The label of #1320, such as "Named Navigation". It states the choice, not its result. |
| a skill dot, `[SD]` | `PilePersonnel.skillDots` | One per skill line of a personnel: "2 Treachery" is one dot. |
| a personnel cannot use its abilities | `PlayState.abilitiesOff`, `PilePersonnel.printed` | Dereliction of Duty. Every check reads the printed skills and attributes, with no gain. |
| the player's side of the table, as the pile reads it | `PileTable`, `PileMission`, `PileShip` in `pile/model.ts` | The headquarters, the completed missions, the hand size, the dilemmas beneath the mission, the turn; the mission's type, points and span; the ship's Range, Weapons and Shields. |
| lasting damage, with the weights of #1320 | `lastingDamage`, `DAMAGE_WEIGHTS` in `pile/model.ts` | A kill, a hold in the core, a move off the attempt, a personnel in the bot's brig and each personnel aboard a lost ship count 1, a return to the hand 0.75, a stop 0. |
| Chula: The Game on the mission, and a stack that starts with it | `PileAttempt.gameOnMission`, `PlayState.gameCopies`, `DilemmaModel.leads` | Before a dilemma whose title begins with "Chula", each copy on the mission stops one random unstopped personnel; a copy in the stack adds to them and goes onto the mission, not beneath it. When the draw holds a copy, every stack the search builds starts with one copy (#1282, #1507). |
| the player's choice in Chula: Pick One to Save Two | `PileAttempt.choice` | `'best'` (the default) or `'random'`. |
| present with, in a play of the pile bot | `PileAttempt.livePartners`, `PlayState.settleBeforeDilemma` | The partner gains of #1357: the play settles them again before each dilemma, after the Game's stops, and the requirements check and the player's choices settle them against the personnel they test. |

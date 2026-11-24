# The Second Edition Rulebook

This folder holds the text of the *Star Trek* Customizable Card Game Second
Edition Rulebook, **version 4, April 2015**, by The Continuing Committee,
<https://www.trekcc.org/op/rulebook.pdf> (20 pages). The Continuing Committee
publishes it free on trekcc.org; the owner of Webula asked for the full text here,
with its credit and source (#1939). The PDF is not in the repository.

Version 4 "replaces and supersedes the previous rulebook". Later rulings of The
Continuing Committee, such as its current Glossary and rulings documents, can
override parts of it. When they do, the later ruling wins; a later issue may add
them next to these files.

Read [`docs/ubiquitous-language.md`](../ubiquitous-language.md) for the map from
the rulebook's terms to the code.

## Files

One file per top-level section of the rulebook, in the rulebook's order. The
rulebook's table of contents gives the page in the last column.

| File | Section | Pages |
|---|---|---|
| [01-introduction.md](01-introduction.md) | Introduction | 2 |
| [02-types-of-cards.md](02-types-of-cards.md) | Types of Cards: Personnel, Ship, Equipment, Event, Interrupt, Mission, Dilemma | 2–6 |
| [03-how-the-card-types-fit-together.md](03-how-the-card-types-fit-together.md) | How the Card Types Fit Together, Affiliations | 6 |
| [04-setting-up-the-game.md](04-setting-up-the-game.md) | Setting Up the Game, and the sample layout of page 7 | 6–7 |
| [05-playing-the-game.md](05-playing-the-game.md) | Playing the Game, Turn Sequence | 8 |
| [06-play-and-draw-cards.md](06-play-and-draw-cards.md) | 1. Play and Draw Cards: Drawing Cards, Paying Costs, In Play/Not In Play, Showing Your Cards, Playing Specific Kinds of Cards, Important Game Terms | 8–9 |
| [07-execute-orders.md](07-execute-orders.md) | 2. Execute Orders: General Rules on Executing Orders, Beam Personnel, Move a Ship, Attempt a Mission, Facing Dilemmas, Checking Mission Requirements, Order Actions on Cards | 10–12 |
| [08-discard-excess-cards.md](08-discard-excess-cards.md) | 3. Discard Excess Cards | 13 |
| [09-winning-the-game.md](09-winning-the-game.md) | Winning the Game | 13 |
| [10-building-a-deck.md](10-building-a-deck.md) | Building a Deck | 13 |
| [11-thats-it.md](11-thats-it.md) | That's It! | 13 |
| [12-other-important-rules.md](12-other-important-rules.md) | Other Important Rules: Uniqueness, Present, Combat, Engagements, Damage, Brig and Captives | 13–14 |
| [13-glossary.md](13-glossary.md) | Glossary, one `##` heading per entry | 15–20 |
| [14-credits.md](14-credits.md) | Credits, Contact | 20 |

## Search, read, cite

- Search: `grep -rn "facing a dilemma" docs/rulebook/`. A Glossary entry is a
  heading: `grep -n "^## stopped" docs/rulebook/13-glossary.md`.
- Read in parts: each file is one section, and each subsection is a heading.
- Find the page: a comment `<!-- page N -->` marks where each printed page
  starts, so the page of a line is that of the last marker above it.
- Cite: name the rulebook version, the file, the section heading and the page,
  and quote the sentence. For example: Rulebook v4, Glossary, "actions" ›
  "Response actions", p. 15 (`docs/rulebook/13-glossary.md`): "Response actions
  triggered "when" personnel are "facing a dilemma" can only be used once per
  dilemma."

When a model, a test or an answer to a rules question depends on a rule, cite
the rule this way, in the code comment, the issue or the pull request. Answer
from these files, not from memory.

## Conventions of the transcription

- **Verbatim.** The words are the rulebook's, in its reading order, including its
  typos ("a a Nucleogenic card", "the this turn", "facing a dilemma., you may").
  A scripted check found every sentence of the PDF's text in these files. Only
  the layout changes: the two columns become one, and a sentence that runs across
  a page break carries the page marker inside it.
- **Grey boxes.** The rulebook prints its advanced rules in grey boxes ("When you
  are first learning the game, you can skip the text in these grey boxes"). Here
  each is a block quote that starts with **Grey box.**
- **Examples.** The rulebook sets its examples in italics; so do these files.
- **Icons** are written as the bracketed names of the card data,
  `public/cards_with_processed_columns.txt`:

  | Icon | Name | Icon | Name |
  |---|---|---|---|
  | `[Cmd]` | command | `[Baj]` | Bajoran |
  | `[Stf]` | staff | `[Bor]` | Borg |
  | `[Pa]` | past | `[Car]` | Cardassian |
  | `[AU]` | alternate | `[Dom]` | Dominion |
  | `[Fut]` | future | `[Fed]` | Federation |
  | `[DS9]` | *Deep Space Nine* | `[Fer]` | Ferengi |
  | `[E]` | Earth | `[Kli]` | Klingon |
  | `[Maq]` | Maquis | `[Rom]` | Romulan |
  | `[TN]` | Terok Nor | `[SF]` | Starfleet |
  | `[TNG]` | *The Next Generation* | `[NA]` | Non-Aligned |
  | `[TOS]` | *The Original Series* | `[HQ]` | headquarters mission |
  | `[Voy]` | *Voyager* | `[P]` | planet mission or dilemma |
  | `[AQ]` | Alpha Quadrant | `[S]` | space mission or dilemma |
  | | | `[D]` | dual dilemma |

  The skill dot that marks each listed skill is `●`. The unique dot before a
  title is `•`, as the rulebook prints it in its text.
- **Pictures.** Pages 3 to 6 show one card of each type with labels, and page 7
  a sample layout of the table. Each is described in a paragraph that starts
  *Example card* or *Sample layout*: the labels, and the card's text as printed.
  These descriptions are the only text here that is not the rulebook's own.
- The footer of every page, the copyright line, is quoted once, at the end of
  [01-introduction.md](01-introduction.md).

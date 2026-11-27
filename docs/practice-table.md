# The practice table

The rules of the practice table (`/decks/practice`) that the code does not show at a glance.
Read this file before you change the layout or the scale of the table, its turn controls, an
attempt, the dilemma bot, or a card-text model. The code and its tests hold the detail: the test
ids, the log text and the card-by-card lists. How to check the table in a browser is in
`AGENTS.md`.

## Layout and scale

Scale 1 is a table 320 px tall, and the card sizes in `MissionRow.tsx` and `TableCard.tsx` are the
sizes at scale 1. At the minimum screen, 667×375, the table draws at a scale of 375/320, about 1.17, and a layout
that must fit the minimum screen must fit it at that scale.

The missions and the ships draw at a mission scale of their own, never below the table scale. On a
touch screen they grow until a mission column with two rows of ships fills the height above the
bottom row, as far as the width allows five missions, the four gaps between them, a gutter on the
right and the column of the turn controls on the left. A desktop does the same with the whole
mission card. The mission row holds no dilemma stack: the stack lives only in the attempt layout.

The bottom row (the piles, the core, the brig and the closed hands over it) grows on a large screen
by one bottom-row scale: half the table scale, never below 1, never above 1.75, and never so large
that the mission column stops fitting above it. The size of the screen decides it, not the pointer,
so it is 1 at the minimum screen, on a phone and at 800×600. The sizes of the row are functions of
it in `flatRowWidths.ts`.

Only the practice route sets `viewport-fit=cover`, so on an iPhone the table draws under the home
indicator and the notch. The content column pads by the safe-area inset of each side, the scale
math works on the width less the left and right insets together, and the fixed overlays (the card
list panels, the preview, the flat fan, the menu splash, the modals) take the insets in CSS. The
constant gutters, such as the column of the turn controls, are measured from the content edge.

## The 3D table

The table always draws in 3D (`table3d.ts`). The board of missions and ships and the bottom row
lean away from the player as one plane: both take the same tilt about the same hinge on screen, the
middle of the bottom edge of the bottom row. The hands, the corner buttons and the turn and score
column stay flat in front, because the hands are `position: fixed` and a transformed ancestor would
re-anchor them.

Each tilted element sits inside its part's measured box, never on it, so the measurements of the
layout are those of a flat table and the sizes do not change. dnd-kit measures each droppable's
projected box and the browser hit-tests the tilted cards as drawn, so a drop or a tap lands where
the card shows. The attempt layout does not tilt.

The draw deck, the dilemma pile and the discard pile draw layers of cards under the top card
(`pileDepth.ts`). A pile stands on the bottom row's baseline and its contents rise by its height,
while its box keeps its place, so the layers change no size, drop half or drag.

## The turn and score column

The turn and score controls sit in the left column, below the menu, fullscreen, undo, redo and game
log buttons, on touch and desktop alike. The bottom row holds no turn or score. The column sizes its
tap rows from the free height, between 32 and 44 px. Where 32 px does not fit, the "Turn" and
"Score" labels go first, and only then does the column go compact.

In fullscreen on iPadOS, WebKit draws its own close X over the top-left corner, and no CSS reaches
it. The corner column moves below it, and the table hides its own fullscreen button there, so the X
is the one way out. On a touch screen the corner buttons take the look of that X (`.btn-system`).

## The turn

A turn has segments: play and draw, then orders, then discard when the hand holds more than 7. The
next-turn button advances through them. No segment refuses a move: the table checks nothing that
stops a player, it only warns.

The counters, the charges, the pending discounts and the use limits are all derived from the log.
A correction, of a charge or of the counter limit, is a log entry and never a change to the table,
and the log is read through its corrections (the effective log). An undo of any action therefore
gives back what it spent or used.

A new game deals no hand: the column shows Draw 7 until the opening hand is drawn. The resolving
zone holds one card or none. While it holds one, the turn does not advance.

The game menu's Settings hold settings of the device, each off by default: counters, apply card
text to attributes, resolve events in a panel, check uniqueness and limits, and search piles in a
carousel. The page stamps a setting onto the action that needs it, so the reducer reads no storage
and a change of the setting leaves what was already done as it was.

## The card-text models

A model is plain data, keyed by the card's whole title, and a new card is a data row and a test.
One reader counts the uses of an ability this turn from the effective log (`src/lib/useLimit.ts`),
so the next turn and an undo give a use back. The registries:

- Cost models (`src/lib/costModels/`): what a play costs, what grants counters, and the choices and
  uses a play offers. Mission spends are in `missionSpends.ts`.
- Play models (`src/lib/playModels/`): the effect of "When you play this …" on a personnel or ship.
- Resolve models (`src/lib/resolveModels/`): the steps of an event that resolves when played.
- Effect steps (`src/lib/effectSteps.ts`): the steps that play, resolve, order and trigger models
  share. Steps that need no input of their own join the step before them in one stage: one panel,
  one action, one log entry.
- Order models (`src/lib/orderModels/`): the "Order - …" clauses, used in the orders segment.
- Trigger rows (`src/lib/triggers/`): abilities that answer a game event. The offers are derived
  from the log, never stored.
- Attempt abilities (`src/lib/attemptAbilities/`): "While this personnel is attempting a mission".
- Modifiers (`src/lib/modifiers/`): changes to attributes, Range, span and skills, and the play
  permissions that the rule check warns about.
- Play places (`src/lib/playPlaces/`): where a personnel, ship or equipment may be played.
- The mission registry (`src/lib/missionModels/`) and the requirement rules
  (`src/lib/requirementRules.ts`): what a mission does, and how cards change requirements. The bot,
  the cost facts and the deck builder read the same requirement rules.

The backlog tests print what has no model yet, by the number of shipped decks that play it:

```bash
COST_BACKLOG=1 yarn test costModelBacklog     # cost changes and counter grants
PLAY_BACKLOG=1 yarn test playModelBacklog     # "when you play" effects
PLACE_BACKLOG=1 yarn test playPlaceBacklog    # "you may play" places
MODEL_BACKLOG=1 yarn test modelBacklog        # every clause, by concern; =<path>.md writes a file
CARD_DRAFTS=<path>.md yarn test modelBacklog  # drafts of rows for the unmodelled clauses
```

A draft never goes into a registry by itself: check it against the card and move it in with a test.

## The places of the table

**The hand.** The closed hand is a small face-up fan at the bottom edge of the screen, drawn over
the bottom row in its own layer and taking no width in it (`CardHand.tsx`, `closedFanSpan`). Its
cards carry no `data-card-id` and do not drag; a hold previews one. A tap opens the hand as an arc
along the bottom edge (`handArc.ts`), between the draw deck and the dilemma pile, flatter and lower
in touch mode and kept clear of the iOS edge gesture. A card of the arc drags from it, and a press
becomes a drag only after 20 px, so a drifting thumb still gets the hold preview. At most one hand
is open as the arc. The dilemma hand shows only in the attempt layout in the dilemma choice.

**The piles.** The draw deck and the dilemma pile each carry Shuffle, Download and an eye. The eye
opens the reveal panel, empty at first: each "Reveal top" or "Reveal bottom" shows one more card of
that end without moving it, one end at a time, and a reorder there changes the pile. With "Search
piles in a carousel" on, the search of the draw deck, the dilemma pile and the discard pile opens
`PileCarousel` (`pileCarouselLayout.ts`) in place of the grid: one card large in the middle, which
alone drags out, a tap on a side card brings it to the middle, and a tap on the middle card selects
it. The pile's actions act on the selection in pile order.

**The mission card.** Its art has two drop halves, under (top, over the slivers of the dilemmas
under it) and on (bottom). They differ only for a dilemma: under the mission or placed on its card.
A ship goes to the ship row, a personnel or an equipment to the away team, any other card onto the
mission card. A tap on the top half opens the dilemmas under it, on the bottom half the away team;
a double-tap within 250 ms toggles completion, so a single tap acts only after that window. A
completed mission turns 90° in its slot and nothing else moves. The cards placed on the mission
count in an events badge and a dilemmas badge, or on the card itself where it is drawn whole, and
the last 3 of each show in a strip along its edge. The missions whose completion acts on the
player's cards (`completionEffects.ts`) open a panel with the effect, its candidates, Confirm and
Skip; the completion and its effect are one action and one undo.

**The ship.** A ship's art is its one drop target: a personnel or an equipment boards the crew, a
ship goes to its ship row, and any other card is placed on it and counted. A tap opens the crew
panel, where the cards on the ship show below it and drag off it. The bare ship row takes only a
ship.

**The Play target.** With "Resolve events in a panel" on, a drag from the hand of one event that
resolves when played (`resolvesOnPlay`) shows a Play target over the table above the bottom row
(`PlayTarget.tsx`, `playTargetRules.ts`), outside an attempt and while nothing resolves. A drop
there is a charged play into the resolving zone; below the line every target takes the card as
before, uncharged.

## Undo

Every action is one log entry and one undo. The page chooses the result of every shuffle and every
random pick before the dispatch and the action carries it, so the reducer calls no random function
and an undo or a redo keeps the same result. Redo puts back the table the action left and never
runs the action again. Any new action after an undo empties the redo history. The saved game holds
the log, and the histories are saved under a key of their own.

Escape closes the top layer of the table and only that one. A new layer that closes on Escape joins
the same stack with `useEscapeLayer` rather than a `keydown` listener of its own.

## A mission attempt

An attempt has a phase. In the dilemma choice, `'choose'`, the stack is face up and the player
draws into the dilemma hand; the dilemma hand shows only there. In facing, `'face'`, the stack is
face down and the player reveals its cards. A move to facing turns the stack face down and sends the
dilemma hand to the bottom of the dilemma pile, face up; a move back turns the stack face up and
moves no card. Each is one log entry. A bot game opens straight in facing.

Every attempt keeps its own draw and spend, set at the start, from the popup's numbers, the bot's,
or a mission that changes them. The personnel row reads the live away team or crew, while the
numbers of the attempt stay frozen.

The attempt layout replaces the mission row: the attempted mission drawn whole, the ships and the
attempting personnel, then the dilemma stack. The mission grows only while the personnel area keeps
three cards at the crew panel's width. Which view shows, the attempt layout or the full table, is
page state, keyed on the attempt's mission and ship, and not saved; the attempt itself is saved.

## The dilemma bot

In a bot game the bot chooses the stack at the start, and labels and resolves the revealed top card
from the live table and the saved reveal snapshot of that card. Every random selection of a dilemma
rolls at the reveal, and the snapshot keeps it, so a reload or a preview never rolls again. One
Resolve is one action, one log entry and one undo, and it moves the dilemma where it goes.

When a dilemma has the player choose personnel, the player's selection in the attempting row is the
choice, and the bot's own pick never shows. A dilemma that changes how the personnel are read for
the rest of the attempt keeps the change on the attempt, and each reveal snapshot keeps the changes
as they stood when its card turned face up, so a later card reads them and the card that set them
does not count them twice.

A player starts a bot game in Load deck's step 2: Play against the bot lists the bot's piles
(`bot-pile-<id>`), Chula first, then each beginner and visible Championship deck whose dilemmas the
registry covers (`botPileChoices` in `src/lib/dilemmaBot/botPiles.ts`). A chosen deck's dilemmas, less
the ignored titles, become the bot's pile, and `TableState.botPile` keeps its id, its name and the
affiliations of its personnel, which reach the attempt. A bot game with no `botPile` plays the Chula
pile. A `botDeck` trigger row (`src/lib/triggers/titles/bot.ts`) is a card of the bot's deck that the
bot uses and the player is never offered: Unexpected Difficulties lets the bot, once a game at Start,
with 4 or more drawn and a search answer of `'cannot-fail'`, put the drawn dilemmas on the bottom of
its pile and draw as many again (`botRedraws` in `useBotAttemptStart.ts`).

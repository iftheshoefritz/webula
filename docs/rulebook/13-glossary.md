# Glossary

> Source: *Star Trek* Customizable Card Game Second Edition Rulebook, version 4,
> April 2015, The Continuing Committee, pages 15–20,
> <https://www.trekcc.org/op/rulebook.pdf>. Verbatim transcription; see
> [README.md](README.md) for the conventions. Later rulings of The Continuing
> Committee can override this text.

Each entry of the rulebook's alphabetical glossary is a `##` heading in lower
case, as the rulebook prints it, so `grep -n '^## stopped'` finds the rule. The
labelled parts of the entry **actions** (*Response actions*, *Requirements*,
*Costs*, *Effects*) are `###` headings under it.

<!-- page 15 -->

This glossary explains additional terms and rules not covered thus far, and
expands on some terms you've already read about.

## abilities

Personnel may have one or more abilities. Each keyword is an ability. Other
abilities may be denoted by the words "when" or "Order". They may also create a
continuous effect with or without a condition. Skills are not abilities.

## actions

Nearly everything that occurs during the game is some kind of action. Players
perform actions to play cards, draw cards, use game text, execute orders, and so
on. Normally, a player takes actions only on his or her turn. However, there are
also response actions, which can take place on any player's turn.

### Response actions

*Response actions* – The game text of a response action always begins with the
word 'When' and has a trigger describing the situation that allows you to use
that game text. Any time the trigger is met, you may use the text one time.

There are two special types of response actions, cost modifiers and "prevent"
response actions. Cost modifiers occur before a card's cost is paid, and before
any other response action. "Prevent" response actions are taken after costs are
paid, but before any other response action can be taken. In the case of
dilemmas, "prevent" response actions can be taken before or after any action of
the dilemma. If a card, action, or effect is prevented, no further response
actions to that card, action, or effect may be taken. Response actions that are
neither cost modifiers nor "prevent" response actions are taken as follows:

Response actions can be mandatory or optional. All interrupt response actions are
optional. For non-interrupt response actions, optional response actions use the
word 'may'. Mandatory response actions do not.

Sometimes the trigger for more than one response action will be met at the same
time. In these situations, all mandatory response actions occur first. Beginning
with the player whose turn it is, then the player to his or her left, and so on,
each player chooses any one of his or her mandatory response actions to take (if
that player has any), until every player who has any mandatory response actions
has taken one. This process then repeats until all mandatory response actions
have been taken. The same process then occurs for all optional response actions,
again beginning with the player whose turn it is. However, a player with optional
response actions may choose to not take any of them and pass instead. The
opportunity to take response actions ends when all players pass consecutively.

A player may use different copies of the same card to perform the same response
action more than once. If a player commands multiple copies of a card with a
mandatory response action, he or she must perform that action once for each copy
he or she commands.

Sometimes a response action prevents another action before its effect takes
place. When this happens, any costs of the prevented action remain paid.

Response actions triggered "when" personnel are "facing a dilemma" can only be
used once per dilemma.

### Requirements

*Requirements* – Check all requirements to perform an action (such as playing a
card) before paying its costs. *For example: some cards require you command
personnel with specific skills or characteristics.*

### Costs

*Costs* – The cost of an action could be paying counters, stopping a personnel,
discarding a card from hand, destroying a card, or any number of other
possibilities. The costs for an action are usually listed before the word "to"
(so the action takes the form of "pay X to do Y," with X being the cost and Y the
effect).

If you command two or more cards that have actions with the same costs, you must
pay for each separately. You cannot pay one cost to perform two or more actions.

### Effects

*Effects* – If the effect of a card's game text requires you to perform an action
and you cannot, you must perform as much as you can and ignore the rest. *For
example: if the effect of a dilemma stops two Medical personnel and you only have
one Medical personnel attempting the mission, stop the one you have and ignore
the rest.*

If you meet all the requirements and pay all the costs for taking an action, you
may take that action even if it will have no effect. *For example: Order –
Discard a card from hand to draw a card. You may discard a card from hand even if
you have no card to draw remaining in your deck.*

When separate effects combine to create a repeating loop, the player taking his
or her turn decides which effect takes place. *For example, a Treachery personnel
reads: While an opponent does not have an Intelligence personnel at this mission,
his or her personnel at this mission cannot use their abilities. An opponent's
non-Intelligence personnel reads: While an opponent's Thief or Treachery
personnel is at this mission, that personnel cannot use his or her abilities.
When these two personnel are at the same mission during your turn, you decide
which of them cannot use his or her ability.*

When a single action affects multiple players, each player performs that action
in turn order starting with the owner of the card. *For example: When Player A
plays Riva, Respected Mediator, he or she would draw*
<!-- page 16 -->
*a card before any of the other players would draw a card for this effect. Then
the player on her left would draw a card for this effect before any of the other
players and so-forth until each player has performed the action.*

When resolving effects including stopped personnel or ships, those personnel or
ships are still included if those cards were selected by the effect when those
cards were not stopped. *For example, if one commands a stopped Ikat'ika,
Honorable Warrior at the end of his turn, Ikat'ika will be killed by his ability
if it was used earlier that turn.*

## all

When a card refers to all of a certain group of cards, this includes cards that
are stopped. *For example: when Genesis Planet's ability is used, it would kill
each personnel on that mission, including stopped personnel.*

## attempting missions

Below is the timing for mission attempts and response actions involving them.

1. Active player (the player whose turn it is) begins a mission attempt
   - a. Active player announces where and by what means (normal or game text),
     showing required personnel, and announcing the difference between the
     number of personnel involved in the attempt and the number of dilemmas
     underneath the mission.
   - b. "When . . . begins a mission attempt" triggers process.
2. Draw Dilemmas
   - a. "When . . . about to draw dilemmas" triggers process.
   - b. Opponent draws dilemmas from his or her dilemma pile equal to the number
     announced (plus or minus any modifiers, minimum 0).
   - c. "When . . . drawn dilemmas" triggers process.
   - d. Opponent selects any number (0 or more) of dilemmas from those drawn,
     uses them to form the dilemma stack, and places the rest face up on the
     bottom of the dilemma pile.
   - e. "When . . . (choose/chosen) dilemmas" triggers process.
3. Facing Dilemmas
   - a. If there are no personnel still involved in the mission attempt, all
     remaining dilemmas in the dilemma stack are overcome.
   - b. "When . . . dilemma . . . about to (be) reveal(ed)" triggers process.
   - c. Opponent reveals the top card of the dilemma stack to Active Player.
   - d. "When . . . reveal" triggers process.
   - e. Cost-related response actions and cost-modifying dilemma gametext
     process.
   - f. Check dilemma for duplication, type, and cost. If it fails any of these,
     it is overcome. Otherwise, the dilemma's cost is deducted from the total
     allowed.
   - g. "When . . . about to face . . . dilemma" triggers process.
   - h. "(When/While) . . . (face/facing) . . . dilemma" triggers and
     "(When/While) . . . is attempting a mission" triggers process and may be
     used at any time until the end of step 4.a.
   - i. Process the dilemma's non-cost-related gametext, one action at a time.
     Continuous effects are simply in effect and are not actions.
4. Overcoming Dilemmas
   - a. After all dilemma actions are processed, if the Active Player has not
     been instructed to place it somewhere, it is overcome.
   - b. Repeat the process beginning at "Facing Dilemmas".
5. Once the dilemma stack is empty and no response actions adding dilemmas are
   used, it is time to complete the mission with the remaining unstopped
   personnel.
   - a. "(When/While) . . . is attempting a mission" triggers process and may be
     used until the end of the mission attempt.
   - b. "(When/While) . . . checking . . . mission requirements" triggers process
     and may be used until the end of the mission attempt.
   - c. Active Player shows all requirements needed to complete the mission. If
     he or she cannot, all of the personnel involved are stopped and all
     "When . . . fail a mission attempt" triggers and "When . . . mission attempt
     fails" triggers process.
   - d. If the Active Player does show all requirements, all "When . . . about to
     complete" triggers process, then the AP scores the points on the mission (or
     points in game text used to attempt and complete the mission, then
     "When . . . complete" triggers process. If the mission requirements change at
     any point during part 5, return to the beginning of part 5.

## attributes, ship

The printed attributes of a ship are public knowledge. Any modifiers to a ship's
public attributes need not be revealed until that attribute is used. *For
example, I.K.S. Vorn (Ship of Traitors) reads: "While your three [Kli] Treachery
personnel are aboard, this ship is attributes +2." While remaining at Qo'noS,
only the Vorn's printed RANGE of 7 is public information. When that player moves
from Qo'noS to Brute Force, he is using the ship's RANGE and is obligated to
reveal the total RANGE of the ship prior to his movement.*

Activated abilities that modify a ship's attributes never have to be revealed
unless they are used. *For example Kor (Noble Warrior to the End) reads: "While
this personnel is in an engagement, you may kill him to make the ship he is
aboard attributes +3 until the end of the this turn." The player that commands
Kor does not need to reveal his presence aboard a ship unless he activates his
game text.*

## cannot / may not

Game text which specifically forbids an action cannot be overridden except by
game text which specified what forbidding text is being overridden.

## Commander

This keyword used on personnel is always followed by a colon and the name of a
ship, establishing a corresponding relationship between the personnel and ship.
*For example: Jean-Luc Picard, Explorer has the keyword Commander: U.S.S.
Enterprise-E.* As with all keywords, there are no special rules associated with
this relationship, but the game text of other cards may allow you to take
advantage of it.

<!-- page 17 -->

## conditional effects

If game text has a conditional, any game text beginning with "also" that follows
will be subject to that condition unless specified otherwise. *For example:
"While your opponent has more points than you, you may spend an additional
counter each turn. Also, your personnel are attributes +1." Your personnel will
not be attributes +1 unless your opponent has more points than you.*

## Consume

If a card has the keyword "**Consume: X**", X is determined by the number of
cards actually placed underneath the mission by this text.

## dilemmas

A dilemma's requirements are any skills, attributes, or characteristics that
appear in **boldface** in its game text. *For example: While this personnel is
facing a dilemma, you may meet Integrity and Cunning requirements of that dilemma
using Strength instead. If a dilemma references Integrity or Cunning in non-bold
type, that is not a requirement, and this personnel does not let you use Strength
instead.*

Each of your personnel involved in a mission attempt is "facing" a dilemma
(regardless of whether its game text has an effect on him or her). They face
only one dilemma at a time. *For example: a dilemma that has been placed on a
mission or placed on a ship as a Damage card during a previous mission attempt is
no longer being faced by your personnel.*

You may use game text that works when you have "drawn dilemmas" even if you drew
0 dilemmas or 1 dilemma. *For example: When you have drawn dilemmas, you may
remove this event and those dilemmas from the game to search your dilemma pile
and choose a dilemma for your opponent's personnel to face that costs no more
than the number of dilemmas you removed. If your opponent begins a mission
attempt and due to overcome dilemmas you draw no dilemmas, you may use this game
text to search your dilemma pile for a dilemma that costs 0.*

A dilemma being placed beneath a mission for any reason is being overcome. Each
dilemma beneath a mission is an overcome dilemma. *For example, Cave-In reads:
Consume: 1. (Your opponent places the top card of his or her dilemma pile face up
beneath this mission.) That top card is being overcome as it is placed beneath
the mission, and is an overcome dilemma once there.*

## discarding

Discard piles are kept face-up, and cards are discarded one at a time so all
players can see what is being discarded. The order of your discard pile is
irrelevant.

Any player may examine any discard pile at any time. Whenever you take a card
from your discard pile, you must reveal that card to all players so they can
verify that the correct card was taken.

When a card leaves play for any reason, any cards played on that card are placed
in their owners' discard piles. Exception: Any dilemmas are returned face up to
the bottom of their owners' dilemma pile instead.

## equipped with

Some game text requires a personnel to be "equipped with" a specified equipment.
If your unstopped personnel is present with your equipment, he or she is
"equipped with" that equipment.

## examine

When an effect says a player should examine a card, that card is shown only to
that player. He or she may look at the entire card. If you are not told where to
place the card afterward, return it to where it came from.

## exchange

When one card is exchanged for another, any effects that were about to happen to
the original card are transferred to the replacement. *For example: your Worf,
First Officer ("While this personnel is facing a dilemma, you may … to exchange a
[TNG] personnel you own present with a [TNG] personnel … from your hand.") is
attempting a mission. A dilemma selects your [TNG] personnel present (and will
later stop that personnel), then you decide to use Worf to exchange that
personnel. The new personnel joins the mission attempt in progress, and is
stopped as the original personnel would have been.*

## infinite loops

If a player intends to perform a repeatable series of actions many times and can
demonstrate his or her ability to do so, and that player's opponent does not have
any responses that would affect those actions, then that player may adjust the
game state to reflect his or her desired and possible outcome as a result of
repeating that series of actions any number of times. *For example: If you have a
series of actions that allows you to examine the top two cards of an opponent's
dilemma pile and then choose to shuffle it and that series is infinitely
repeatable, you may state that you intend to perform those actions an infinite
number of times. If your opponent has no response actions that would affect the
loop, take your dilemma pile (setting aside any third copies of dilemmas) and
give it to your opponent. He or she chooses two dilemmas, shuffles the rest
(including any previously set-aside copies) and places the two chosen dilemmas on
top of your dilemma pile.*

## instead

"Instead" dilemma effects do not prevent the effect they replace; replaced
dilemma effects still occurred in the past. Only the word "prevent" will prevent
a dilemma effect from occurring in the first place. *For example, "Stop a
personnel. If that personnel has Leadership, kill him or her instead." The
personnel being killed "instead" does not prevent that personnel from having been
previously stopped.*

## lose points

If an effect causes a player to lose points when that player has no points, that
player does not lose any points. If the cost to play a card or perform an action
requires the player to lose points and that player does not have any points, that
card cannot be played or that action cannot be taken.

<!-- page 18 -->

## modifications

If multiple effects attempt to replace, modify, or remove a characteristic of a
card, they are applied in the following order (if there are multiple modifiers of
the same category, the player whose turn it is determines their order):

1) Choose: Any free choices presented by cards are made. *For example: deciding
which set of requirements on a mission with game text that gives alternate
requirements is being used.*

2) Replace: Any effects that use some form of the verbs "to replace" or "to
become" occur.

3) Modify: Any effects that add, increase, or reduce an aspect of a card by a
specific amount occur.

4) Lose: Any effects that completely remove an aspect of a card without regard to
amount occur.

5) Zero: Any number that is less than zero becomes zero.

## naming cards

When you name a card, you do so by card title only, not subtitle.

When an ability requires a player to name a card title within particular
criteria, that ability will affect only personae of the named card that meet the
criteria. *For Example: A Few Minor Difficulties reads "When you play this event,
name a non-[Voy] ship. Each player ignores that ship's game text." If a player
were to name the card title Olarra, he or she would only ignore the gametext of a
non-[Voy] Olarra.*

## play and place

When you "place" a card somewhere in play (or "exchange" or "replace" a card in
play with another card), you have not "played" that card. *For example, a unique
personnel in your deck reads: When you play this personnel, you may download a
Punishment card. You play a card which reads: Download a unique personnel, then
place him or her on your Cardassia Prime. You cannot download a Punishment card
when you place that personnel on Cardassia Prime.*

Some game text instructs you to place cards on an event in your core. They are
always placed face up on the event. If a card you place on an event comes from
anywhere under a player's command, it remains under that player's command;
otherwise, it is under no player's command. *For example, Engage Cloak reads:
Order – If there is no ship on this event, place your staffed ship that has a
Cloaking Device on this event. The ship and the personnel aboard it remain under
your command. For example, Trial of Faith reads: Order – Examine an opponent's
discard pile. Place one of those cards on this event. The chosen card does not
come under any player's command when it is placed on Trial of Faith.*

## playing a card

Below is the timing sequence for playing a card during a player's Play and Draw
Cards segment and response actions involving that card.

1. Active Player (the player whose turn it is) examines the information available
   to him or her and determines that he or she can pay the costs to play a card in
   his or her hand and, if the card is to enter play, verifies that there is a
   location at which the card may do so.
2. The Active Player announces his or her intention to play said card, reveals the
   card from his or her hand, and declares where it will enter play using
   gametext that allows the play. Any gametext on the card required to play it to
   its destination activates.
3. The card's cost-related gametext activates. Cost-related response actions
   process beginning with the Active Player.
4. Active Player pays all costs of playing the card.
5. Mandatory "prevent" response actions process beginning with the Active Player.
6. Optional "prevent" response actions process beginning with the Active Player.
7. If the playing of the card has not been prevented, that card enters play at the
   location specified by the Active Player, it becomes subject to any applicable
   conditional effects, its non-cost-related gametext becomes active and the
   Active Player now commands the card.
8. Mandatory "When . . . (play/plays/played)" response actions process beginning
   with the Active Player.
9. Optional "When . . . (play/plays/played)" response actions process beginning
   with the Active Player.
10. Once all response actions are complete, the Active Player may continue his or
    her Play and Draw Cards segment.

While a player is resolving game text on a card activated by playing that same
card, that game text may not reference the characteristics of the played card for
any purpose, unless specifically stated otherwise.

*For Example: K'Tal, Senior Council Member reads "When you play a Chancellor or
High Council Member at this mission, you may download an event." You may not
trigger K'Tal's gametext when you play him, even though he is a High Council
Member, because he does not specifically state "this personnel" in his ability.*

*For Example: Evek, Agent of Cardassian Justice reads "When you play*
<!-- page 19 -->
*this personnel, if you command six [Car] personnel, you may reveal the top three
cards of an opponent's deck." You may not count Evek as one of your [Car]
personnel while his text is still being resolved.*

## remove from the game

When game text instructs you to remove a card from the game, do not place it in
any discard pile. Instead, separate it from all other cards in the game. Return
the card to its owner's deck after the game has ended.

Any player may examine any cards that have been removed from the game at any
time.

## replace

When one card replaces another, any effects that were about to happen to the
original card are transferred to the replacement. *For example: your Borg Queen,
Guardian of the Hive ("While this personnel is facing a dilemma., you may replace
your Drone present with a Drone from your discard pile.") is attempting a
mission. A dilemma selects your Drone present (and will later kill that Drone),
then you decide to use the Borg Queen to replace that Drone. The new replacement
Drone joins the mission attempt in progress, and is still killed as the original
Drone would have been.*

## reveal

When an effect says to reveal a card, that card is shown to all players. They may
look at the entire card. If you are not told where to place the card afterward,
return it to where it came from.

## selections

Any game text that includes the words "select" or "choose" is a selection.

When a card is to be chosen by random selection, shuffle together all eligible
cards, hold them so the faces of the cards cannot be seen, and let your opponent
indicate a single card, at random, from this group.

When game text allows an opponent to choose a card, that opponent may fully
examine each eligible card before making the selection.

When a card specifies a selection that is not normally made by any player and
there is a tie ("most Cunning personnel," "personnel with the highest cost,"
etc.) the player who commands the card specifying the selection chooses from each
eligible possibility.

## skills

Whenever "all skills" are added to or subtracted from a card, all levels of those
skills are added or subtracted.

A personnel "uses" one of his or her skills:

- When meeting a mission or dilemma requirement (these requirements are always in
  bold), or
- When you use game text on one of your cards that references that skill. This
  includes, but is not limited to, referencing a skill to satisfy a play
  requirement, gaining a skill that a personnel already has or gaining a skill
  from another personnel.

If game text requires you pay a cost to use a personnel's skills (as a whole),
you may use any number of that personnel's skills at the time you pay the cost.
*For example: While a Diplomacy personnel is at this mission, that personnel's
owner must discard a card from hand to use his or her skills. If you are
completing a mission and have a Diplomacy personnel who could provide three
skills in that mission's requirements, you need only discard one card from hand to
use all three of those skills.*

When a personnel gains all skills from another personnel, all levels of those
skills are gained. However, when a personnel gains a single skill from another
personnel, only 1 level of the skill is gained. *For example: When your personnel
is facing a dilemma, he or she gains all skills and attributes on a personnel in
your discard pile. If the skills of the personnel in the discard pile include 2
Diplomacy, the other personnel gains 2 Diplomacy. For example: Order – This
personnel gains one skill from one of your captives. If this personnel is gaining
Diplomacy from a personnel who has 2 Diplomacy, he or she gains only 1
Diplomacy.*

When a skill is lost (subtracted), only one level of that skill is lost. However,
when all of a personnel's skills are lost (subtracted), all levels of those
skills are lost.

## species

Some personnel are members of species which share the same name as an
affiliation. Affiliations are always referred to by an icon. Any use of the
actual word (Klingon, Romulan, etc.) is a reference to species. *For example: if
a card required you to command a [Kli] personnel, a [Fed] Worf would not meet
this requirement, despite being Klingon. If a card required you to command a
Romulan personnel, a [Rom] Reman would not meet this requirement, despite being a
[Rom] personnel.*

Two personnel are the same species if their species is an exact match. *For
example: two Alien personnel are the same species, while a Human personnel and a
Betazoid/Human personnel are different species.*

When a card becomes a different species, it loses its previous species.

## stopped

Stopped cards do not prevent you from taking actions with other unstopped cards
with which they are present. *For example: you may begin an engagement involving
your ship that has stopped personnel aboard, as long as you have enough unstopped
personnel aboard to meet any staffing or other requirements. You may attempt a
planet mission using your unstopped personnel on that planet; any stopped
personnel on the planet are ignored.*

When your card is stopped, you do not "lose command" of that card. However, you
cannot use stopped cards to satisfy a command
<!-- page 20 -->
requirement. *For example, Annexation Drone reads: When you lose command of this
personnel, remove it from the game. If Annexation Drone were to be stopped, it
would not be removed from the game. However, you could not play a card that
required you to command a Borg if Annexation Drone was your only Borg.*

Though stopped personnel cannot staff ships, they are still carried along with
that ship if it moves (using unstopped personnel to satisfy staffing
requirements).

You cannot use the game text, attributes, icons, or any other characteristic of
any of your personnel or ships that are stopped. (Though you must still obey the
uniqueness rule for any of your stopped unique cards.) *For example: "To play
this interrupt, you must command an Anthropology personnel." You cannot play this
interrupt if every Anthropology personnel you command is stopped.*

You cannot use another card's text to affect one of your stopped personnel or
ships. *For example: When your personnel is about to be killed, randomly select
another of your personnel present to be killed instead. This game text does not
allow your stopped personnel to be killed instead of the personnel about to be
killed.*

If possible, your stopped cards are included and considered by effects from your
opponent's cards on his or her turn. During your turn, effects from your
opponent's cards may not include or consider your stopped personnel.

Equipment does not become stopped, even if all the personnel present with that
equipment are stopped.

## this mission

When these words are used in the game text of a personnel or a ship, they refer to
the mission where that personnel or ship is currently located.

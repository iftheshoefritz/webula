// Self-Replicating Roadblock (#1789): "Plays on your non-headquarters mission (limit one per mission). When
// you play this event, name a dilemma or an event. The named event cannot be played on this mission. When
// the named dilemma is revealed here, return it to its owner's dilemma pile."
//
// The table asks for the name after any move of the event onto a mission card (`roadblockToNameOf`), and
// keeps it on the placed card as `named`. In a bot game the bot reads the dilemmas named at the attempted
// mission (`namedAtMission`): its search plays them as returning to the pile with no effect, and the Resolve
// of a revealed named dilemma returns it to the bottom of the dilemma pile (`roadblockReturnOf`). The table
// does not stop a play of a named event, nor enforce "limit one per mission" or "non-headquarters".
//
// "When you name a card, you do so by card title only, not subtitle." (Glossary › naming cards, p. 18): the
// names offered, the Roadblock test and the return compare card titles (`rowCardTitleOf`, #1974), in any case.

import { cardDisplayName } from '../../../lib/cardCount';
import { rowCardTitleOf, rowPrintedCardTitleOf } from '../../../lib/cardTitle';
import type { LogEntry } from './gameLog';
import type { CardInstance, TableState } from './tableReducer';

export const ROADBLOCK_TITLE = 'Self-Replicating Roadblock';

/** The card title of a card in its printed case, for display: "Self-Replicating Roadblock". */
const titleOf = (card: CardInstance['card'] | undefined): string => (card ? rowPrintedCardTitleOf(card) : '');

/** The card title of a card, lowercased, for a comparison. */
const titleKeyOf = (card: CardInstance['card'] | undefined): string => (card ? rowCardTitleOf(card) : '');

/** Whether a card is Self-Replicating Roadblock, any version. */
export const isRoadblock = (card: CardInstance['card'] | undefined): boolean => titleKeyOf(card) === ROADBLOCK_TITLE.toLowerCase();

/**
 * The Self-Replicating Roadblock the last log entry placed on a mission card and that names nothing yet,
 * or null: the page then asks for its name. Derived from the table and the log, so a reload and an undo
 * agree.
 */
export function roadblockToNameOf(table: TableState, log: LogEntry[]): { id: string; missionIndex: number } | null {
  const last = log[log.length - 1];
  if (last?.kind !== 'move') return null;
  const move = last.moves[last.moves.length - 1];
  if (!move || move.to.kind !== 'on' || move.named !== undefined) return null;
  const to = move.to.card;
  for (let i = 0; i < table.missions.length; i++) {
    const mission = table.missions[i].mission;
    if (!mission || cardDisplayName(mission.card) !== to) continue;
    const placed = mission.placedOn ?? [];
    const card = placed[placed.length - 1];
    if (card && isRoadblock(card.card) && !card.named && move.cards.includes(cardDisplayName(card.card))) return { id: card.id, missionIndex: i };
  }
  return null;
}

/** The titles the Self-Replicating Roadblocks placed on the mission card of slot `missionIndex` named, each once. */
export function namedAtMission(table: TableState, missionIndex: number): string[] {
  const placed = table.missions[missionIndex]?.mission?.placedOn ?? [];
  return Array.from(new Set(placed.flatMap((c) => (isRoadblock(c.card) && c.named ? [c.named] : []))));
}

/**
 * The card whose name returns the revealed top card of a bot attempt's stack to the dilemma pile, or null:
 * "Self-Replicating Roadblock" when a Roadblock on the attempted mission's card named the top card's title.
 * Null outside a bot game's `'face'` or with no face-up top card.
 */
export function roadblockReturnOf(table: TableState): string | null {
  const { attempt } = table;
  const top = table.dilemmaStack[0];
  if (!attempt || attempt.botSpend === undefined || attempt.phase !== 'face' || !top || top.face !== 'up') return null;
  const title = titleKeyOf(top.card);
  return title && namedAtMission(table, attempt.missionIndex).some((n) => n.toLowerCase() === title) ? ROADBLOCK_TITLE : null;
}

/**
 * The titles Self-Replicating Roadblock may name: `first`, the dilemmas of the bot's pile in a bot game, then
 * every other dilemma title of `allCards`, then every event title. Each once.
 */
export function nameableCardTitles(first: string[], allCards: ReadonlyArray<CardInstance['card']>): string[] {
  const of = (type: string) =>
    Array.from(new Set(allCards.filter((c) => c?.type === type).map(titleOf).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return Array.from(new Set([...first, ...of('dilemma'), ...of('event')]));
}

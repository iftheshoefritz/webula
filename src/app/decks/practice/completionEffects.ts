// The effects of completing a mission on the player's own cards (#1757): what each mission's "When you
// complete this mission" does, the cards each one may pick, and the actions a choice dispatches. The page
// dispatches one `batch`, the `setMissionCompleted` first and then the effect's actions, so the
// completion and its effect are one log entry and one undo. No React and no reducer state: it reads a
// `TableState` and returns plain actions.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { hqRowOf, reportsToMatches } from '../../../lib/hqPlayability';
import { missionAt, personnel } from '../../../lib/tableView';
import type { GameAction } from './gameLog';
import { attemptingCards, findInstanceAnywhere, type CardInstance, type TableAction, type TableState } from './tableReducer';
import { tableViewOf } from './tableView';

export type CompletionEffectKind = 'download' | 'discardToHq' | 'discardOrDestroy' | 'toDeckBottom' | 'flip' | 'score';

export interface CompletionEffect {
  title: string;
  /** The short name the panel shows: "Saturn". */
  label: string;
  kind: CompletionEffectKind;
  /** The text of the effect, as the card prints it. */
  text: string;
  /** The title a download fetches. */
  download?: string;
  /** The largest total printed cost of the picks. */
  cap?: number;
  /** The smallest printed cost of a personnel that may be discarded instead of the ships. */
  min?: number;
  /** The points a score scores (#1828, Cheron), the step of the "when you play" `score` kind. */
  points?: number;
  /** The fewest different species involved for a score. */
  minSpecies?: number;
}

const EFFECTS: CompletionEffect[] = [
  {
    title: 'Saturn Continue Invasion',
    label: 'Saturn',
    kind: 'download',
    download: 'Population 9 Billion - All Borg',
    text: 'When you complete this mission, you may download Population 9 Billion - All Borg.',
  },
  {
    title: 'Starbase 718 Investigate Cryosatellite',
    label: 'Starbase 718',
    kind: 'discardToHq',
    cap: 6,
    text:
      'When your personnel complete this mission, you may place any number of unique personnel with a total cost of 6 or less from your discard pile at your headquarters mission where they could be played.',
  },
  {
    title: 'Bassen Rift Interdict Genocidal Praetor',
    label: 'Bassen Rift',
    kind: 'discardOrDestroy',
    min: 4,
    text:
      "When you complete this mission, each ship here is destroyed unless you place a personnel involved who costs 4 or more in their owner's discard pile.",
  },
  {
    title: 'Aldea Aid Legendary Civilization',
    label: 'Aldea',
    kind: 'toDeckBottom',
    cap: 12,
    text: "When you complete this mission, place up to 12 total cost of your personnel involved beneath their owners' decks.",
  },
  {
    title: 'Cheron Aid Planetary Recovery',
    label: 'Cheron',
    kind: 'score',
    points: 5,
    minSpecies: 4,
    text: 'When you complete this mission, if four or more different species were involved, score 5 points.',
  },
  {
    title: 'Gateway Flee in Terror',
    label: 'Gateway',
    kind: 'flip',
    text: 'When you complete this mission, flip it over.',
  },
];

export const COMPLETION_EFFECTS: ReadonlyMap<string, CompletionEffect> = new Map(EFFECTS.map((e) => [e.title, e]));

const titleOf = (card: CardInstance['card'] | null | undefined): string => (card ? cardTitleOf(String(cardDisplayName(card) ?? '')) : '');

/** The printed cost of a card, 0 when it has none. */
export const costOf = (c: CardInstance): number => Number(c.card?.cost) || 0;

/** The effect of completing the mission of slot `missionIndex`, or undefined for a mission with none. */
export function completionEffectOf(table: TableState, missionIndex: number): CompletionEffect | undefined {
  return COMPLETION_EFFECTS.get(titleOf(table.missions[missionIndex]?.mission?.card));
}

const isPersonnel = (c: CardInstance): boolean => c.card?.type === 'personnel';

/**
 * The personnel involved at slot `missionIndex` (#1757): the unstopped personnel of the attempt in progress
 * there, or else of the last attempt there, those still in an away team or a crew. None when no attempt
 * was made there.
 */
export function involvedPersonnel(table: TableState, missionIndex: number): CardInstance[] {
  const { attempt } = table;
  const view = tableViewOf(table);
  const instances = (ids: string[]): CardInstance[] => ids.flatMap((id) => findInstanceAnywhere(table, id)?.instance ?? []);
  if (attempt && attempt.missionIndex === missionIndex) {
    // The attempting row (`attemptingCards`): the away team at a planet, the attempting ship's crew at a space mission.
    const type = missionAt(view, missionIndex)?.type;
    const { shipId } = attempt;
    if (shipId === undefined ? type !== 'p' : type !== 's') return [];
    const row =
      shipId === undefined
        ? personnel(view, { unstopped: true, at: missionIndex, where: (p) => p.shipId === undefined })
        : personnel(view, { unstopped: true, at: missionIndex, aboard: shipId });
    return instances(row.map((p) => p.id));
  }
  // Those still in an away team or a crew, in the order recorded.
  const onTable = new Set(personnel(view, { unstopped: false }).map((p) => p.id));
  return instances((table.missions[missionIndex]?.involved ?? []).filter((id) => onTable.has(id)));
}

/**
 * Cheron (#1828): the different species of the personnel involved, each personnel's whole `species` value
 * lowercased, so a Human/Vulcan is a species of its own, neither Human nor Vulcan. A personnel with no
 * species counts none.
 */
export function involvedSpecies(table: TableState, missionIndex: number): string[] {
  const species = involvedPersonnel(table, missionIndex).map((c) => String(c.card?.species ?? '').trim().toLowerCase());
  return [...new Set(species.filter(Boolean))];
}

/** Cheron: whether enough different species were involved to score. */
export const scoreHolds = (table: TableState, missionIndex: number, effect: CompletionEffect): boolean =>
  involvedSpecies(table, missionIndex).length >= (effect.minSpecies ?? 0);

/** Cheron: the score of a completion whose species check holds. */
export const scoreActions = (effect: CompletionEffect): TableAction[] => [{ type: 'adjustScore', delta: effect.points ?? 0 }];

/** Saturn: the copies of the download's title in the draw deck. */
export const downloadCandidates = (table: TableState, effect: CompletionEffect): CardInstance[] =>
  table.drawDeck.filter((c) => titleOf(c.card) === effect.download);

/**
 * The titles of the personnel the player has on the table: every away team, every crew and the brig. The
 * selectors never read the brig, so its personnel join by hand.
 */
function titlesOnTable(table: TableState): Set<string> {
  const view = tableViewOf(table);
  const brig = view.brig.filter((c) => c.type === 'personnel');
  return new Set([...personnel(view, { unstopped: false }), ...brig].map((c) => c.title));
}

/**
 * Starbase 718: the unique personnel of the discard pile, those removed from the game left out, and those
 * that share a title with a personnel on the table. Two copies of one title offer the first.
 */
export function discardCandidates(table: TableState): CardInstance[] {
  const taken = titlesOnTable(table);
  const seen = new Set<string>();
  return table.discard.filter((c) => {
    const title = titleOf(c.card);
    if (!isPersonnel(c) || c.removedFromGame || String(c.card?.unique ?? '').toLowerCase() !== 'y') return false;
    if (taken.has(title) || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
}

/** The headquarters slots where every card of `picks` could be played (`reportsToMatches`). */
export function hqSlotsFor(table: TableState, picks: CardInstance[]): number[] {
  return table.missions.flatMap((slot, i) => {
    const card = slot.mission?.card;
    if (String(card?.missiontype ?? '').toLowerCase() !== 'h') return [];
    const match = titleOf(card).toLowerCase();
    return picks.every((p) => p.card && reportsToMatches(hqRowOf(p.card), match)) ? [i] : [];
  });
}

/** Bassen Rift: the personnel involved who cost `min` or more. */
export const discardableInvolved = (table: TableState, missionIndex: number, effect: CompletionEffect): CardInstance[] =>
  involvedPersonnel(table, missionIndex).filter((c) => costOf(c) >= (effect.min ?? 0));

/** The total printed cost of `cards`. */
export const totalCost = (cards: CardInstance[]): number => cards.reduce((sum, c) => sum + costOf(c), 0);

const complete = (missionIndex: number): TableAction => ({ type: 'setMissionCompleted', missionIndex, completed: true });

/** The batch of a completion and its effect's `actions`. */
export const completionBatch = (missionIndex: number, actions: TableAction[]): GameAction => ({
  type: 'batch',
  actions: [complete(missionIndex), ...actions],
});

/** Saturn: download `id` from the draw deck into the hand, then shuffle the draw deck. */
export const downloadActions = (id: string): TableAction[] => [
  { type: 'move', id, to: 'hand' },
  { type: 'shuffle', location: 'drawDeck' },
];

/** Starbase 718: place `ids` of the discard pile in the away team of the headquarters slot `hq`. */
export const placeAtHqActions = (ids: string[], hq: number): TableAction[] =>
  ids.map((id) => ({ type: 'move', id, to: { zone: 'missionPile', missionIndex: hq, pile: 'awayTeam' } }));

/** Bassen Rift, a personnel picked: it goes to the discard pile. */
export const discardActions = (ids: string[]): TableAction[] => ids.map((id) => ({ type: 'move', id, to: 'discard' }));

/** Bassen Rift, no one picked: every ship of the slot's ship row is destroyed, its crew and placed cards with it. */
export const destroyShipsActions = (table: TableState, missionIndex: number): TableAction[] =>
  discardActions((table.missions[missionIndex]?.ships ?? []).map((s) => s.id));

/** Aldea: `ids` go beneath the draw deck, in the order picked. */
export const toDeckBottomActions = (ids: string[]): TableAction[] =>
  ids.map((id) => ({ type: 'move', id, to: 'drawDeck', position: 'bottom' }));

/** Gateway: the completion flips the mission, unless it already shows its back. */
export function flipActions(table: TableState, missionIndex: number): TableAction[] {
  const mission = table.missions[missionIndex]?.mission;
  return mission && !mission.flipped ? [{ type: 'flipMission', id: mission.id }] : [];
}

// The effects of completing a mission on the player's own cards (#1757): what each mission's "When you
// complete this mission" does (the `onComplete` abilities of the mission registry, #1907), the cards each
// one may pick, and the actions a choice dispatches. The page dispatches one `batch`, the
// `setMissionCompleted` first and then the effect's actions, so the completion and its effect are one log
// entry and one undo. No React and no reducer state: it reads a
// `TableState` and returns plain actions.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { hqRowOf, reportsToMatches } from '../../../lib/hqPlayability';
import { AFFILIATION_ABBREVIATIONS } from '../../../lib/missionRequirements';
import { abilityOf, missionModelOfCard, missionModelsWith, type CompletionCondition, type CompletionWatch, type MissionCompletion } from '../../../lib/missionModels';
import { missionAt, personnel } from '../../../lib/tableView';
import type { GameAction } from './gameLog';
import { attemptingCards, findInstanceAnywhere, type CardInstance, type TableAction, type TableState } from './tableReducer';
import { tableViewOf } from './tableView';

export type CompletionEffectKind = MissionCompletion['kind'];

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
  /** The condition of a score (#1908); Cheron's is `species`. */
  condition?: CompletionCondition;
  /** The part of a score the table does not model, an opponent's score. */
  notChecked?: string;
  /** The missions of the player whose completion fires it, when it is not this mission's own (Earth). */
  watches?: CompletionWatch;
}

// The completion of each row of the mission registry with an `onComplete` ability (#1907), in the shape the
// panel and the log read.
function completionEffect(title: string, label: string, text: string, completion: MissionCompletion, watches?: CompletionWatch): CompletionEffect {
  const base = { title, label, text, kind: completion.kind, ...(watches ? { watches } : {}) };
  switch (completion.kind) {
    case 'download': {
      const [step] = completion.steps;
      return { ...base, download: step.of.kind === 'test' ? step.of.test[0]?.titles?.[0] : undefined };
    }
    case 'discardToHq':
    case 'toDeckBottom':
      return { ...base, cap: completion.cap };
    case 'discardOrDestroy':
      return { ...base, min: completion.min };
    case 'score':
      return {
        ...base,
        points: completion.steps[0].points,
        condition: completion.condition,
        ...(completion.condition.kind === 'species' ? { minSpecies: completion.condition.min } : {}),
        ...(completion.notChecked ? { notChecked: completion.notChecked } : {}),
      };
    case 'flip':
      return base;
  }
}

const EFFECTS: CompletionEffect[] = missionModelsWith('onComplete').map(({ model, ability }) =>
  completionEffect(model.title, model.label, ability.text, ability.completion, ability.watches)
);

export const COMPLETION_EFFECTS: ReadonlyMap<string, CompletionEffect> = new Map(EFFECTS.map((e) => [e.title, e]));

const titleOf = (card: CardInstance['card'] | null | undefined): string => (card ? cardTitleOf(String(cardDisplayName(card) ?? '')) : '');

/** The printed cost of a card, 0 when it has none. */
export const costOf = (c: CardInstance): number => Number(c.card?.cost) || 0;

const missionTypeOf = (table: TableState, missionIndex: number): string =>
  String(table.missions[missionIndex]?.mission?.card?.missiontype ?? '').toLowerCase().charAt(0);

/**
 * The effect of completing the mission of slot `missionIndex`, or undefined for a mission with none: its own,
 * or else that of another of the player's missions that watches it (#1908, Earth Humanity's Home watches every
 * space mission).
 */
export function completionEffectOf(table: TableState, missionIndex: number): CompletionEffect | undefined {
  const own = COMPLETION_EFFECTS.get(titleOf(table.missions[missionIndex]?.mission?.card));
  if (own && !own.watches) return own;
  const type = missionTypeOf(table, missionIndex);
  for (const [i, slot] of table.missions.entries()) {
    if (i === missionIndex) continue;
    const watches = abilityOf(missionModelOfCard(slot.mission?.card), 'onComplete')?.watches;
    if (watches && watches.missionType === type) return COMPLETION_EFFECTS.get(titleOf(slot.mission?.card));
  }
  return undefined;
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

// The number of a skill in the skills of `cards`, "2 Physics Science" counting Physics twice.
function skillCount(cards: CardInstance[], skill: string): number {
  let sum = 0;
  for (const c of cards) {
    for (const [, count, name] of String(c.card?.skills ?? '').toLowerCase().matchAll(/(?:(\d+)\s+)?([a-z]+)/g)) {
      if (name === skill) sum += Number(count) || 1;
    }
  }
  return sum;
}

// The icons of a personnel, its affiliation's and its card's: "[kli]", "[maq]".
function iconsOfPersonnel(c: CardInstance): string[] {
  const affiliation = String(c.card?.affiliation ?? '').toLowerCase().trim();
  const own = String(c.card?.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [];
  const icon = AFFILIATION_ABBREVIATIONS[affiliation];
  return [...(icon ? [icon] : []), ...(affiliation.match(/\[[a-z0-9]+\]/g) ?? []), ...own];
}

/** Every personnel of the player at slot `missionIndex`, stopped ones too: the away team and the crews. */
export function personnelHere(table: TableState, missionIndex: number): CardInstance[] {
  const slot = table.missions[missionIndex];
  if (!slot) return [];
  return [...slot.awayTeam, ...slot.ships.flatMap((s) => s.crew ?? [])].filter(isPersonnel);
}

/** Whether the condition of a completion's score holds (#1908); Cheron's counts the species involved. */
export function scoreHolds(table: TableState, missionIndex: number, effect: CompletionEffect): boolean {
  const condition: CompletionCondition = effect.condition ?? { kind: 'species', min: effect.minSpecies ?? 0 };
  switch (condition.kind) {
    case 'species':
      return involvedSpecies(table, missionIndex).length >= condition.min;
    case 'involvedSkills': {
      const involved = involvedPersonnel(table, missionIndex);
      return condition.anyOf.some(({ skill, count }) => skillCount(involved, skill) >= count);
    }
    case 'involvedLack': {
      const involved = involvedPersonnel(table, missionIndex);
      return involved.length > 0 && skillCount(involved, condition.skill) === 0;
    }
    case 'hereOneAffiliation': {
      const here = personnelHere(table, missionIndex);
      return here.length > 0 && new Set(here.map((c) => String(c.card?.affiliation ?? '').toLowerCase())).size === 1;
    }
    case 'hereAll': {
      const here = personnelHere(table, missionIndex);
      return here.length > 0 && here.every((c) => iconsOfPersonnel(c).includes(condition.icon));
    }
    case 'hereAtLeast':
      return personnelHere(table, missionIndex).filter((c) => iconsOfPersonnel(c).includes(condition.icon)).length >= condition.count;
    case 'noOtherCompleted':
      return !table.missions.some(
        (slot, i) => i !== missionIndex && slot.completed && (condition.missionType === undefined || missionTypeOf(table, i) === condition.missionType)
      );
  }
}

const capitalized = (skill: string): string => skill.charAt(0).toUpperCase() + skill.slice(1);
const skillText = ({ skill, count }: { skill: string; count: number }): string => `${count > 1 ? `${count} ` : ''}${capitalized(skill)}`;

/** The words of a score's condition (#1908), for the panel's condition line: "the personnel completing it have 2 Physics or 2 Science". */
export function completionConditionText(condition: CompletionCondition): string {
  switch (condition.kind) {
    case 'species':
      return `${condition.min} or more different species involved`;
    case 'involvedSkills':
      return `the personnel completing it have ${condition.anyOf.map(skillText).join(' or ')}`;
    case 'involvedLack':
      return `no personnel completing it has ${capitalized(condition.skill)}`;
    case 'hereOneAffiliation':
      return 'each of your personnel here is of the same affiliation';
    case 'hereAll':
      return `each of your personnel here is a ${condition.icon.replace(/\[(.)/, (_, c: string) => `[${c.toUpperCase()}`)} personnel`;
    case 'hereAtLeast':
      return `you command ${condition.count} ${condition.icon.replace(/\[(.)/, (_, c: string) => `[${c.toUpperCase()}`)} personnel here`;
    case 'noOtherCompleted':
      return `you have completed no other ${condition.missionType === 's' ? 'space mission' : 'mission'}`;
  }
}

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

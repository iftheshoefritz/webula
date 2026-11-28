// The attempt abilities the table offers (#1835): the rows of `src/lib/attemptAbilities` of each unstopped personnel
// of the attempting group (the away team at a planet mission, the crew of the attempting ship at a space mission),
// while the attempted mission passes the row's condition and the row's use limit allows another use this turn. Derived
// from the table and the log, never stored. The attempt strip shows one button each (`attempt-ability`).
//
// Since #1956 a row of source `core` is offered from a card of its title in the core, once per unstopped personnel of
// the attempting group, each offer with its own `targetId`; and a `facingDilemma` row only while a dilemma is faced
// (`facedDilemmaOf`).

import { cardDisplayName } from '../../../lib/cardCount';
import { attemptAbilitiesOfTitle, sourceOf, windowOf, type AttemptAbility, type ModifyStep } from '../../../lib/attemptAbilities';
import { missions } from '../../../lib/tableView';
import { abilityUsable, type LogEntry } from './gameLog';
import { facedDilemmaOf, type CardInstance, type TableState } from './tableReducer';
import { tableViewOf } from './tableView';

/** One offer: the card, its ability, and the card the ability's change goes to. */
export interface AttemptAbilityOffer {
  id: string;
  name: string;
  ability: AttemptAbility;
  /** The card the `modify` step changes: the card itself, the ship it is aboard, or the chosen personnel. */
  targetId: string;
  targetName: string;
}

/** The attempting group: the personnel of the away team, or of the attempting ship's crew, and that ship. */
export function attemptingGroupOf(table: TableState): { cards: CardInstance[]; ship?: CardInstance } | null {
  const attempt = table.attempt;
  if (!attempt) return null;
  const slot = table.missions[attempt.missionIndex];
  if (!slot) return null;
  if (attempt.shipId !== undefined) {
    const ship = slot.ships.find((s) => s.id === attempt.shipId);
    return ship ? { cards: ship.crew ?? [], ship } : null;
  }
  return { cards: slot.awayTeam };
}

const nameOf = (c: CardInstance): string => (c.card ? cardDisplayName(c.card) : c.id);

/** The step of an ability that changes numbers, if any. */
export const modifyStepOf = (a: AttemptAbility): ModifyStep | undefined => a.steps.find((s): s is ModifyStep => s.kind === 'modify');

/**
 * The offers of the table (#1835): each ability of each unstopped personnel of the attempting group whose mission
 * condition holds and whose limit allows another use this turn, in the group's order, then the abilities of the
 * core's cards (#1956), one per chosen personnel. An ability that changes the ship it is aboard needs a ship: at a
 * planet mission it is not offered. A `facingDilemma` ability needs a faced dilemma.
 */
export function attemptAbilitiesOf(state: { table: TableState; log: LogEntry[] }): AttemptAbilityOffer[] {
  const { table, log } = state;
  const group = attemptingGroupOf(table);
  if (!group) return [];
  const missionIndex = table.attempt!.missionIndex;
  const facing = !!facedDilemmaOf(table);
  let view: ReturnType<typeof tableViewOf> | null = null;
  const missionPasses = (a: AttemptAbility) => !a.mission || missions((view ??= tableViewOf(table)), { ...a.mission, index: missionIndex }).length > 0;
  const open = (source: CardInstance, a: AttemptAbility) =>
    (windowOf(a) === 'attempting' || facing) &&
    missionPasses(a) &&
    abilityUsable(log, table.turn, { kind: 'attemptAbility', id: source.id, index: a.index }, a.limit);
  const personnel = group.cards.filter((c) => !c.stopped && !!c.card && String(c.card.type ?? '').toLowerCase() === 'personnel');
  const offers: AttemptAbilityOffer[] = [];
  const offer = (card: CardInstance, ability: AttemptAbility, target: CardInstance) =>
    offers.push({ id: card.id, name: nameOf(card), ability, targetId: target.id, targetName: nameOf(target) });
  for (const card of personnel) {
    for (const ability of attemptAbilitiesOfTitle(nameOf(card))) {
      if (sourceOf(ability) !== 'self') continue;
      const step = modifyStepOf(ability);
      const target = step?.target === 'itsShip' ? group.ship : card;
      if (!target || !open(card, ability)) continue;
      offer(card, ability, target);
    }
  }
  for (const card of table.core) {
    if (!card.card) continue;
    for (const ability of attemptAbilitiesOfTitle(nameOf(card))) {
      if (sourceOf(ability) !== 'core' || !open(card, ability)) continue;
      for (const target of personnel) offer(card, ability, target);
    }
  }
  return offers;
}

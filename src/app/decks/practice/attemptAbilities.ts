// The attempt abilities the table offers (#1835): the rows of `src/lib/attemptAbilities` of each unstopped personnel
// of the attempting group (the away team at a planet mission, the crew of the attempting ship at a space mission),
// while the attempted mission passes the row's condition and the row's use limit allows another use this turn. Derived
// from the table and the log, never stored. The attempt strip shows one button each (`attempt-ability`).

import { cardDisplayName } from '../../../lib/cardCount';
import { attemptAbilitiesOfTitle, type AttemptAbility, type ModifyStep } from '../../../lib/attemptAbilities';
import { missions } from '../../../lib/tableView';
import { abilityUsable, type LogEntry } from './gameLog';
import type { CardInstance, TableState } from './tableReducer';
import { tableViewOf } from './tableView';

/** One offer: the card, its ability, and the card the ability's change goes to. */
export interface AttemptAbilityOffer {
  id: string;
  name: string;
  ability: AttemptAbility;
  /** The card the `modify` step changes: the card itself, or the ship it is aboard. */
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
 * condition holds and whose limit allows another use this turn, in the group's order. An ability that changes the
 * ship it is aboard needs a ship: at a planet mission it is not offered.
 */
export function attemptAbilitiesOf(state: { table: TableState; log: LogEntry[] }): AttemptAbilityOffer[] {
  const { table, log } = state;
  const group = attemptingGroupOf(table);
  if (!group) return [];
  const missionIndex = table.attempt!.missionIndex;
  let view: ReturnType<typeof tableViewOf> | null = null;
  const missionPasses = (a: AttemptAbility) => !a.mission || missions((view ??= tableViewOf(table)), { ...a.mission, index: missionIndex }).length > 0;
  const offers: AttemptAbilityOffer[] = [];
  for (const card of group.cards) {
    if (card.stopped || !card.card || String(card.card.type ?? '').toLowerCase() !== 'personnel') continue;
    for (const ability of attemptAbilitiesOfTitle(nameOf(card))) {
      const step = modifyStepOf(ability);
      const target = step?.target === 'itsShip' ? group.ship : card;
      if (!target) continue;
      if (!missionPasses(ability)) continue;
      if (!abilityUsable(log, table.turn, { kind: 'attemptAbility', id: card.id, index: ability.index }, ability.limit)) continue;
      offers.push({ id: card.id, name: nameOf(card), ability, targetId: target.id, targetName: nameOf(target) });
    }
  }
  return offers;
}

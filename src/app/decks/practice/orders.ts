// The cards of the table that may use an order (#1866), each from its own place: a personnel or an equipment in
// an away team or a crew, a ship on a ship row, an event in the core or placed on a mission card. The order
// registry is `src/lib/orderModels/`; the log, the reducer and the pending order are in `gameLog.ts`.

import { cardDisplayName } from '../../../lib/cardCount';
import { downloadTakes, type ChooseSkillStep } from '../../../lib/effectSteps';
import { SKILLS } from '../../../lib/missionRequirements';
import { OrderModel, orderModelsOf } from '../../../lib/orderModels';
import { personnelCandidateGroups } from './personnelChoice';
import { findInstanceAnywhere, type CardInstance, type TableState } from './tableReducer';

/** A card on the table with an order: the card, its name, the order, and the group it stands in, when any. */
export interface OrderCard {
  instance: CardInstance;
  name: string;
  model: OrderModel;
  /** The away team or the crew the card stands in, for "your equipment present". */
  group?: CardInstance[];
}

const typeOf = (c: CardInstance): string => String(c.card?.type ?? '').toLowerCase();

/** Every order of every card of the table that stands in its own place, in table order. */
export function orderCardsOf(table: TableState): OrderCard[] {
  const out: OrderCard[] = [];
  const add = (instance: CardInstance, types: string[], group?: CardInstance[]) => {
    if (!instance.card || !types.includes(typeOf(instance))) return;
    const name = cardDisplayName(instance.card);
    for (const model of orderModelsOf(name)) out.push({ instance, name, model, ...(group ? { group } : {}) });
  };
  for (const slot of table.missions) {
    for (const c of slot.awayTeam) add(c, ['personnel', 'equipment'], slot.awayTeam);
    for (const ship of slot.ships) {
      add(ship, ['ship']);
      const crew = ship.crew ?? [];
      for (const c of crew) add(c, ['personnel', 'equipment'], crew);
    }
    for (const c of slot.mission?.placedOn ?? []) add(c, ['event']);
  }
  for (const c of table.core) add(c, ['event']);
  return out;
}

/** The order `index` of the card `id`, where the card stands in its own place, or null. */
export const orderCardOf = (table: TableState, id: string, index: number): OrderCard | null =>
  orderCardsOf(table).find((o) => o.instance.id === id && o.model.index === index) ?? null;

/**
 * The cards the cost of an order may take: the cards of the hand that pass its test for a discard, the player's
 * unstopped personnel that pass it for a stop (never the brig; with `present`, only those of the order card's group), and the cards of the type in the order card's own
 * group for a card present. None for a cost with no pick.
 */
export function orderCostCandidates(table: TableState, order: OrderCard): CardInstance[] {
  const cost = order.model.cost;
  if (cost.kind === 'discardFromHand') {
    const test = cost.test;
    return test ? table.hand.filter((c) => downloadTakes({ test }, c.card)) : table.hand;
  }
  if (cost.kind === 'stopPersonnel') {
    // "Stop one of your personnel present" (#1960): only the personnel of the order card's own group.
    const present = cost.present ? new Set((order.group ?? []).map((c) => c.id)) : null;
    return personnelCandidateGroups(table)
      .flatMap((g) => g.cards.map((c) => c.card))
      .filter((c) => (!present || present.has(c.id)) && downloadTakes({ test: cost.test }, c.card));
  }
  if (cost.kind === 'placePresentOnBottom')
    return (order.group ?? []).filter((c) => c.id !== order.instance.id && cost.types.includes(typeOf(c)));
  // Renewal Scroll (#1837): the cards of the discard pile that pass the test, never one removed from the game.
  if (cost.kind === 'placeFromDiscardOnThis') return table.discard.filter((c) => !c.removedFromGame && downloadTakes({ test: cost.test }, c.card));
  return [];
}

/** The card a `chooseSkill` step reads (#1837): the card placed last on the order's card `sourceId`, or undefined. */
export function chooseSkillCardOf(table: TableState, sourceId: string): CardInstance | undefined {
  const source = findInstanceAnywhere(table, sourceId)?.instance;
  return source?.placedOn?.at(-1);
}

/**
 * The skills a `chooseSkill` step offers (#1837): each skill of the card placed last on `sourceId`, as `SKILLS`
 * writes it and in its order, less the step's exclusions. None when nothing is placed on it.
 */
export function chooseSkillOptions(table: TableState, sourceId: string, step: ChooseSkillStep): string[] {
  const card = chooseSkillCardOf(table, sourceId);
  const skills = String(card?.card?.skills ?? '').toLowerCase();
  const exclude = new Set(step.exclude.map((s) => s.toLowerCase()));
  return SKILLS.filter((s) => !exclude.has(s.toLowerCase()) && new RegExp(`\\b${s.toLowerCase()}\\b`).test(skills));
}

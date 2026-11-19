import { CostFacts, CostModel, CostPlay, CostUse, DiscountOrigin, LimitCap, LimitGrant, ModelCost, PendingDiscount, TurnLimitChoice } from './model';
import { COMMANDED_MODELS } from './titles/commanded';
import { COUNTER_LIMIT_MODELS } from './titles/counterLimit';
import { COMPLETED_MISSION_MODELS } from './titles/completedMission';
import { DECK_DISCARD_MODELS } from './titles/deckDiscard';
import { HAND_AND_DISCARD_MODELS } from './titles/handAndDiscard';
import { LIMIT_MODELS } from './titles/limit';
import { MAY_COST_MODELS } from './titles/mayCost';
import { MISSION_COUNT_MODELS } from './titles/missionCount';
import { MISSION_RULE_MODELS } from './titles/missionRule';
import { NAMED_GROUP_MODELS } from './titles/namedGroup';
import { NEXT_OF_KIND_MODELS } from './titles/nextOfKind';
import { OPPONENT_COST_MODELS } from './titles/opponentCost';
import { OWN_COST_MODELS } from './titles/ownCost';
import { OWN_COST_PLACE_MODELS } from './titles/ownCostPlace';
import { PENDING_DISCOUNT_MODELS } from './titles/pendingDiscount';
import { PERSONNEL_RULE_MODELS } from './titles/personnelRule';
import { RECALL_MODELS } from './titles/recall';
import { STANDING_RULE_MODELS } from './titles/standingRule';
import { TABLE_USE_MODELS } from './titles/tableUse';
import { cardTitleOf } from '../cardTitle';

// The cost registry of the practice table (#1654): one model per title, from the lists of `titles/`,
// as the dilemma registry of the pile bot does. A new list of titles adds itself here. Each model
// names its family.

const MODELS: CostModel[] = [
  ...OWN_COST_MODELS,
  ...COMMANDED_MODELS,
  ...COMPLETED_MISSION_MODELS,
  ...LIMIT_MODELS,
  ...PENDING_DISCOUNT_MODELS,
  ...NEXT_OF_KIND_MODELS,
  ...OPPONENT_COST_MODELS,
  ...DECK_DISCARD_MODELS,
  ...MISSION_COUNT_MODELS,
  ...MAY_COST_MODELS,
  ...HAND_AND_DISCARD_MODELS,
  ...NAMED_GROUP_MODELS,
  ...OWN_COST_PLACE_MODELS,
  ...STANDING_RULE_MODELS,
  ...TABLE_USE_MODELS,
  ...RECALL_MODELS,
  ...COUNTER_LIMIT_MODELS,
  ...MISSION_RULE_MODELS,
  ...PERSONNEL_RULE_MODELS,
];

/** The registry of `models`, by title. Two models of one title throw. */
export function costRegistryOf(models: CostModel[]): ReadonlyMap<string, CostModel> {
  const map = new Map<string, CostModel>();
  for (const m of models) {
    if (map.has(m.title)) throw new Error(`two models of "${m.title}" in the cost registry`);
    map.set(m.title, m);
  }
  return map;
}

export const COST_REGISTRY: ReadonlyMap<string, CostModel> = costRegistryOf(MODELS);

/** The model of a card name, by its title less the version suffix, or undefined for a title the registry lacks. */
export function costModelOf(name: string): CostModel | undefined {
  return COST_REGISTRY.get(cardTitleOf(name));
}

/** The name a model's suggestions show: its label, or its title. */
export const costModelName = (model: CostModel): string => model.label ?? model.title;

/**
 * The grants of the models to the turn's limit while the table stands as `facts` say (#1655), one per
 * model that grants a counter or more, in the order of the registry.
 */
export function limitGrantsOf(facts: CostFacts, registry: ReadonlyMap<string, CostModel> = COST_REGISTRY): LimitGrant[] {
  return grantsOf(registry, (model) => model.limitGrant?.(facts));
}

/** The grants of the models to the first turn's limit at its start (#1755), one per model that grants, in registry order. */
export function firstTurnGrantsOf(facts: CostFacts, registry: ReadonlyMap<string, CostModel> = COST_REGISTRY): LimitGrant[] {
  return grantsOf(registry, (model) => model.firstTurnGrant?.(facts));
}

function grantsOf(
  registry: ReadonlyMap<string, CostModel>,
  grantOf: (model: CostModel) => { amount: number; reason: string } | null | undefined
): LimitGrant[] {
  return [...registry.values()].flatMap((model) => {
    const grant = grantOf(model);
    const amount = grant ? Math.round(grant.amount) : 0;
    return grant && amount > 0 && Number.isFinite(amount) ? [{ title: costModelName(model), amount, reason: grant.reason }] : [];
  });
}

/**
 * The caps of the models on the turn's limit while the table stands as `facts` say (#1704), one per model
 * that caps it, in the order of the registry.
 */
export function limitCapsOf(facts: CostFacts, registry: ReadonlyMap<string, CostModel> = COST_REGISTRY): LimitCap[] {
  return [...registry.values()].flatMap((model) => {
    const cap = model.limitCap?.(facts);
    const amount = cap ? Math.round(cap.amount) : NaN;
    return cap && amount >= 0 && Number.isFinite(amount) ? [{ title: costModelName(model), amount, reason: cap.reason }] : [];
  });
}

/** The smallest of `caps` over `limit`, or `limit` with no cap (#1704). */
export const cappedLimit = (limit: number, caps: LimitCap[]): number => Math.min(limit, ...caps.map((c) => c.amount));

/**
 * The choices of the turn that raise its limit while the table stands as `facts` say (#1704), those of
 * each model of at least one counter, in the order of the registry.
 */
export function turnChoicesOf(facts: CostFacts, registry: ReadonlyMap<string, CostModel> = COST_REGISTRY): TurnLimitChoice[] {
  return [...registry.values()].flatMap((model) =>
    (model.turnChoices?.(facts) ?? []).flatMap((c) => {
      const limit = Math.round(c.limit);
      return limit > 0 && Number.isFinite(limit) ? [{ title: costModelName(model), label: c.label, limit }] : [];
    })
  );
}

/**
 * The cost changes of the player's missions to the play from the hand of `play` (#1752): each mission
 * title of the slots, once, asked with its first slot.
 */
export function missionCostsOf(
  play: CostPlay,
  facts: CostFacts,
  registry: ReadonlyMap<string, CostModel> = COST_REGISTRY
): { title: string; cost: ModelCost }[] {
  const seen = new Set<string>();
  return (facts.missions ?? []).flatMap((mission, slot) => {
    const title = mission.name ? cardTitleOf(mission.name) : '';
    if (!title || seen.has(title)) return [];
    seen.add(title);
    const model = registry.get(title);
    const cost = model?.missionCostOfPlay?.(play, facts, slot);
    return model && cost ? [{ title: costModelName(model), cost }] : [];
  });
}

/**
 * The cost changes of the player's unstopped personnel to the play from the hand of `play` (#1756): each
 * title of an unstopped personnel of the away teams and crews, never the brig, once, in the order of the slots.
 */
export function personnelCostsOf(
  play: CostPlay,
  facts: CostFacts,
  registry: ReadonlyMap<string, CostModel> = COST_REGISTRY
): { title: string; cost: ModelCost }[] {
  const seen = new Set<string>();
  return (facts.missions ?? []).flatMap((mission) =>
    (mission.personnel ?? []).flatMap((p) => {
      const title = p.title && !p.stopped ? cardTitleOf(p.title) : '';
      if (!title || seen.has(title)) return [];
      seen.add(title);
      const model = registry.get(title);
      const cost = model?.personnelCostOfPlay?.(play, facts);
      return model && cost ? [{ title: costModelName(model), cost }] : [];
    })
  );
}

/**
 * The costs the cards of the core set on the play of another card from the hand (#1702): one per model
 * of a title in `facts.core` whose `costOfPlay` answers, once per title, in the order of the registry.
 */
export function coreCostsOf(
  play: CostPlay,
  facts: CostFacts,
  registry: ReadonlyMap<string, CostModel> = COST_REGISTRY
): { title: string; cost: ModelCost }[] {
  const core = new Set(facts.core);
  return [...registry.values()].flatMap((model) => {
    const cost = core.has(model.title) ? model.costOfPlay?.(play, facts) : null;
    return cost ? [{ title: costModelName(model), cost }] : [];
  });
}

const USE_VERBS = { destroy: 'Destroy', stop: 'Stop', revealTop: 'Reveal the top card' } as const;

/**
 * The uses the cards on the table offer for the play from the hand of another card (#1713): those of
 * every model with `usesForPlay`, one per copy, in the order of the registry, each at least 1 counter.
 */
export function costUsesOf(play: CostPlay, facts: CostFacts, registry: ReadonlyMap<string, CostModel> = COST_REGISTRY): CostUse[] {
  return [...registry.values()].flatMap((model) =>
    (model.usesForPlay?.(play, facts) ?? []).flatMap((use) => {
      const amount = Math.round(use.amount);
      const reveal = use.effect === 'revealTop';
      // A reveal (#1763) takes no counters off; every other use takes some.
      if (!(reveal ? amount === 0 : amount > 0) || use.id === play.id) return [];
      const title = costModelName(model);
      const label = reveal ? `${USE_VERBS[use.effect]} (${title})` : `${USE_VERBS[use.effect]} ${title}: −${amount}`;
      return [{ id: use.id, title, label, amount, effect: use.effect }];
    })
  );
}

/** The discount a play of the card `name` leaves, made by the play at `origin` (#1656), or null. */
export function pendingDiscountOf(
  name: string,
  origin: DiscountOrigin,
  registry: ReadonlyMap<string, CostModel> = COST_REGISTRY
): PendingDiscount | null {
  const model = registry.get(cardTitleOf(name));
  const discount = model?.pendingDiscount;
  return model && discount ? { title: costModelName(model), label: discount.label, amount: discount.amount, origin, applies: discount.applies } : null;
}

/** "Sarish Rez: next [Fed][DS9] personnel −2", the row of a pending discount (#1656). */
export const pendingDiscountText = (d: PendingDiscount): string => `${d.title}: ${d.label} −${d.amount}`;

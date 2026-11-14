import { CostFacts, CostModel, DiscountOrigin, LimitGrant, PendingDiscount } from './model';
import { LIMIT_MODELS } from './titles/limit';
import { OWN_COST_MODELS } from './titles/ownCost';
import { PENDING_DISCOUNT_MODELS } from './titles/pendingDiscount';
import { cardTitleOf } from '../cardTitle';

// The cost registry of the practice table (#1654): one model per title, from the lists of `titles/`,
// as the dilemma registry of the pile bot does. A new list of titles adds itself here. Each model
// names its family.

const MODELS: CostModel[] = [...OWN_COST_MODELS, ...LIMIT_MODELS, ...PENDING_DISCOUNT_MODELS];

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
  return [...registry.values()].flatMap((model) => {
    const grant = model.limitGrant?.(facts);
    const amount = grant ? Math.round(grant.amount) : 0;
    return grant && amount > 0 && Number.isFinite(amount) ? [{ title: costModelName(model), amount, reason: grant.reason }] : [];
  });
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

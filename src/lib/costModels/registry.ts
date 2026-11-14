import { CostModel } from './model';
import { OWN_COST_MODELS } from './titles/ownCost';
import { cardTitleOf } from '../cardTitle';

// The cost registry of the practice table (#1654): one model per title, from the lists of `titles/`,
// as the dilemma registry of the pile bot does. A new list of titles adds itself here. Each model
// names its family.

const MODELS: CostModel[] = [...OWN_COST_MODELS];

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

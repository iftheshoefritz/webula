import { DilemmaModel } from './model';
import { BEGINNER_DECK_MODELS } from './titles/beginnerDecks';
import { CARDASSIAN_GQ_MODELS } from './titles/cardassianGammaQuadrant';
import { CHAMPIONSHIP_BATCH_1_MODELS } from './titles/championshipBatch1';
import { CHAMPIONSHIP_BATCH_2_MODELS } from './titles/championshipBatch2';
import { CHAMPIONSHIP_BATCH_3_MODELS } from './titles/championshipBatch3';
import { CHULA_MODELS } from './titles/chula';
import { THINK_TANK_MODELS } from './titles/thinkTank';

import { setModelLookup } from './define';
import { cardTitleOf } from '../../cardTitle';

export { CORE_EVENTS, discardCap } from './define';

// The dilemma registry of the pile bot (#1320): one model per title, from the files of `titles/`. A new
// file of titles adds its list here. Each entry names its family, so `familyReport` can count how far the
// families reach.

const MODELS: DilemmaModel[] = [...THINK_TANK_MODELS, ...CARDASSIAN_GQ_MODELS, ...CHULA_MODELS, ...BEGINNER_DECK_MODELS, ...CHAMPIONSHIP_BATCH_1_MODELS, ...CHAMPIONSHIP_BATCH_2_MODELS, ...CHAMPIONSHIP_BATCH_3_MODELS];

/**
 * The title of the model that covers a deck line's card name, less its version suffix (`cardTitleOf`,
 * shared with the range and span models of #1635).
 */
export const pileTitleOf = cardTitleOf;

export const REGISTRY: ReadonlyMap<string, DilemmaModel> = (() => {
  const map = new Map<string, DilemmaModel>();
  for (const m of MODELS) {
    if (map.has(m.title)) throw new Error(`two models of "${m.title}" in the dilemma registry`);
    map.set(m.title, m);
  }
  return map;
})();
setModelLookup((title) => REGISTRY.get(title));


/** The model of a card name, by its title less the version suffix, or undefined for a title the registry lacks. */
export function modelOf(name: string): DilemmaModel | undefined {
  return REGISTRY.get(pileTitleOf(name));
}

/** The titles of each family, for the pilot's report. */
export function familyReport(titles: Iterable<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const title of titles) {
    const model = REGISTRY.get(title);
    const family = model ? model.family : 'missing';
    out.set(family, [...(out.get(family) ?? []), title]);
  }
  return out;
}

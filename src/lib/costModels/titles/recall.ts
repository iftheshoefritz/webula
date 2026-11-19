import { CostModel } from '../model';

// The cards whose game text grants Recall under a condition (#1764). The keyword Recall ("Recall: N." in the
// `Keywords` column: Planned Provocation, Second Edition, Profound Discovery, Miracle Working) needs no model:
// `recallOf` in `playCost.ts` reads it from the card.
export const RECALL_MODELS: CostModel[] = [
  {
    // "While you command two completed missions, this event gains Recall: 1."
    title: 'Vidiian Organ Bank',
    family: 'ownCost',
    recall: (facts) => ((facts.missions ?? []).filter((m) => m.completed).length >= 2 ? 1 : null),
  },
];

// The table source of a `CostFacts` (#1876): the selectors and the conditions of `src/lib/tableView.ts` read a
// cost model's facts through it, so a model calls the shared conditions with no change of signature, and a
// test's hand-built facts work as well. `commanded` has no place and no id, and `missions[].personnel` repeats
// its unstopped personnel, so the source never merges them: the unstopped personnel with no slot read
// `commanded`, and every other query reads `missions[].personnel`.

import type { Condition, SourceCoreCard, SourceMission, TableSource } from '../tableView';
import type { CostFacts, ModelCost } from './model';

const missionsOf = (facts: CostFacts): SourceMission[] =>
  (facts.missions ?? []).map((m, index) => ({
    index,
    empty: !m.name,
    completed: m.completed,
    ...(m.flipped ? { flipped: true } : {}),
    name: m.name,
    requirements: m.requirements,
    points: m.points,
    type: m.type,
    icons: m.icons,
    quadrant: m.quadrant,
    regions: m.regions ?? [],
  }));

// The titles of `core`, each with its card of `coreCards` and the count of `corePlaced` at the same index.
const coreOf = (facts: CostFacts): SourceCoreCard[] =>
  Array.from({ length: Math.max(facts.core.length, facts.coreCards?.length ?? 0) }, (_, i) => {
    const card = facts.coreCards?.[i];
    return {
      ...(card?.id ? { id: card.id } : {}),
      title: facts.core[i] ?? card?.title ?? '',
      type: card?.type ?? '',
      keywords: card?.keywords ?? [],
      cost: card?.cost ?? 0,
      placed: facts.corePlaced?.[i] ?? 0,
    };
  });

/** The source of `facts`. A crew is no part of `CostFacts`, so a query `aboard` a ship finds no one. */
export const costFactsSource = (facts: CostFacts): TableSource => ({
  personnelOf: (unstopped, at) => {
    if (unstopped && at === undefined) return facts.commanded;
    const all = (facts.missions ?? []).flatMap((m, missionIndex) => (m.personnel ?? []).map((p) => ({ ...p, missionIndex })));
    return unstopped ? all.filter((p) => !p.stopped) : all;
  },
  shipsOf: () => (facts.missions ?? []).flatMap((m, missionIndex) => (m.ships ?? []).map((s) => ({ ...s, missionIndex }))),
  eventsOf: () => facts.events ?? [],
  missionsOf: () => missionsOf(facts),
  coreOf: () => coreOf(facts),
  playsOf: () => facts.plays ?? [],
});

/** "If <condition>, cost −`off`": the printed cost less `off` with the condition's words, or null. */
export const minusWhen =
  (condition: Condition, off: number) =>
  (play: { printed: number }, facts: CostFacts): ModelCost | null => {
    const source = costFactsSource(facts);
    return condition.holds(source) ? { cost: play.printed - off, reason: condition.text(source) } : null;
  };

// The cost rows (#1888, part 2 of #1864): the static cost changes of the cost registry as modifier rows of plain
// data (`ModifierRow` of `src/lib/modifiers/model.ts`): the card's own cost, the play a card of the core, a mission
// of the player's slots or an unstopped personnel prices, the grants and the caps of the turn's limit, and the
// discount a play leaves for the next play. One evaluator reads them: `rowCost` for a cost, `rowLimit` for the
// counters. The registry's readers ask them in the order of the cost registry, as they asked the hooks before.
// What is no static change stays on the `CostModel`: the choices, the uses, a reveal, a discard, a Recall, a play
// from the discard pile, the first turn's grants and the choices of the turn.

import { cardTitleOf } from '../cardTitle';
import type { Condition } from '../tableView';
import { personnel } from '../tableView';
import { costFactsSource } from './factsSource';
import type { CostFacts, CostModel, CostPlay, ModelCost } from './model';
import type { CostChange, LimitChange, ModifierRow, NextPlayDiscount, SourcePlace } from '../modifiers/model';
import { row } from '../modifiers/model';

/** A cost row before the registry gives it its model's title and label. */
export type CostRowSpec = Omit<ModifierRow, 'title' | 'label'>;

type Extra = { condition?: Condition };

/** The card's own cost while `condition` holds: "When you play this personnel, if …, he is cost -1." */
export const own = (change: CostChange, extra: Extra = {}): CostRowSpec => spec('played', 'play', { cost: change }, extra);

/** The cost of another card's play while the card is in the core (#1702, #1703). Each title is asked once. */
export const inCore = (change: CostChange, extra: Extra = {}): CostRowSpec => spec('core', 'play', { cost: change }, extra);

/** The cost of another card's play while the mission is in one of the player's slots (#1752), asked with its first slot. */
export const atMission = (change: CostChange, extra: Extra = {}): CostRowSpec =>
  spec('mission', 'play', { cost: change }, { ...extra, eachTitleOnce: true });

/** The cost of another card's play while an unstopped personnel of the title is in an away team or a crew (#1756). */
export const byPersonnel = (change: CostChange, extra: Extra = {}): CostRowSpec =>
  spec('unstopped', 'play', { cost: change }, { ...extra, eachTitleOnce: true });

/** The counters the card adds to, or caps, the turn's limit while it stands in `source` (#1655, #1704). */
export const onLimit = (source: 'core' | 'unstopped', change: LimitChange, extra: Extra = {}): CostRowSpec =>
  spec(source, 'turnLimit', { counterLimit: change }, extra);

/** The discount the card's own play leaves for the next play of the turn that passes `applies` (#1656). */
export const nextPlay = (discount: NextPlayDiscount): CostRowSpec => ({ ...spec('played', 'play', { cost: discount }), scope: 'nextPlay' });

/** "If <condition>, cost −`n`": the card's own cost, with the condition's words (`minusWhen` as a row). */
export const ownWhen = (condition: Condition, n: number): CostRowSpec => own(off(n), { condition });

/** "Cost −`n`" with the words of the row's condition. */
export const off =
  (n: number): CostChange =>
  (c) => ({ cost: c.play.printed - n, reason: c.because });

function spec(source: SourcePlace, target: ModifierRow['target'], changes: ModifierRow['changes'], extra: Partial<ModifierRow> = {}): CostRowSpec {
  const { title: _title, ...rest } = row('', source, target, changes, extra);
  return rest;
}

/** `model` with its cost rows, each named by the model's title and label. */
export const withRows = (model: CostModel, ...rows: CostRowSpec[]): CostModel => ({
  ...model,
  rows: rows.map((r) => ({ ...r, title: model.title, ...(model.label ? { label: model.label } : {}) })),
});

/** The cost row of `place` among `rows`, while its card stands there: at most one, as `rowsByTitle` checks. */
export const costRowAt = (rows: readonly ModifierRow[] | undefined, place: SourcePlace): ModifierRow | undefined =>
  rows?.find((r) => r.source === place && typeof r.changes.cost === 'function');

/** The cost a row sets on `play`, or null when its condition fails or it changes nothing. */
export function rowCost(r: ModifierRow, play: CostPlay, facts: CostFacts, slot?: number): ModelCost | null {
  const change = r.changes.cost;
  if (typeof change !== 'function') return null;
  const source = costFactsSource(facts);
  if (r.condition && !r.condition.holds(source)) return null;
  return change({ play, facts, source, ...(slot === undefined ? {} : { slot }), because: r.condition?.text(source) ?? '' });
}

// Whether the card of a counter row stands in its place: its title in the core, or an unstopped personnel of its
// title that the player commands.
function stands(r: ModifierRow, facts: CostFacts): boolean {
  if (r.source === 'core') return facts.core.includes(r.title);
  const title = r.title.toLowerCase();
  return personnel(costFactsSource(facts), { unstopped: true, where: (p) => cardTitleOf(p.name) === title }).length > 0;
}

/** The grant (`'grant'`) or the cap (`'cap'`) of the counter rows of `rows` on the table of `facts`, or null. */
export function rowLimit(rows: readonly ModifierRow[] | undefined, kind: 'grant' | 'cap', facts: CostFacts): { amount: number; reason: string } | null {
  for (const r of rows ?? []) {
    const change = r.changes.counterLimit?.[kind];
    if (!change || !stands(r, facts)) continue;
    const source = costFactsSource(facts);
    if (r.condition && !r.condition.holds(source)) continue;
    return change({ facts, source, because: r.condition?.text(source) ?? '' });
  }
  return null;
}

/** The discount of the next play that the row of `rows` leaves, or undefined. */
export const nextPlayOf = (rows: readonly ModifierRow[] | undefined): NextPlayDiscount | undefined => {
  const cost = rows?.find((r) => r.scope === 'nextPlay')?.changes.cost;
  return typeof cost === 'object' ? cost : undefined;
};

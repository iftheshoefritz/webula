import { seededRandom } from '../simulator';
import { DilemmaModel, PileAttempt, stackCostOf } from './model';
import { playPileStack } from './play';
import { modelOf } from './registry';

// The label of the bot's choice on a dilemma the player faces (#1519). Like `tableAttempt.ts`, this
// file imports nothing from the practice table: the page hands it the card's row and the attempt.

// Only the label of the play matters, not its random selections, so a fixed seed keeps the label
// stable across renders.
export const LABEL_SEED = 1519;

export type LabelRow = { originalName?: string } | null | undefined;

/** The models of `rows`, in order: a row whose title the registry lacks is left out. */
export const modelsOf = (rows: ReadonlyArray<LabelRow>): DilemmaModel[] =>
  rows.flatMap((row) => {
    const model = row?.originalName ? modelOf(row.originalName) : undefined;
    return model ? [model] : [];
  });

/**
 * The text of the label the model of `row` makes when the group of `attempt` faces it, followed by the
 * `rest` of the facing stack in order (#1556), so a fetch is scored under the cost rule as the search
 * scored it. The texts are joined when its play makes more than one; null for a title the registry lacks,
 * a group with no one unstopped, or a play that makes no label. Only the labels of `row`'s title count.
 *
 * `revealed` are the cards revealed in this attempt before `row`, in reveal order: with the attempt's
 * `spend`, their cost counts as already spent, with the per-step arithmetic of `stackCostOf`, the
 * discount the last of them gives `row` too. A title the registry lacks counts nothing.
 */
export function pileLabelOf(
  row: LabelRow,
  attempt: PileAttempt,
  { revealed = [], rest = [] }: { revealed?: ReadonlyArray<LabelRow>; rest?: ReadonlyArray<LabelRow> } = {},
): string | null {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  if (!model) return null;
  const { labels } = playPileStack(withRevealedCost(attempt, model, revealed), [model, ...modelsOf(rest)], seededRandom(LABEL_SEED));
  const texts = labels.filter((l) => l.title === model.title).map((l) => l.label);
  return texts.length ? texts.join('; ') : null;
}

/**
 * `attempt` with the cost of the `revealed` cards before `model` counted as already spent (#1556): the
 * label and the Resolve of #1588 both play `model` against it.
 */
export function withRevealedCost(attempt: PileAttempt, model: DilemmaModel, revealed: ReadonlyArray<LabelRow>): PileAttempt {
  const before = modelsOf(revealed);
  // The cost of the stack through `model`, less what `model` costs alone: what was spent before it, with
  // the discount it gets. `model`'s own extra budget stays out, since the play adds it to the budget.
  const revealedCost = before.length ? stackCostOf(attempt, [...before, model]) - stackCostOf(attempt, [model]) : 0;
  return revealedCost ? { ...attempt, revealedCost: (attempt.revealedCost ?? 0) + revealedCost } : attempt;
}

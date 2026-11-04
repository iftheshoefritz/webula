import { seededRandom } from '../simulator';
import { PileAttempt } from './model';
import { playPileStack } from './play';
import { modelOf } from './registry';

// The label of the bot's choice on a dilemma the player faces (#1519). Like `tableAttempt.ts`, this
// file imports nothing from the practice table: the page hands it the card's row and the attempt.

// Only the label of the play matters, not its random selections, so a fixed seed keeps the label
// stable across renders.
const LABEL_SEED = 1519;

/**
 * The text of the label the model of `row` makes when the group of `attempt` faces it alone, the texts
 * joined when its play makes more than one, or null: a title the registry lacks, a group with no one
 * unstopped, or a play that makes no label.
 */
export function pileLabelOf(row: { originalName?: string } | null | undefined, attempt: PileAttempt): string | null {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  if (!model) return null;
  const { labels } = playPileStack(attempt, [model], seededRandom(LABEL_SEED));
  const texts = labels.filter((l) => l.title === model.title).map((l) => l.label);
  return texts.length ? texts.join('; ') : null;
}

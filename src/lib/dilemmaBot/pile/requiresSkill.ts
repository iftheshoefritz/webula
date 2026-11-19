import { seededRandom } from '../simulator';
import { SKILLS } from '../../missionRequirements';
import { DilemmaModel, PileAttempt } from './model';
import { LABEL_SEED } from './label';
import { playPileStack } from './play';
import { modelOf } from './registry';

// Whether a dilemma "requires a skill" (#1761), for Sigma Iotia II's "does not require a skill". The
// owner's ruling: read it from the bot's model where one exists, and from the dilemma's text otherwise.
// Like `label.ts`, this file imports nothing from the practice table.

/**
 * Whether the play of `model`, alone, against the group of `attempt`, reads a skill in a check of its own:
 * a skill of a personnel ("unless you have Diplomacy", "a personnel with Medical") or a branch of a
 * requirement that names a skill. A check of attributes only, and the mission check after the stack, read
 * none. The play is the label's seeded play, so the answer is stable.
 */
export function modelRequiresSkill(model: DilemmaModel, attempt: PileAttempt): boolean {
  let read = false;
  playPileStack({ ...attempt, spend: undefined }, [model], seededRandom(LABEL_SEED), undefined, 0, { skillRead: () => (read = true) });
  return read;
}

const SKILL_WORDS = new RegExp(`\\b(${SKILLS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/** Whether the game text names a skill as a word, for a dilemma the bot has no model of. */
export const textRequiresSkill = (gametext: string | undefined): boolean => SKILL_WORDS.test(gametext ?? '');

/** Whether the dilemma of `row` requires a skill: its model's play when the registry holds its title, else its text. */
export function dilemmaRequiresSkill(row: { originalName?: string; gametext?: string } | null | undefined, attempt: PileAttempt): boolean {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  return model ? modelRequiresSkill(model, attempt) : textRequiresSkill(row?.gametext);
}

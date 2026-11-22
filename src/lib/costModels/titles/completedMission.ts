import { completedMissionRequiring } from '../../tableView';
import { minusWhen } from '../factsSource';
import { CostModel } from '../model';

// The personnel that cost −4 when the player has completed a mission requiring one of two skills
// (#1694). A requirement "requires" a skill when the skill appears in it as a word, either side of an
// "or".

/** Whether `mission`'s requirement text names `skill` as a word: the shared `requiresSkill`. */
export { requiresSkill as missionRequires } from '../../tableView';

/** "If you have completed a mission requiring <one of `skills`>, cost −4." */
const ifCompletedRequiring = (...skills: string[]) => minusWhen(completedMissionRequiring(skills), 4);

// Each reads "When you play this personnel, if you have completed a mission requiring <X> or <Y>,
// he (she) is cost -4."
const model = (title: string, label: string, ...skills: string[]): CostModel => ({
  title,
  label,
  family: 'ownCost',
  playCost: ifCompletedRequiring(...skills),
});

/** Tristan Adams's choice (#1761): "You may play this personnel at cost +2 to name a dilemma." */
export const NAME_DILEMMA_LABEL = '+2: name a dilemma';

// Tristan Adams (#1761): the −4 above when it applies, and always the choice to play him at cost +2 to
// name a dilemma, from the cost the play has.
function tristanAdams(base: CostModel): CostModel {
  return {
    ...base,
    playCost: (play, facts) => {
      const own = base.playCost!(play, facts);
      const cost = own?.cost ?? play.printed;
      return {
        cost,
        reason: own?.reason ?? 'you may name a dilemma',
        choice: { label: NAME_DILEMMA_LABEL, cost: cost + 2, nameDilemma: true },
      };
    },
  };
}

export const COMPLETED_MISSION_MODELS: CostModel[] = [
  model('Nador Curious Commander', 'Nador', 'Officer', 'Treachery'),
  model('Data Lucasian Chair', 'Data', 'Diplomacy', 'Leadership'),
  // "…if you command a completed mission requiring Anthropology or Treachery, he is cost -4." (#1749)
  tristanAdams(model('Tristan Adams Deranged Psychiatrist', 'Tristan Adams', 'Anthropology', 'Treachery')),
  model('A. G. Robinson Prototype Captain', 'A. G. Robinson', 'Astrometrics', 'Navigation'),
  model('Gorkon Visionary Chancellor', 'Gorkon', 'Diplomacy', 'Leadership'),
  model('Kathryn Janeway Regretful Leader', 'Kathryn Janeway', 'Engineer', 'Science'),
  model('William Ross "Temporary" Ally', 'William Ross', 'Diplomacy', 'Officer'),
  model('Shakaar Edon First Minister of Bajor', 'Shakaar Edon', 'Anthropology', 'Leadership'),
  model('Brunt Acting Grand Nagus', 'Brunt', 'Acquisition', 'Treachery'),
];

import { missionModelOfCard, missionModelsWith, type RevealedDilemmaTest } from '../../missionModels';
import { DilemmaModel, MissionCostChange } from './model';

// The missions that change the cost of a dilemma revealed there (#1760): Terlina III, Stakoron II,
// Stakoron Strait and Wadi Homeworld, the `onDilemmaReveal` cost abilities of the mission registry (#1907). A
// mission is named by its whole title. Only the table's label and Resolve read it: the bot chooses its stack at
// printed costs, before the reveal.

const passes = (m: DilemmaModel, test: RevealedDilemmaTest): boolean =>
  (test.title === undefined || m.title === test.title) &&
  (test.titleStartsWith === undefined || m.title.startsWith(test.titleStartsWith)) &&
  (test.kind === undefined || m.kind === test.kind);

/** The missions with a cost change here, by whole title, lowercased: the model backlog reads it. */
export const MISSION_COST_TITLES: ReadonlySet<string> = new Set(
  missionModelsWith('onDilemmaReveal').flatMap(({ model, ability }) => (ability.reveal.kind === 'cost' ? [model.title.toLowerCase()] : []))
);

/** The cost change of the mission whose row is `mission`, or undefined for any other mission. */
export function missionCostOf(mission: { name?: string; originalName?: string } | null | undefined): MissionCostChange | undefined {
  const model = missionModelOfCard(mission);
  const reveal = model?.abilities.flatMap((a) => (a.trigger === 'onDilemmaReveal' && a.reveal.kind === 'cost' ? [a.reveal] : []))[0];
  if (!model || !reveal) return undefined;
  return { source: model.label, change: (m) => (passes(m, reveal.dilemma) ? reveal.change : 0) };
}

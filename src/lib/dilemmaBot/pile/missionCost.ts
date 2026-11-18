import { MissionCostChange } from './model';

// The missions that change the cost of a dilemma revealed there (#1760): Terlina III, Stakoron II,
// Stakoron Strait and Wadi Homeworld. A mission is named by its whole title, lowercased, as
// `attemptMissions.ts` names the missions of #1759. Only the table's label and Resolve read it: the bot
// chooses its stack at printed costs, before the reveal.

const MISSION_COSTS: Record<string, MissionCostChange> = {
  // "When {Unscientific Method} is revealed here, it is cost -2."
  'terlina iii follow homing beacon': { source: 'Terlina III', change: (m) => (m.title === 'Unscientific Method' ? -2 : 0) },
  // "When a dual dilemma is revealed here, it is cost +1."
  'stakoron ii mine miszinite': { source: 'Stakoron II', change: (m) => (m.kind === 'dual' ? 1 : 0) },
  'stakoron strait patrol shipping lane': { source: 'Stakoron Strait', change: (m) => (m.kind === 'dual' ? 1 : 0) },
  // "Each dilemma whose title begins with "Chula" revealed here is cost -1."
  'wadi homeworld dominate gaming championship': { source: 'Wadi Homeworld', change: (m) => (m.title.startsWith('Chula') ? -1 : 0) },
};

/** The cost change of the mission whose row is `mission`, or undefined for any other mission. */
export function missionCostOf(mission: { name?: string; originalName?: string } | null | undefined): MissionCostChange | undefined {
  const name = mission?.originalName ?? mission?.name;
  return typeof name === 'string' ? MISSION_COSTS[name.trim().toLowerCase()] : undefined;
}

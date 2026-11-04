import { AttemptedMission } from '../gains';
import { DILEMMA_BY_ID } from '../opponentPile';
import { parseRequirementBranches } from '../requirements';
import { drawDilemmas } from '../search';
import { PlayerChoice, Rand, partnerGroupOf } from '../simulator';
import { PileAttempt, PileTable } from './model';
import { PilePersonnelRow } from './tableAttempt';
import { pilePersonnelOf } from './pile';

// The `PileAttempt` of the dilemma lab (#1509). The lab has no table, so the attempt plays against a
// plain one, and it has no ship.

/** A mission of the lab: its requirements, the fields the gains read, and the facts of a `PileMission`. */
export interface LabMissionFacts extends AttemptedMission {
  requirements: string;
  span?: number;
  /** A Nebula mission: "nebula" in its keywords or its name. */
  nebula?: boolean;
}

/** The lab's table: no headquarters, no completed mission, a hand of 7, an empty discard pile, no dilemma under the mission, turn 1. */
export const LAB_TABLE: PileTable = {
  headquarters: 0,
  completedMissions: 0,
  completedSpaceMission: false,
  handSize: 7,
  handHasCunning7Or11: false,
  discardCopiesMax: 0,
  missionSkills: [],
  underMission: [],
  turn: 1,
};

export interface LabAttemptOptions {
  gameOnMission: number;
  choice: PlayerChoice;
  /** The condition of Sphere 117 holds for the deck: the skill loss of Mostly Assimilated does not apply (#1363). */
  sphere117?: boolean;
}

/** The lab's attempt of `crew` at `mission`, or null when the bot cannot read the mission's requirements. */
export function labPileAttemptOf(
  crew: ReadonlyArray<PilePersonnelRow>,
  mission: LabMissionFacts,
  { gameOnMission, choice, sphere117 = false }: LabAttemptOptions,
): PileAttempt | null {
  const requirements = parseRequirementBranches(mission.requirements);
  if (!requirements) return null;
  const attempted: AttemptedMission = { missiontype: mission.missiontype, quadrant: mission.quadrant, points: mission.points };
  return {
    ...partnerGroupOf(crew.map((row) => pilePersonnelOf(row, attempted, undefined, sphere117))),
    requirements,
    mission: {
      kind: mission.missiontype === 's' ? 'space' : 'planet',
      points: Number(mission.points) || 0,
      span: mission.span ?? 0,
      nebula: Boolean(mission.nebula),
    },
    table: LAB_TABLE,
    gameOnMission,
    choice,
  };
}

/**
 * N dilemmas of the Chula pile, as titles, one per copy: 3 of each title, less the copies of Chula: The
 * Game on the mission and `underMission` other copies, the draw of `drawDilemmas` with the same randoms.
 */
export function drawLabTitles(n: number, gameOnMission: number, underMission: number, rand: Rand): string[] {
  return drawDilemmas(n, gameOnMission, underMission, rand).map((id) => DILEMMA_BY_ID[id].title);
}

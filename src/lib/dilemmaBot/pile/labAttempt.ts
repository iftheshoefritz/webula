import { AttemptedMission } from '../gains';
import { COPIES_OF_EACH, OPPONENT_DILEMMAS } from '../opponentPile';
import { parseRequirementBranches } from '../requirements';
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

/** The lab's table: no headquarters, no completed mission, a hand of 7, an empty discard pile, no dilemma under the mission, turn 1, a score of 0 as in a fresh game (#1541). */
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
  score: 0,
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

const GAME = 'Chula: The Game';

/**
 * N dilemmas of the Chula pile, as titles, one per copy: 3 of each title, less the copies of Chula: The
 * Game on the mission and `underMission` other copies. A drawn 0-cost dilemma uses one of the N draws too.
 */
export function drawLabTitles(n: number, gameOnMission: number, underMission: number, rand: Rand): string[] {
  const pile = OPPONENT_DILEMMAS.flatMap((d) => Array<string>(COPIES_OF_EACH).fill(d.title));
  for (let c = 0; c < gameOnMission; c++) pile.splice(pile.indexOf(GAME), 1);
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  for (let u = 0; u < underMission; u++) {
    const i = pile.findIndex((title) => title !== GAME);
    if (i >= 0) pile.splice(i, 1);
  }
  return pile.slice(0, Math.max(0, n));
}

import { AttemptedMission, BotTableFacts, attemptedMissionOf } from '../gains';
import { RequirementBranch, parseRequirementBranches } from '../requirements';
import { partnerGroupOf } from '../simulator';
import { PileAttempt, PileShip } from './model';
import { pilePersonnelOf } from './pile';
import { pileTitleOf } from './registry';

// The `PileAttempt` of a bot attempt on the practice table (#1508). It
// reads card rows and table facts, not the table, so this file imports nothing from the practice
// table (#1298): the page hands it the cards. The mission, the ship and `missionSkills` read the rows
// as `makeScenario` of the pilots does (`scripts/dilemmaBotPileScenarios.ts`).

/** A personnel row of the card data, lowercased by `parseCardData`, as the pile bot reads it. */
export type PilePersonnelRow = Parameters<typeof pilePersonnelOf>[0] & { type?: string };

/** Any other row, as the builder reads it. */
export interface PileCardRow extends AttemptedMission {
  type?: string;
  name?: string;
  originalName?: string;
  skills?: string | number;
  keywords?: string | number;
  span?: string | number;
  cunning?: string | number;
  range?: string | number;
  weapons?: string | number;
  shields?: string | number;
}

type Row = PileCardRow | null | undefined;

/** What the table hands the builder. */
export interface PileTableInput {
  /** The attempting cards: the away team, or the crew of the attempting ship. */
  cards: ReadonlyArray<{ card: PilePersonnelRow | null | undefined; stopped?: boolean }>;
  /** The attempted mission's row. */
  mission: Row;
  /** The attempting ship's row, at a space mission. */
  ship?: Row;
  /** The rows placed on the attempted mission. */
  placedOn: ReadonlyArray<Row>;
  /** The rows beneath the attempted mission. */
  underMission: ReadonlyArray<Row>;
  /** Every mission slot of the table. */
  missions: ReadonlyArray<{ mission: Row; completed?: boolean }>;
  hand: ReadonlyArray<Row>;
  discard: ReadonlyArray<Row>;
  turn: number;
  facts?: BotTableFacts;
  /** The bot's side (#1520): the affiliations of its deck's personnel. Absent: unknown, as for the Chula pile. */
  botAffiliations?: string[];
}

const GAME = 'Chula: The Game';

const titleOf = (row: Row): string | null => (row?.originalName ? pileTitleOf(row.originalName) : null);

/** The skill indexes a mission's requirements name, over every branch. */
const skillsOf = (branches: RequirementBranch[]) => Array.from(new Set(branches.flatMap((b) => b.skills.flatMap((n, i) => (n ? [i] : [])))));

/**
 * The `PileAttempt` of an attempt on the table: the unstopped personnel of `cards` (equipment and every
 * other type left out), each with the gains it has at the mission, the requirements, the mission, the
 * ship at a space mission, the player's table, and the copies of Chula: The Game placed on the mission.
 * `random` is true when the requirements cannot be read: the caller then chooses a legal stack at
 * random, and the attempt, with no requirements, still gives the costs and the kind of the mission.
 */
export function pileAttemptOf(input: PileTableInput): { attempt: PileAttempt; random: boolean } {
  const mission: PileCardRow = input.mission ?? {};
  const requirements = parseRequirementBranches(String(mission.skills ?? ''));
  const attempted = attemptedMissionOf(mission);
  const kind = mission.missiontype === 's' ? 'space' : 'planet';
  const ship: PileShip | undefined =
    kind === 'space' && input.ship
      ? {
          name: String(input.ship.originalName ?? ''),
          range: Number(input.ship.range) || 0,
          weapons: Number(input.ship.weapons) || 0,
          shields: Number(input.ship.shields) || 0,
        }
      : undefined;
  const slots = input.missions.filter((s): s is { mission: PileCardRow; completed?: boolean } => !!s.mission);
  const completed = slots.filter((s) => s.completed);
  const copies = new Map<string, number>();
  for (const title of input.discard.map(titleOf)) if (title) copies.set(title, (copies.get(title) ?? 0) + 1);
  const attempt: PileAttempt = {
    ...partnerGroupOf(
      input.cards
        .filter((c): c is { card: PilePersonnelRow; stopped?: boolean } => c.card?.type === 'personnel' && !c.stopped)
        .map((c) => pilePersonnelOf(c.card, attempted, input.facts)),
    ),
    requirements: requirements ?? [],
    mission: {
      kind,
      points: Number(mission.points) || 0,
      span: Number(mission.span) || 0,
      nebula: /nebula/.test(String(mission.keywords ?? '').toLowerCase()) || /nebula/.test(String(mission.name ?? '').toLowerCase()),
    },
    ship,
    table: {
      headquarters: slots.filter((s) => s.mission.missiontype === 'h').length,
      completedMissions: completed.length,
      completedSpaceMission: completed.some((s) => s.mission.missiontype === 's'),
      handSize: input.hand.length,
      handHasCunning7Or11: input.hand.some((row) => row?.type === 'personnel' && [7, 11].includes(Number(row.cunning))),
      discardCopiesMax: Math.max(0, ...copies.values()),
      missionSkills: slots
        .filter((s) => s.mission.missiontype !== 'h')
        .flatMap((s) => {
          const branches = parseRequirementBranches(String(s.mission.skills ?? ''));
          return branches ? [skillsOf(branches)] : [];
        }),
      underMission: input.underMission.map(titleOf).filter((t): t is string => t !== null),
      turn: input.turn,
    },
    gameOnMission: input.placedOn.filter((row) => titleOf(row) === GAME).length,
    choice: 'best',
    ...(input.botAffiliations ? { botAffiliations: [...input.botAffiliations] } : {}),
  };
  return { attempt, random: !requirements };
}

/** The title of each drawn row, in draw order, duplicates included. A row with no name is left out. */
export function drawnPileTitles(drawn: ReadonlyArray<Row>): string[] {
  return drawn.map(titleOf).filter((t): t is string => t !== null);
}

/**
 * The map back from the bot's stack of titles to the drawn cards: each title of `stack`, in order,
 * takes the first drawn card of that title not taken yet. Returns the ids of the cards taken, in stack
 * order. A title with no drawn card left is skipped.
 */
export function pileStackCardIds(drawn: ReadonlyArray<{ id: string; card: Row }>, stack: ReadonlyArray<string>): string[] {
  const taken = new Set<string>();
  const ids: string[] = [];
  for (const title of stack) {
    const found = drawn.find((c) => !taken.has(c.id) && titleOf(c.card) === title);
    if (!found) continue;
    taken.add(found.id);
    ids.push(found.id);
  }
  return ids;
}

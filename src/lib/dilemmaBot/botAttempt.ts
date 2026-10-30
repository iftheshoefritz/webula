import { dilemmaIdOf } from './chulaPile';
import { DilemmaId } from './opponentPile';
import { parseRequirementBranches } from './requirements';
import { AttemptedMission, attemptedMissionOf } from './gains';
import { BotAttempt, botPersonnelOf, partnerGroupOf } from './simulator';

// The pure inputs of a bot attempt on the practice table (#1298). They read card rows and flags, not
// the table, so this file imports nothing from the practice table: the page hands it the cards.

/** A card row of the card data, lowercased by `parseCardData`, as the bot reads it. */
export type BotCardRow = Parameters<typeof botPersonnelOf>[0] & { type?: string; collectorsinfo?: string };

/** An attempting card: its row, and whether it is stopped. */
export interface BotAttemptingCard {
  card: BotCardRow | null | undefined;
  stopped?: boolean;
}

/** The marker of a mission whose requirements the bot cannot read: the caller chooses at random. */
export const RANDOM_CHOICE = 'random';

/**
 * The `BotAttempt` of an attempt on the table: the unstopped personnel of `cards` (equipment and every
 * other type left out), each with the gains it has at `mission`, the requirements of `mission`, and
 * the copies of Chula: The Game in `placedOn`, the rows placed on the mission. The partner gains are
 * settled against the group as the attempt starts, and kept live for `playStack` (`partnerGroupOf`). `RANDOM_CHOICE` when the requirements cannot be read.
 */
export function botAttemptOf(
  cards: ReadonlyArray<BotAttemptingCard>,
  mission: { skills?: string | number } & AttemptedMission,
  placedOn: ReadonlyArray<{ collectorsinfo?: string } | null | undefined>
): BotAttempt | typeof RANDOM_CHOICE {
  const requirements = parseRequirementBranches(String(mission.skills ?? ''));
  if (!requirements) return RANDOM_CHOICE;
  const attempted = attemptedMissionOf(mission);
  return {
    ...partnerGroupOf(
      cards
        .filter((c): c is { card: BotCardRow; stopped?: boolean } => c.card?.type === 'personnel' && !c.stopped)
        .map((c) => botPersonnelOf(c.card, attempted)),
    ),
    requirements,
    gameOnMission: placedOn.filter((row) => dilemmaIdOf(row) === 'game').length,
    choice: 'best',
  };
}

/** The `DilemmaId` of each drawn row, in draw order, duplicates included. A row with none is left out. */
export function drawnDilemmaIds(drawn: ReadonlyArray<{ collectorsinfo?: string } | null | undefined>): DilemmaId[] {
  return drawn.map(dilemmaIdOf).filter((id): id is DilemmaId => id !== null);
}

/**
 * The map back from the bot's stack to the drawn cards: each id of `stack`, in order, takes the first
 * drawn card of that id not taken yet. Returns the ids of the cards taken, in stack order. An id with
 * no drawn card left is skipped.
 */
export function stackCardIds(
  drawn: ReadonlyArray<{ id: string; card: { collectorsinfo?: string } | null | undefined }>,
  stack: ReadonlyArray<DilemmaId>
): string[] {
  const taken = new Set<string>();
  const ids: string[] = [];
  for (const dilemma of stack) {
    const found = drawn.find((c) => !taken.has(c.id) && dilemmaIdOf(c.card) === dilemma);
    if (!found) continue;
    taken.add(found.id);
    ids.push(found.id);
  }
  return ids;
}

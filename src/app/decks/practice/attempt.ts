// The rules of the Attempt button (#1163), kept pure so the tests cover every mission type without
// a render. The table enforces nothing once an attempt starts: these only decide where the button
// shows and what the popup's two numbers start at.

import {
  Attempt,
  CardInstance,
  findInstanceAnywhere,
  FIXTURE_DILEMMA_STACK,
  FIXTURE_SHIP_SLOT,
  TableAction,
  TableState,
} from './tableReducer';

// The panel the Attempt button would sit in: a mission's away team, or a ship's crew.
export type AttemptPanel = { kind: 'awayTeam'; missionIndex: number } | { kind: 'crew'; shipId: string };

// The cards of the panel at its mission, or null when the panel cannot attempt there: a ship off
// the ship rows, a ship at a mission that is not a space mission, an away team at a mission that is
// not a planet mission. `parseCardData` lower-cases the card data, so `missiontype` is `s`, `p` or `h`.
function attemptCards(table: TableState, panel: AttemptPanel): { missionIndex: number; cards: CardInstance[] } | null {
  if (panel.kind === 'awayTeam') {
    const slot = table.missions[panel.missionIndex];
    if (slot?.mission?.card?.missiontype !== 'p') return null;
    return { missionIndex: panel.missionIndex, cards: slot.awayTeam };
  }
  const found = findInstanceAnywhere(table, panel.shipId);
  if (!found || typeof found.zone === 'string' || found.zone.zone !== 'shipRow') return null;
  const missionIndex = found.zone.missionIndex;
  if (table.missions[missionIndex]?.mission?.card?.missiontype !== 's') return null;
  return { missionIndex, cards: found.instance.crew ?? [] };
}

const unstoppedPersonnel = (cards: CardInstance[]): number =>
  cards.filter((c) => c.card?.type === 'personnel' && !c.stopped).length;

// Whether the panel shows the Attempt button: no attempt in progress, a mission card of the right
// type that is not completed, and at least one unstopped personnel in the panel.
export function canAttempt(table: TableState, panel: AttemptPanel): boolean {
  if (table.attempt) return false;
  const found = attemptCards(table, panel);
  if (!found || table.missions[found.missionIndex].completed) return false;
  return unstoppedPersonnel(found.cards) > 0;
}

// The popup's two numbers, as they start: the unstopped personnel of the panel (equipment and
// stopped personnel left out), and the dilemmas under the mission. Null when the panel cannot attempt.
export function attemptDefaults(
  table: TableState,
  panel: AttemptPanel
): { missionIndex: number; shipId?: string; personnel: number; subtract: number } | null {
  const found = attemptCards(table, panel);
  if (!found) return null;
  return {
    missionIndex: found.missionIndex,
    ...(panel.kind === 'crew' ? { shipId: panel.shipId } : {}),
    personnel: unstoppedPersonnel(found.cards),
    subtract: table.missions[found.missionIndex].underMission.length,
  };
}

// The attempt of `/decks/practice?fixture=attempt` (#1169): the `startAttempt` that Start in the
// popup would dispatch, with its default numbers, for the crew of the ship the piles deal puts at
// Bilana System. `table` is the table `resetWithPiles` dealt. Null when that deal has no ship there.
export function fixtureAttempt(table: TableState): Extract<TableAction, { type: 'startAttempt' }> | null {
  const ship = table.missions[FIXTURE_SHIP_SLOT]?.ships[0];
  if (!ship) return null;
  const defaults = attemptDefaults(table, { kind: 'crew', shipId: ship.id });
  return defaults ? { type: 'startAttempt', ...defaults } : null;
}

// The dilemma stack of `/decks/practice?fixture=attempt` (#1170): the moves of the top
// `FIXTURE_DILEMMA_STACK` dilemmas of the pile into the stack, in pile order. They land face down,
// as the stack takes them. `resetWithPiles` deals no stack, since the stack holds cards only during
// an attempt, so the attempt fixture fills it once the attempt has started.
export function fixtureAttemptStack(table: TableState): Extract<TableAction, { type: 'move' }>[] {
  return table.dilemmaPile
    .slice(0, FIXTURE_DILEMMA_STACK)
    .map((c) => ({ type: 'move', id: c.id, to: 'dilemmaStack' }));
}

// The key of the view of an attempt (#1164, #1189): its identity, the mission and the ship, and not
// its phase or its count, so a change of either keeps the full table the player chose. Null with no
// attempt in progress.
export function attemptViewKey(attempt: Attempt | undefined): string | null {
  return attempt ? JSON.stringify([attempt.missionIndex, attempt.shipId ?? null]) : null;
}

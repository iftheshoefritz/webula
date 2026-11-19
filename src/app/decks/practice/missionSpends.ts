// The missions whose text lets the player spend counters on an action (#1754), by whole title, every
// version of each. The table only reads what a spend may do here; `gameReducer` checks it again and
// makes the one log entry (`missionSpend` in `gameLog.ts`).
//
// Earth, Lush and Beautiful Home: "When you play a [TOS] card here, you may spend a counter to draw two
// cards. You may do this only once each turn." `earthSpendOf` (in `gameLog.ts`, since it reads the log)
// offers it after a play of a [TOS] card into Earth's away team or onto Earth's mission card, never into
// a crew at Earth, until it is used that turn.
//
// Nimbus III, Staff Backwater Embassy: "While you do not command {Unicomplex}, you may spend three
// counters to download {Caithlin Dar}, {Korrd}, or {St. John Talbot} and place him or her on this
// planet." The table looks for Unicomplex in the player's five mission slots only.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import type { CardInstance, TableState } from './tableReducer';

export const EARTH_TITLE = 'Earth Lush and Beautiful Home';
export const NIMBUS_TITLE = 'Nimbus III Staff Backwater Embassy';
export const NIMBUS_PERSONNEL = ['Caithlin Dar', 'Korrd', 'St. John Talbot'] as const;

export const EARTH_SPEND_COST = 1;
export const EARTH_SPEND_DRAW = 2;
export const NIMBUS_SPEND_COST = 3;

export type MissionSpendKind = 'earth' | 'nimbus';

/** The title (`cardTitleOf`) of the mission at slot `index`, or ''. */
export const slotMissionTitle = (table: TableState, index: number): string => {
  const mission = table.missions[index]?.mission;
  return mission?.card ? cardTitleOf(cardDisplayName(mission.card)) : '';
};

/** The slots whose mission has the title `title`, in slot order. */
export const slotsTitled = (table: TableState, title: string): number[] =>
  table.missions.flatMap((_, i) => (slotMissionTitle(table, i) === title ? [i] : []));

const startsWithName = (title: string, name: string): boolean => title === name || title.startsWith(`${name} `);

/** Whether `card` is a version of Caithlin Dar, Korrd or St. John Talbot. */
export const isNimbusPersonnel = (card: CardInstance): boolean => {
  if (!card.card || String(card.card.type ?? '').toLowerCase() !== 'personnel') return false;
  const title = cardTitleOf(cardDisplayName(card.card));
  return NIMBUS_PERSONNEL.some((name) => startsWithName(title, name));
};

/** Whether a mission slot of the player's holds a Unicomplex. */
export const commandsUnicomplex = (table: TableState): boolean =>
  table.missions.some((_, i) => startsWithName(slotMissionTitle(table, i), 'Unicomplex'));

export interface NimbusSpend {
  slot: number;
  /** The first copy of each title in the draw deck, in the draw deck's order. */
  candidates: { id: string; name: string }[];
}

/**
 * What Nimbus III offers now (#1754), or null: in play and draw, while Nimbus III is in a slot (the first
 * one), no slot holds a Unicomplex, and the draw deck holds one of the three personnel.
 */
export function nimbusSpendOf(table: TableState): NimbusSpend | null {
  if (table.segment !== 'playAndDraw') return null;
  const slot = slotsTitled(table, NIMBUS_TITLE)[0];
  if (slot === undefined || commandsUnicomplex(table)) return null;
  const seen = new Set<string>();
  const candidates = table.drawDeck.flatMap((c) => {
    if (!isNimbusPersonnel(c)) return [];
    const name = cardDisplayName(c.card!);
    const title = cardTitleOf(name);
    if (seen.has(title)) return [];
    seen.add(title);
    return [{ id: c.id, name }];
  });
  return candidates.length ? { slot, candidates } : null;
}

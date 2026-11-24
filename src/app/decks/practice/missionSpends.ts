// The missions whose text lets the player spend counters on an action (#1754), by whole title, every
// version of each: the `spend` abilities of the mission registry (#1907). The table only reads what a spend may do here; `gameReducer` checks it again and
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
import type { DownloadStep, DrawStep } from '../../../lib/effectSteps';
import { missionModelsWith, type MissionSpendKind } from '../../../lib/missionModels';
import { commands, missions, type PlayTest } from '../../../lib/tableView';
import type { CardInstance, TableState } from './tableReducer';
import { tableViewOf } from './tableView';

// Each spend is the `spend` ability of its row in the mission registry (#1907).
const spendOf = (kind: MissionSpendKind) => missionModelsWith('spend').find(({ ability }) => ability.spend.kind === kind)!;
const EARTH = spendOf('earth');
const NIMBUS = spendOf('nimbus');
const NIMBUS_DOWNLOAD = NIMBUS.ability.spend.steps.find((s): s is DownloadStep => s.kind === 'download')!;
const EARTH_DRAW = EARTH.ability.spend.steps.find((s): s is DrawStep => s.kind === 'draw')!;

export const EARTH_TITLE = EARTH.model.title;
export const NIMBUS_TITLE = NIMBUS.model.title;
export const NIMBUS_PERSONNEL: readonly string[] = NIMBUS_DOWNLOAD.of.kind === 'test' ? (NIMBUS_DOWNLOAD.of.test[0]?.titles ?? []) : [];

export const EARTH_SPEND_COST = EARTH.ability.spend.counters;
/** Earth's "only once each turn" (#1834). */
export const EARTH_SPEND_LIMIT = EARTH.ability.spend.limit;
export const EARTH_SPEND_DRAW = EARTH_DRAW.count.kind === 'fixed' ? EARTH_DRAW.count.count : 0;
export const NIMBUS_SPEND_COST = NIMBUS.ability.spend.counters;

/** The icon of the card whose play at Earth offers its spend, "[tos]". */
export const EARTH_PLAY_TEST: PlayTest =
  EARTH.ability.spend.condition.kind === 'playedHereThisTurn' ? EARTH.ability.spend.condition.play : {};

export type { MissionSpendKind };

/** The slots whose mission has the title `title`, in slot order. */
export const slotsTitled = (table: TableState, title: string): number[] => missions(tableViewOf(table), { title }).map((m) => m.index);

const startsWithName = (title: string, name: string): boolean => title === name || title.startsWith(`${name} `);

/** Whether `card` is a version of Caithlin Dar, Korrd or St. John Talbot. */
export const isNimbusPersonnel = (card: CardInstance): boolean => {
  if (!card.card || String(card.card.type ?? '').toLowerCase() !== 'personnel') return false;
  const title = cardTitleOf(cardDisplayName(card.card));
  return NIMBUS_PERSONNEL.some((name) => startsWithName(title, name));
};

/** "You command {Unicomplex}": a mission slot of the player's holds a Unicomplex. */
const UNICOMPLEX_TITLE = NIMBUS.ability.spend.condition.kind === 'notCommanding' ? NIMBUS.ability.spend.condition.title : 'Unicomplex';
const UNICOMPLEX = commands({ of: 'missions', titled: UNICOMPLEX_TITLE }, UNICOMPLEX_TITLE);

/** Whether a mission slot of the player's holds a Unicomplex. */
export const commandsUnicomplex = (table: TableState): boolean => UNICOMPLEX.holds(tableViewOf(table));

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

// The play rules the table checks and warns about (#1821): uniqueness, and "(limit one per mission)" and
// "(limit one per ship)". The table enforces neither: a move that breaks one still lands, and the page
// stamps the warnings on the action (`withShuffleOrders` in `gameLog.ts`) only while the setting "Check
// uniqueness and limits" is on, so the reducer reads no storage.
import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { inPlay } from '../../../lib/tableView';
import { findInstanceAnywhere, type CardInstance, type MoveTarget, type TableState, type TableZone } from './tableReducer';
import { tableViewOf } from './tableView';

export type RuleWarning =
  | { rule: 'unique'; title: string }
  | { rule: 'limitPerMission'; title: string; place: string }
  | { rule: 'limitPerShip'; title: string; place: string };

// The title two cards share when they are one card for the rules: the persona of the rulebook, so "Data"
// and "Data *VP" conflict. The card data's `Name` holds the subtitle too, so two personas of one
// personnel with different subtitles ("Kira Nerys Reformed Collaborator", "Kira Nerys Hero of Bajor")
// read as two titles: a known gap.
const titleKey = (card: any): string => cardTitleOf(cardDisplayName(card ?? {}) ?? '').toLowerCase();

const titleOf = (card: any): string => cardTitleOf(cardDisplayName(card ?? {}) ?? '');

export const isUniqueCard = (card: any): boolean => String(card?.unique ?? '').toLowerCase() === 'y';

const LIMIT_PER_MISSION = '(limit one per mission)';
const LIMIT_PER_SHIP = '(limit one per ship)';

const gametextOf = (card: any): string => String(card?.gametext ?? '').toLowerCase();

export const limitsOnePerMission = (card: any): boolean => gametextOf(card).includes(LIMIT_PER_MISSION);
export const limitsOnePerShip = (card: any): boolean => gametextOf(card).includes(LIMIT_PER_SHIP);

// Every card the player has in play, as `inPlay` of the table view reads it (#1877): never the brig, whose
// owner the table does not know (a known gap).
export const inPlayCards = (table: TableState): CardInstance[] =>
  inPlay(tableViewOf(table)).flatMap((c) => findInstanceAnywhere(table, c.id)?.instance ?? []);

// The card a placement lands on, for the limits: a mission card or a ship, by its name.
function placedOnTarget(table: TableState, zone: TableZone | MoveTarget): { kind: 'mission' | 'ship'; card: CardInstance } | null {
  if (typeof zone === 'string' || zone.zone !== 'on') return null;
  const mission = table.missions.find((slot) => slot.mission?.id === zone.targetId)?.mission;
  if (mission) return { kind: 'mission', card: mission };
  const ship = table.missions.flatMap((slot) => slot.ships).find((s) => s.id === zone.targetId);
  return ship ? { kind: 'ship', card: ship } : null;
}

/**
 * The rules a move of `instance` to `landed` breaks, read from `table` before the move. `play` is whether
 * the move is a play (a charged move, #1606): only a play checks uniqueness, against the other cards in
 * play of the same title. A placement on a mission card or a ship, played or not (a dilemma by hand or by
 * the bot's Resolve too), checks its limit against the cards already on that card. A card is never
 * compared with itself, so a move within the table that keeps it on its card warns of nothing.
 */
export function ruleWarningsOf(table: TableState, instance: CardInstance, landed: TableZone | MoveTarget, play: boolean): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const key = titleKey(instance.card);
  const title = titleOf(instance.card);
  if (play && isUniqueCard(instance.card) && inPlay(tableViewOf(table)).some((c) => c.id !== instance.id && c.title.toLowerCase() === key)) {
    warnings.push({ rule: 'unique', title });
  }
  const target = placedOnTarget(table, landed);
  if (target) {
    const limited = target.kind === 'mission' ? limitsOnePerMission(instance.card) : limitsOnePerShip(instance.card);
    const held = (target.card.placedOn ?? []).some((c) => c.id !== instance.id && titleKey(c.card) === key);
    if (limited && held) {
      warnings.push({
        rule: target.kind === 'mission' ? 'limitPerMission' : 'limitPerShip',
        title,
        place: cardDisplayName(target.card.card ?? {}),
      });
    }
  }
  return warnings;
}

export function ruleWarningText(warning: RuleWarning): string {
  switch (warning.rule) {
    case 'unique':
      return `Unique: ${warning.title} is already in play`;
    case 'limitPerMission':
      return `Limit one per mission: ${warning.title} is already on ${warning.place}`;
    case 'limitPerShip':
      return `Limit one per ship: ${warning.title} is already on ${warning.place}`;
  }
}

// The warnings of a saved entry, with any malformed one left out.
export function isRuleWarning(value: unknown): value is RuleWarning {
  const w = value as RuleWarning | null | undefined;
  if (!w || typeof w.title !== 'string') return false;
  if (w.rule === 'unique') return true;
  return (w.rule === 'limitPerMission' || w.rule === 'limitPerShip') && typeof w.place === 'string';
}

export const ruleWarningsIn = (value: unknown): RuleWarning[] => (Array.isArray(value) ? value.filter(isRuleWarning) : []);

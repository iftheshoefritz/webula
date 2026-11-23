// The missions that change the opponent's dilemma draw and spend as an attempt there begins (#1759):
// Class 9 Nebula Bypass Disputed Region, Mouth of the Wormhole Form Labor Union and Rigel X Locate
// Mysterious Contact, and Caldos IV Upgrade Colony's download (#1828), the `onAttemptStart` abilities of the
// mission registry (#1907). Pure: the popup reads it with the mission card, the cards `attemptCards` finds
// and the slot, and the reducer never does. A mission is named by its whole title, so the bare "Mouth of the
// Wormhole" of the two headquarters gets nothing.
import { cardTitleOf } from '../../../lib/cardTitle';
import { abilityOf, missionModelOf, missionModelsWith, type AttemptCondition } from '../../../lib/missionModels';
import { attemptingHolds } from '../../../lib/tableView';
import type { CardInstance } from './tableReducer';

/** A change of the draw and the spend, named by its mission, "Class 9 Nebula". */
export interface AttemptMissionChange {
  source: string;
  draw: number;
  spend: number;
}

/** A change the player may take, a toggle of the popup: "Spend −1", or "Draw 2 cards". */
export interface AttemptMissionOffer extends AttemptMissionChange {
  key: string;
  label: string;
  // The cards the player draws into the hand, free, when they take it (Rigel X).
  drawCards?: number;
  // The card of the draw deck the player downloads into the hand when they take it (Caldos IV).
  downloadId?: string;
}

export interface AttemptMissionRules {
  auto?: AttemptMissionChange;
  offers: AttemptMissionOffer[];
}

const NONE: AttemptMissionRules = { offers: [] };

// The fewest involved personnel for Rigel X and for Mouth of the Wormhole's Dabo Girls and Waiters.
export const ATTEMPT_MISSION_MIN_PERSONNEL = 6;

// The card data is lowercased; the keywords read "dabo girl. dissident.".
const keywordsOf = (card: { keywords?: string } | undefined): string[] =>
  typeof card?.keywords === 'string' ? card.keywords.split('.').map((k) => k.trim().toLowerCase()).filter(Boolean) : [];

/** The cards of the attempted slot and the draw deck, for the rules that read more than the personnel. */
export interface AttemptMissionPlace {
  underMission: CardInstance[];
  drawDeck: CardInstance[];
  /** The mission cards of the player's slots, for an ability of every attempt (#1908, Alpha 5 Approach). */
  missions?: ({ name?: string; originalName?: string } | undefined)[];
}

const titleOf = (card: { name?: string; originalName?: string } | undefined): string =>
  cardTitleOf(String(card?.originalName ?? card?.name ?? '')).toLowerCase();

const RULES = missionModelsWith('onAttemptStart');

// Caldos IV's download, named in braces on the card: it has no card in the card data yet.
export { HOWARD_HEIRLOOM_CANDLE as CALDOS_IV_DOWNLOAD } from '../../../lib/missionModels';

/** The missions with a rule here, by whole title, lowercased (#1759): the model backlog reads it. */
export const ATTEMPT_MISSION_TITLES: ReadonlySet<string> = new Set(RULES.map(({ model }) => model.title.toLowerCase()));

// Whether the condition of an ability holds for the unstopped personnel `personnel` and the slot `place`.
function conditionHolds(condition: AttemptCondition, personnel: CardInstance[], place: AttemptMissionPlace): boolean {
  if (condition.kind === 'noDilemmasBeneath') return !place.underMission.some((c) => c.card?.type === 'dilemma');
  const attempting = personnel.map((c) => ({ affiliation: String(c.card?.affiliation ?? ''), keywords: keywordsOf(c.card) }));
  return attemptingHolds(attempting, condition.query);
}

// Two automatic changes are one: their sources joined, their numbers summed.
const mergeChanges = (changes: AttemptMissionChange[]): AttemptMissionChange | undefined =>
  changes.length
    ? { source: changes.map((c) => c.source).join(', '), draw: changes.reduce((n, c) => n + c.draw, 0), spend: changes.reduce((n, c) => n + c.spend, 0) }
    : undefined;

// The changes of the attempted mission's own ability, `mission` its card.
function ownRules(mission: { name?: string; originalName?: string } | undefined, personnel: CardInstance[], place: AttemptMissionPlace): AttemptMissionRules {
  const name = mission?.originalName ?? mission?.name;
  if (typeof name !== 'string') return NONE;
  const model = missionModelOf(name);
  const ability = abilityOf(model, 'onAttemptStart');
  if (!model || !ability || ability.anywhere) return NONE;
  if (!conditionHolds(ability.condition, personnel, place)) return NONE;
  const { draw, spend, offer } = ability.change;
  const source = model.label;
  if (!offer) return { auto: { source, draw, spend }, offers: [] };
  // A download takes the top-most copy of the draw deck, and is no offer without one.
  const copy = offer.download ? place.drawDeck.find((c) => titleOf(c.card) === offer.download!.toLowerCase()) : undefined;
  if (offer.download && !copy) return NONE;
  return {
    offers: [
      {
        key: offer.key,
        label: offer.label,
        source,
        draw,
        spend,
        ...(offer.drawCards ? { drawCards: offer.drawCards } : {}),
        ...(copy ? { downloadId: copy.id } : {}),
      },
    ],
  };
}

// The automatic changes of the abilities of every attempt, of the missions of the player's slots, each title once.
function anywhereChanges(personnel: CardInstance[], place: AttemptMissionPlace): AttemptMissionChange[] {
  const seen = new Set<string>();
  return (place.missions ?? []).flatMap((card) => {
    const model = missionModelOf(card?.originalName ?? card?.name);
    const ability = abilityOf(model, 'onAttemptStart');
    if (!model || !ability?.anywhere || seen.has(model.title) || !conditionHolds(ability.condition, personnel, place)) return [];
    seen.add(model.title);
    return [{ source: model.label, draw: ability.change.draw, spend: ability.change.spend }];
  });
}

/**
 * The changes of the attempted mission: `mission` the mission card, `involved` the away team or the
 * crew, and those of the missions of `place.missions` whose ability changes every attempt. Only the
 * unstopped personnel count, the ones the popup counts.
 */
export function attemptMissionRules(
  mission: { name?: string; originalName?: string } | undefined,
  involved: CardInstance[],
  place: AttemptMissionPlace = { underMission: [], drawDeck: [] }
): AttemptMissionRules {
  const personnel = involved.filter((c) => c.card?.type === 'personnel' && !c.stopped);
  const own = ownRules(mission, personnel, place);
  const anywhere = anywhereChanges(personnel, place);
  if (!anywhere.length) return own;
  const auto = mergeChanges([...(own.auto ? [own.auto] : []), ...anywhere]);
  return { ...(auto ? { auto } : {}), offers: own.offers };
}

/** Whether a change changes the draw or the spend; Caldos IV's download changes neither. */
export const changesNumbers = (change: AttemptMissionChange): boolean => change.draw !== 0 || change.spend !== 0;

/** The text of a change, "Class 9 Nebula: draw −1, spend −1", for the popup and the log. */
export function attemptChangeText(change: AttemptMissionChange): string {
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  const parts = [
    ...(change.draw ? [`draw ${signed(change.draw)}`] : []),
    ...(change.spend ? [`spend ${signed(change.spend)}`] : []),
  ];
  return `${change.source}: ${parts.join(', ')}`;
}

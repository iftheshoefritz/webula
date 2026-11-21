// The missions that change the opponent's dilemma draw and spend as an attempt there begins (#1759):
// Class 9 Nebula Bypass Disputed Region, Mouth of the Wormhole Form Labor Union and Rigel X Locate
// Mysterious Contact, and Caldos IV Upgrade Colony's download (#1828). Pure: the popup reads it with the
// mission card, the cards `attemptCards` finds and the slot, and the reducer never does. A mission is named by its whole title, so the bare "Mouth of the
// Wormhole" of the two headquarters gets nothing.
import { cardTitleOf } from '../../../lib/cardTitle';
import { differentAffiliations } from '../../../lib/costModels/model';
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
const hasKeyword = (card: { keywords?: string } | undefined, keyword: string): boolean =>
  typeof card?.keywords === 'string' && card.keywords.split('.').some((k) => k.trim().toLowerCase() === keyword);

/** The cards of the attempted slot and the draw deck, for the rules that read more than the personnel. */
export interface AttemptMissionPlace {
  underMission: CardInstance[];
  drawDeck: CardInstance[];
}

// Caldos IV's download, named in braces on the card: it has no card in the card data yet.
export const CALDOS_IV_DOWNLOAD = 'Howard Heirloom Candle';

const titleOf = (card: { name?: string; originalName?: string } | undefined): string =>
  cardTitleOf(String(card?.originalName ?? card?.name ?? '')).toLowerCase();

const RULES: Record<string, (personnel: CardInstance[], place: AttemptMissionPlace) => AttemptMissionRules> = {
  'class 9 nebula bypass disputed region': (personnel) =>
    differentAffiliations(personnel.map((c) => String(c.card?.affiliation ?? ''))) === 1
      ? { auto: { source: 'Class 9 Nebula', draw: -1, spend: -1 }, offers: [] }
      : NONE,
  'mouth of the wormhole form labor union': (personnel) =>
    personnel.filter((c) => hasKeyword(c.card, 'dabo girl') || hasKeyword(c.card, 'waiter')).length >= ATTEMPT_MISSION_MIN_PERSONNEL
      ? { offers: [{ key: 'mouth-of-the-wormhole', label: 'Spend −1', source: 'Mouth of the Wormhole', draw: 0, spend: -1 }] }
      : NONE,
  'rigel x locate mysterious contact': (personnel) =>
    personnel.length >= ATTEMPT_MISSION_MIN_PERSONNEL
      ? { offers: [{ key: 'rigel-x', label: 'Draw 2 cards', source: 'Rigel X', draw: 1, spend: 1, drawCards: 2 }] }
      : NONE,
  // "When you begin a mission attempt here, if no dilemmas are beneath this mission, you may download
  // {Howard Heirloom Candle}." The top-most copy of the draw deck.
  'caldos iv upgrade colony': (_personnel, place) => {
    if (place.underMission.some((c) => c.card?.type === 'dilemma')) return NONE;
    const copy = place.drawDeck.find((c) => titleOf(c.card) === CALDOS_IV_DOWNLOAD.toLowerCase());
    return copy
      ? { offers: [{ key: 'caldos-iv', label: `Download ${CALDOS_IV_DOWNLOAD}`, source: 'Caldos IV', draw: 0, spend: 0, downloadId: copy.id }] }
      : NONE;
  },
};

/**
 * The changes of the attempted mission: `mission` the mission card, `involved` the away team or the
 * crew. Only the unstopped personnel count, the ones the popup counts.
 */
export function attemptMissionRules(
  mission: { name?: string; originalName?: string } | undefined,
  involved: CardInstance[],
  place: AttemptMissionPlace = { underMission: [], drawDeck: [] }
): AttemptMissionRules {
  const name = mission?.originalName ?? mission?.name;
  if (typeof name !== 'string') return NONE;
  const rule = RULES[cardTitleOf(name).toLowerCase()];
  if (!rule) return NONE;
  return rule(involved.filter((c) => c.card?.type === 'personnel' && !c.stopped), place);
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

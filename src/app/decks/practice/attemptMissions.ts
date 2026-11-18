// The missions that change the opponent's dilemma draw and spend as an attempt there begins (#1759):
// Class 9 Nebula Bypass Disputed Region, Mouth of the Wormhole Form Labor Union and Rigel X Locate
// Mysterious Contact. Pure: the popup reads it with the mission card and the cards `attemptCards`
// finds, and the reducer never does. A mission is named by its whole title, so the bare "Mouth of the
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

const RULES: Record<string, (personnel: CardInstance[]) => AttemptMissionRules> = {
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
};

/**
 * The changes of the attempted mission: `mission` the mission card, `involved` the away team or the
 * crew. Only the unstopped personnel count, the ones the popup counts.
 */
export function attemptMissionRules(mission: { name?: string; originalName?: string } | undefined, involved: CardInstance[]): AttemptMissionRules {
  const name = mission?.originalName ?? mission?.name;
  if (typeof name !== 'string') return NONE;
  const rule = RULES[cardTitleOf(name).toLowerCase()];
  if (!rule) return NONE;
  return rule(involved.filter((c) => c.card?.type === 'personnel' && !c.stopped));
}

/** The text of a change, "Class 9 Nebula: draw −1, spend −1", for the popup and the log. */
export function attemptChangeText(change: AttemptMissionChange): string {
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  const parts = [
    ...(change.draw ? [`draw ${signed(change.draw)}`] : []),
    ...(change.spend ? [`spend ${signed(change.spend)}`] : []),
  ];
  return `${change.source}: ${parts.join(', ')}`;
}

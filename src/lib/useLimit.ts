// The use limit of an ability (#1834): "You may do this only once each turn" and "(limit two per turn)" limit how
// often a card's ability is used. One field, shared by the order rows, the trigger rows, the mission spends and
// reveals, and the table uses of a play cost, and one reader of the log (`abilityUsesThisTurn` in `gameLog.ts`)
// that counts the uses of an ability this turn, so an undo gives a use back and the next turn starts again.
//
// It imports no React and no reducer.

/** At most `times` uses each turn. */
export interface UseLimit {
  per: 'turn';
  times: number;
}

/** At most `times` uses each turn, "(limit two per turn)". */
export const limitPerTurn = (times: number): UseLimit => ({ per: 'turn', times });

/** "You may do this only once each turn." */
export const ONCE_EACH_TURN: UseLimit = limitPerTurn(1);

/** Whether `limit` is a well-formed use limit, so a malformed save reads as no limit. */
export const isUseLimit = (limit: unknown): limit is UseLimit => {
  const l = limit as UseLimit | null | undefined;
  return !!l && l.per === 'turn' && typeof l.times === 'number' && Number.isInteger(l.times) && l.times >= 1;
};

/** Whether an ability used `uses` times this turn may be used again: always with no limit. */
export const withinUseLimit = (limit: UseLimit | undefined, uses: number): boolean => !limit || uses < limit.times;

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * The use limit a clause of card text states, or null: "only once each turn" and "only once per turn" are
 * `times: 1`, and so is "the first dilemma … each turn" (Sigma Iotia II); "(limit three per turn)" is `times: 3`.
 * "(limit two cards per turn)" limits cards, not uses, and is none.
 */
export function clauseUseLimit(text: string): UseLimit | null {
  const t = text.toLowerCase();
  if (/\bonly once (each|per) turn\b/.test(t) || /\bthe first\b[^.]*\beach turn\b/.test(t)) return ONCE_EACH_TURN;
  const m = /\(limit (\w+) (?:times )?per turn\)/.exec(t);
  if (!m) return null;
  const times = NUMBERS[m[1]] ?? (m[1] === 'once' ? 1 : m[1] === 'twice' ? 2 : Number(m[1]));
  return Number.isInteger(times) && times >= 1 ? limitPerTurn(times) : null;
}

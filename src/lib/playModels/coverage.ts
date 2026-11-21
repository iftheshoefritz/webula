import { PLAY_MODELS } from './index';
import { cardTitleOf } from '../cardTitle';
import { changesCost, CostCardRow } from '../costModels/coverage';

// The detection of the "when you play" effects of personnel and ships (#1801), and the coverage of a list of
// cards by the "when you play" registry (`PLAY_MODELS`): the backlog test reads it over the whole card data.
// A text whose "When you play this …" clause only changes the cost belongs to the cost registry
// (`changesCost`), not here.

/** The start of the clause: "When you play this personnel, …" or "When you play this ship, …". */
const PLAY_CLAUSE = /^When you play this (personnel|ship)\b/i;

/** A sentence that starts a trigger of its own, and so ends the clause before it. */
const NEW_TRIGGER = /^(Order|Interrupt|Response|When|Whenever|While|At the (start|end))\b/i;

/** The verbs of an effect that a cost change does not need: a draw, a download, a score, a card moved. */
const EFFECT_VERBS = /\b(draws?|downloads?|examine|scores?|shuffle|take|place|return|name)\b/i;

/**
 * The "When you play this personnel" or "this ship" clause of a game text, its sentence and the sentences
 * after it up to the next trigger ("Order - …", "When …", "While …"), or null for a text with none.
 */
export function playClauseOf(gametext: string): string | null {
  const sentences = gametext.split(/(?<=[.!?])\s+/);
  const start = sentences.findIndex((s) => PLAY_CLAUSE.test(s));
  if (start < 0) return null;
  const clause = [sentences[start]];
  for (const s of sentences.slice(start + 1)) {
    if (NEW_TRIGGER.test(s)) break;
    clause.push(s);
  }
  return clause.join(' ');
}

/**
 * Whether a game text has a "when you play" effect that does more than change the cost: its clause changes
 * no cost, or it changes one and also draws, downloads, scores or moves a card. A discard or a reveal that
 * only prices the play ("you may discard the top three cards of your deck to make this ship cost -2"), and
 * a sentence about the opponent that prices it ("your opponent may draw up to three cards"), stay with the
 * cost registry.
 */
export function hasPlayEffect(gametext: string): boolean {
  const clause = playClauseOf(gametext);
  if (clause === null) return false;
  if (!changesCost(clause)) return true;
  return clause
    .replace(PLAY_CLAUSE, '')
    .split(/(?<=[.!?])\s+/)
    .some((s) => !/\bopponents?\b/i.test(s) && EFFECT_VERBS.test(s));
}

/** Whether a card is a personnel or a ship with a "when you play" effect. */
export const isPlayEffectCard = (card: CostCardRow): boolean =>
  /^(personnel|ship)$/i.test(String(card.type)) && hasPlayEffect(String(card.gametext ?? ''));

/** The titles of the "when you play" registry. */
export const PLAY_MODEL_TITLES: ReadonlySet<string> = new Set(PLAY_MODELS.map((m) => m.title));

export type PlayModelCoverage = { modelled: string[]; missing: string[] };

/**
 * The "when you play" titles of `cards`, each once by `cardTitleOf`, split into those the registry models
 * and those it lacks, each sorted. Titles match in any case, as `playModelOf` does. A title of the registry
 * counts as modelled even when its text is not detected.
 */
export function playModelCoverage(
  cards: CostCardRow[],
  registry: ReadonlySet<string> = PLAY_MODEL_TITLES
): PlayModelCoverage {
  const known = new Set([...registry].map((t) => t.toLowerCase()));
  const has = (title: string) => known.has(title.toLowerCase());
  const titles = new Set<string>();
  for (const c of cards) {
    const title = cardTitleOf(c.name);
    if (has(title) || isPlayEffectCard(c)) titles.add(title);
  }
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  return { modelled: sorted.filter(has), missing: sorted.filter((t) => !has(t)) };
}

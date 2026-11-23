import { cardTitleOf } from './cardTitle';
import { changesCost } from './costModels/coverage';
import { hasPlayEffect } from './playModels/coverage';

// The unified model backlog (#1861): every card text of the shipped decks, split into clauses, each clause filed
// under the gameplay concern that would model it, and checked against the registry of that concern. The
// per-registry backlogs (`costModelBacklog`, `playModelBacklog`) each see one concern; this one shows a
// card's every clause, so "fully modelled" means every clause and "within reach" means every missing
// clause has a registry to go in. Pure: the caller passes the cards, the decks and the registries.

/**
 * The gameplay concerns a clause of card text falls under. The first eight have a registry today; the
 * rest have none, so a clause of theirs needs a new home before any card of theirs can be modelled.
 */
export type Concern =
  | 'dilemma' // the dilemma registry of the pile bot (`dilemmaBot/pile`)
  | 'cost' // the cost registry: a cost change, a counter grant (`costModels`)
  | 'whenPlayed' // "When you play this personnel/ship" (`playModels`)
  | 'eventResolve' // an event that resolves when played (`resolveModels`)
  | 'attributes' // a change to Integrity, Cunning, Strength, Weapons, Shields, Range or span
  | 'mission' // a mission's own text: completion, attempt, spend, dilemma cost, prevention
  | 'place' // "you may play … here" or "aboard": where a card may be played (`playPlaces`)
  | 'order' // "Order - …": an action the player takes (`orderModels`)
  | 'trigger' // "When …", "Whenever …", "At the start/end …", "Response - …"
  | 'ongoing' // a standing rule with no trigger
  | 'interrupt'; // an interrupt card's text

export const CONCERNS: Concern[] = ['dilemma', 'cost', 'whenPlayed', 'eventResolve', 'attributes', 'mission', 'place', 'order', 'trigger', 'ongoing', 'interrupt'];

/** The concerns with a registry today. A clause of any other concern has no place to be modelled yet. */
export const CONCERNS_WITH_REGISTRY: ReadonlySet<Concern> = new Set<Concern>([
  'dilemma',
  'cost',
  'whenPlayed',
  'eventResolve',
  'attributes',
  'mission',
  'place',
  'order',
  'trigger',
  'interrupt',
]);

export interface CoverageCard {
  name: string;
  type: string;
  gametext: string;
}

export interface Clause {
  concern: Concern;
  text: string;
}

// A sentence ends at a stop, or at a stop inside a closing parenthesis: "(… each of your turns.) Order - …".
const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?]\)?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** A sentence that starts a trigger or an action of its own, and so starts a new clause. */
const CLAUSE_START = /^(Order|Interrupt|Response|When|Whenever|While|At the (start|end))\b/i;
/** Where an event or an equipment plays: placement, not an effect. */
const PLAYS_WHERE = /^Plays? (in|on)\b/i;
const WHEN_PLAYED = /^When you play this (personnel|ship)\b/i;
/** A place a card may be played, as `playPlaces` reads it. */
const PLAY_PLACE = /\byou may play\b/i;
const ATTRIBUTE_NAMES = '(integrity|cunning|strength|weapons|shields|range|span|attributes?)';
/** "Strength +2", "all attributes +1", "is Range +2", "+2 Cunning". */
const ATTRIBUTE_CHANGE = new RegExp(`\\b${ATTRIBUTE_NAMES}\\s+(is\\s+|are\\s+)?[+\\-−]\\s?\\d|[+\\-−]\\d\\s+${ATTRIBUTE_NAMES}\\b`, 'i');

/** The clauses of a text: a sentence that starts a trigger or an action begins one, the sentences after it join it. */
export function clauseTextsOf(gametext: string): string[] {
  const clauses: string[][] = [];
  for (const s of sentencesOf(gametext)) {
    if (PLAYS_WHERE.test(s)) continue;
    if (!clauses.length || CLAUSE_START.test(s)) clauses.push([s]);
    else clauses[clauses.length - 1].push(s);
  }
  return clauses.map((c) => c.join(' '));
}

/** Whether an event resolves when played: no "Plays in …" or "Plays on …" sentence, as `resolvesOnPlay` reads it. */
const eventResolves = (gametext: string): boolean => !sentencesOf(gametext).some((s) => PLAYS_WHERE.test(s));

/** The concern of one clause of a personnel, ship, equipment, placed event or core event. */
function concernOf(clause: string): Concern {
  if (WHEN_PLAYED.test(clause)) return hasPlayEffect(clause) ? 'whenPlayed' : 'cost';
  if (changesCost(clause)) return 'cost';
  if (PLAY_PLACE.test(clause)) return 'place';
  if (/^Order\b/i.test(clause)) return 'order';
  if (ATTRIBUTE_CHANGE.test(clause)) return 'attributes';
  if (CLAUSE_START.test(clause)) return 'trigger';
  return 'ongoing';
}

/** The clauses of a card, each with its concern. A card with no text has none. */
export function clausesOf(card: CoverageCard): Clause[] {
  const text = String(card.gametext ?? '').trim();
  if (!text) return [];
  const type = String(card.type).toLowerCase();
  if (type === 'dilemma') return [{ concern: 'dilemma', text }];
  // A cost sentence and a "you may play" sentence are clauses of their own in every type, so the cost
  // registry's part and the play-place model's part of a card show apart from the rest of its clause.
  const own = (s: string): Concern | null =>
    WHEN_PLAYED.test(s) ? null : changesCost(s) ? 'cost' : PLAY_PLACE.test(s) ? 'place' : null;
  const rest = (t: string): Concern =>
    type === 'mission' ? 'mission' : type === 'interrupt' ? 'interrupt' : type === 'event' && eventResolves(text) ? 'eventResolve' : concernOf(t);
  // Each sentence kept apart sits where it was; the rest of the clause sits at its first sentence.
  return clauseTextsOf(text).flatMap((t) => {
    // A "when you play" clause that only prices the play is the cost registry's whole, as `hasPlayEffect` reads it.
    if (WHEN_PLAYED.test(t) && !hasPlayEffect(t)) return [{ concern: 'cost' as Concern, text: t }];
    const sentences = sentencesOf(t);
    const left = sentences.filter((s) => !own(s));
    const firstLeft = sentences.findIndex((s) => !own(s));
    return sentences.flatMap((s, i) => {
      const concern = own(s);
      if (concern) return [{ concern, text: s }];
      return i === firstLeft ? [{ concern: rest(left.join(' ')), text: left.join(' ') }] : [];
    });
  });
}

/** The lines of a deck under the sections that hold cards: `Deck:`, `Dilemmas:` and `Missions:`. */
export function shippedDeckTitles(deckText: string): Set<string> {
  const titles = new Set<string>();
  let inCards = false;
  for (const line of deckText.split(/\r?\n/)) {
    if (/^\S.*:\s*$/.test(line)) {
      inCards = /^(Deck|Dilemmas|Missions):$/.test(line.trim());
      continue;
    }
    const m = inCards && line.match(/^\d+\t(.+)$/);
    if (m) titles.add(cardTitleOf(m[1]));
  }
  return titles;
}

/**
 * Whether the registry of `concern` models the clause `clause` of `card`, whose title is `title`. The clause
 * tells apart the clauses of one concern on one card: Optimism's three orders.
 */
export type ModelledBy = (concern: Concern, title: string, card: CoverageCard, clause: string) => boolean;

export interface CoverageRow {
  title: string;
  type: string;
  decks: number;
  clauses: (Clause & { modelled: boolean })[];
  /** The concerns of the clauses with no model, each once, in `CONCERNS` order. */
  missing: Concern[];
  /** Every missing clause has a registry to go in. */
  withinReach: boolean;
}

export interface CoverageReport {
  decks: number;
  rows: CoverageRow[];
}

/**
 * The coverage of every title the decks play (every section), most played first, then by title. A title
 * with no row in `cards` is left out; a title with several rows (reprints) reads its first row with text.
 */
export function coverageReport(cards: CoverageCard[], decks: string[], modelled: ModelledBy): CoverageReport {
  const byTitle = new Map<string, CoverageCard>();
  for (const c of cards) {
    const title = cardTitleOf(c.name);
    const seen = byTitle.get(title);
    if (!seen || (!String(seen.gametext ?? '').trim() && String(c.gametext ?? '').trim())) byTitle.set(title, c);
  }
  const deckSets = decks.map(shippedDeckTitles);
  const titles = new Set(deckSets.flatMap((s) => [...s]));
  const rows: CoverageRow[] = [];
  for (const title of titles) {
    const card = byTitle.get(title);
    if (!card) continue;
    const clauses = clausesOf(card).map((c) => ({ ...c, modelled: modelled(c.concern, title, card, c.text) }));
    const missing = CONCERNS.filter((k) => clauses.some((c) => c.concern === k && !c.modelled));
    rows.push({
      title,
      type: card.type,
      decks: deckSets.filter((s) => s.has(title)).length,
      clauses,
      missing,
      withinReach: missing.every((k) => CONCERNS_WITH_REGISTRY.has(k)),
    });
  }
  rows.sort((a, b) => b.decks - a.decks || a.title.localeCompare(b.title));
  return { decks: decks.length, rows };
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '–');

/** The report as Markdown: totals by type and by concern, then the backlog of every title with a missing clause. */
export function coverageMarkdown(report: CoverageReport): string {
  const { rows } = report;
  const withText = rows.filter((r) => r.clauses.length);
  const full = withText.filter((r) => !r.missing.length);
  const partial = withText.filter((r) => r.missing.length && r.clauses.some((c) => c.modelled));
  const reach = withText.filter((r) => r.missing.length && r.withinReach);
  const out: string[] = [];
  out.push('# Model backlog', '');
  out.push(
    `${report.decks} shipped decks play ${rows.length} titles; ${withText.length} have game text. ` +
      `${full.length} are fully modelled (${pct(full.length, withText.length)}), ${partial.length} partly. ` +
      `Of the ${withText.length - full.length} left, ${reach.length} are within reach: every missing clause has a registry to go in.`,
    ''
  );
  out.push('Generated by `MODEL_BACKLOG=docs/model-backlog.md yarn test modelBacklog`. Clause detection reads the game text with patterns, so a row can be filed under the wrong concern: read the card before you model it.', '');

  out.push('## By type', '', '| Type | Titles with text | Fully modelled | Partly | None | Within reach |', '|---|---:|---:|---:|---:|---:|');
  const types = [...new Set(withText.map((r) => r.type))].sort((a, b) => withText.filter((r) => r.type === b).length - withText.filter((r) => r.type === a).length);
  for (const t of types) {
    const of = withText.filter((r) => r.type === t);
    const f = of.filter((r) => !r.missing.length).length;
    const p = of.filter((r) => r.missing.length && r.clauses.some((c) => c.modelled)).length;
    const w = of.filter((r) => r.missing.length && r.withinReach).length;
    out.push(`| ${t} | ${of.length} | ${f} | ${p} | ${of.length - f - p} | ${w} |`);
  }
  out.push('');

  out.push('## By concern', '', '| Concern | Registry | Clauses | Modelled | Missing |', '|---|---|---:|---:|---:|');
  for (const k of CONCERNS) {
    const cs = withText.flatMap((r) => r.clauses.filter((c) => c.concern === k));
    if (!cs.length) continue;
    const m = cs.filter((c) => c.modelled).length;
    out.push(`| ${k} | ${CONCERNS_WITH_REGISTRY.has(k) ? 'yes' : '**none**'} | ${cs.length} | ${m} (${pct(m, cs.length)}) | ${cs.length - m} |`);
  }
  out.push('');

  out.push('## Backlog', '', 'Every title with a missing clause, most played first.', '', '| Decks | Title | Type | Missing | Reach |', '|---:|---|---|---|---|');
  for (const r of withText.filter((x) => x.missing.length)) {
    out.push(`| ${r.decks} | ${r.title.replace(/\|/g, '\\|')} | ${r.type} | ${r.missing.join(', ')} | ${r.withinReach ? 'yes' : 'no'} |`);
  }
  out.push('');
  return out.join('\n');
}

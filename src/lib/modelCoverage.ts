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
export const CONCERNS_WITH_REGISTRY: ReadonlySet<Concern> = new Set<Concern>(['dilemma', 'cost', 'whenPlayed', 'eventResolve', 'attributes', 'mission', 'place', 'order']);

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
/** Where an event or an equipment plays: placement, not an effect. Trellium-D "Plays aboard your ship" (#1915). */
const PLAYS_WHERE = /^Plays? (in|on|aboard)\b/i;
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

/**
 * The groups of the sentences of an `ongoing` clause (#1915), each with the primitive that would model it. A clause
 * often mixes groups (Coordinated Counterattack: a play requirement, then "Personnel an opponent commands cannot gain
 * skills"), so the classifier names each sentence.
 */
export type OngoingGroup =
  | 'playRequirement' // "To play this event, you must command three [Bor] personnel"
  | 'playPlace' // "This personnel may (and must) play to {Ba'ku Planet}"
  | 'attempt' // "Personnel aboard this ship cannot attempt missions"
  | 'counterSpend' // "You cannot spend counters to draw cards"; Code of the Ushaan's cap
  | 'reminder' // "(You do not need to spend all your counters …)": the table never asks for unspent counters
  | 'attributes' // Morik: an attribute change the attribute pattern misses
  | 'gain' // a gain of skills, icons, keywords or a Region
  | 'opponent' // a text that reads or acts on an opponent (#1758)
  | 'command' // "To command this ship, …", "cannot make you lose command"
  | 'stopImmunity' // "cannot be stopped … until the end of this turn"
  | 'engagement' // Queen's Borg Cube
  | 'playCost' // Tuvix: a cost of the play other than counters
  | 'fragment' // a piece `sentencesOf` cut off its clause
  | 'unclassified';

export const ONGOING_GROUPS: OngoingGroup[] = [
  'playRequirement',
  'playPlace',
  'attempt',
  'counterSpend',
  'reminder',
  'attributes',
  'gain',
  'opponent',
  'command',
  'stopImmunity',
  'engagement',
  'playCost',
  'fragment',
  'unclassified',
];

/** What would model a sentence of each group: a permission of the modifier kind, a row, or what the table lacks. */
export const ONGOING_PRIMITIVES: Record<OngoingGroup, string> = {
  playRequirement: 'a permission: play',
  playPlace: 'a permission: playPlace',
  attempt: 'a permission: attempt',
  counterSpend: 'a permission: spendToDraw, or a counter-limit cap',
  reminder: 'nothing: a reminder',
  attributes: 'an attribute row',
  gain: 'a gain',
  opponent: 'an opponent',
  command: 'command',
  stopImmunity: 'stop immunity',
  engagement: 'an engagement',
  playCost: 'a play cost',
  fragment: 'the clause before',
  unclassified: 'a group',
};

/** The permission quantity of the modifier kind that models a sentence of `group`, when one does. */
export function ongoingPermissionOf(group: OngoingGroup, sentence: string): 'play' | 'playPlace' | 'attempt' | 'spendToDraw' | null {
  if (group === 'playRequirement') return 'play';
  if (group === 'playPlace') return 'playPlace';
  if (group === 'attempt') return 'attempt';
  if (group === 'counterSpend' && /\bspend counters to draw\b/i.test(sentence)) return 'spendToDraw';
  return null;
}

// The patterns, in order: the first that matches names the group. A counter sentence of "each player" is a counter
// spend before it is an opponent's; an opponent's "To play this …" before a play requirement; a gain before an attempt.
const ONGOING_PATTERNS: [OngoingGroup, RegExp][] = [
  ['reminder', /^\(?You do not need to spend all your counters\b/i],
  ['counterSpend', /\bcannot spend (counters|more than \w+ counters)\b/i],
  ['command', /^To command this\b|\blose command\b/i],
  ['opponent', /\b(opponents?|each player|that player|owners?|owns)\b/i],
  ['playRequirement', /^To play this \w+, you (must|must not|cannot) command\b/i],
  ['playCost', /^To play this \w+,|\bcannot play \w+ with the same title\b/i],
  ['playPlace', /\bmay \(and must\) play to\b|^Plays? aboard\b/i],
  ['gain', /\b(gains?|loses|becomes)\b|\bcorresponding Commander\b/i],
  ['attempt', /\bcannot (be )?attempt|\bcannot begin a mission attempt\b/i],
  ['stopImmunity', /\bcannot be stopped\b/i],
  ['engagement', /\bengagement\b/i],
  ['attributes', /\battributes\b/i],
  ['fragment', /^[^{]*\}|^(Those cards|Take one of those|Then\b|Replace the remaining|Name an? |You may do this only once)/i],
];

/** The group of one sentence of an `ongoing` clause, "unclassified" when no pattern matches. */
export function ongoingGroupOf(sentence: string): OngoingGroup {
  return ONGOING_PATTERNS.find(([, re]) => re.test(sentence))?.[0] ?? 'unclassified';
}

/** The sentences of an `ongoing` clause, each with its group. */
export function ongoingSentencesOf(clause: string): { text: string; group: OngoingGroup }[] {
  return sentencesOf(clause).map((text) => ({ text, group: ongoingGroupOf(text) }));
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

/**
 * Whether the registries model one sentence of an `ongoing` clause (#1915). A caller that passes it to
 * `coverageReport` gets each `ongoing` clause's uncovered sentences, and their primitives in the report.
 */
export type SentenceModelledBy = (title: string, card: CoverageCard, sentence: { text: string; group: OngoingGroup }) => boolean;

/** A sentence of an `ongoing` clause, its group, and whether it is modelled. */
export interface OngoingSentence {
  text: string;
  group: OngoingGroup;
  modelled: boolean;
}

export interface CoverageRow {
  title: string;
  type: string;
  decks: number;
  /** Each clause; an `ongoing` one with its sentences when the report was given a `SentenceModelledBy`. */
  clauses: (Clause & { modelled: boolean; sentences?: OngoingSentence[] })[];
  /** The concerns of the clauses with no model, each once, in `CONCERNS` order. */
  missing: Concern[];
  /**
   * Every missing clause has a registry to go in; a missing `ongoing` clause when each of its uncovered sentences
   * has a permission primitive (#1915).
   */
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
export function coverageReport(cards: CoverageCard[], decks: string[], modelled: ModelledBy, sentenceModelled?: SentenceModelledBy): CoverageReport {
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
    const clauses = clausesOf(card).map((c): CoverageRow['clauses'][number] => {
      const clause = { ...c, modelled: modelled(c.concern, title, card, c.text) };
      if (c.concern !== 'ongoing' || !sentenceModelled) return clause;
      const sentences = ongoingSentencesOf(c.text).map((x) => ({ ...x, modelled: clause.modelled || sentenceModelled(title, card, x) }));
      return { ...clause, modelled: clause.modelled || sentences.every((x) => x.modelled), sentences };
    });
    const missing = CONCERNS.filter((k) => clauses.some((c) => c.concern === k && !c.modelled));
    const reachable = (c: CoverageRow['clauses'][number]) =>
      c.modelled ||
      CONCERNS_WITH_REGISTRY.has(c.concern) ||
      (c.sentences?.every((x) => x.modelled || ongoingPermissionOf(x.group, x.text) !== null) ?? false);
    rows.push({
      title,
      type: card.type,
      decks: deckSets.filter((s) => s.has(title)).length,
      clauses,
      missing,
      withinReach: clauses.every(reachable),
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

  const ongoing = withText.flatMap((r) => r.clauses.flatMap((c) => c.sentences ?? []));
  if (ongoing.length) {
    out.push(
      '## Ongoing by primitive',
      '',
      'Each sentence of an `ongoing` clause, by its group, with what would model it. A clause is modelled when every sentence is.',
      '',
      '| Group | Primitive | Sentences | Modelled |',
      '|---|---|---:|---:|'
    );
    for (const g of ONGOING_GROUPS) {
      const of = ongoing.filter((x) => x.group === g);
      if (!of.length) continue;
      const m = of.filter((x) => x.modelled).length;
      out.push(`| ${g} | ${ONGOING_PRIMITIVES[g]} | ${of.length} | ${m} |`);
    }
    out.push('');
  }

  // A missing `ongoing` clause names what its uncovered sentences need: "ongoing (needs: an opponent)".
  const missingText = (r: CoverageRow) =>
    r.missing
      .map((k) => {
        const needs = [
          ...new Set(
            r.clauses
              .filter((c) => c.concern === k && !c.modelled)
              .flatMap((c) => c.sentences ?? [])
              .filter((x) => !x.modelled)
              .map((x) => ONGOING_PRIMITIVES[x.group])
          ),
        ];
        return needs.length ? `${k} (needs: ${needs.join('; ')})` : k;
      })
      .join(', ');
  out.push('## Backlog', '', 'Every title with a missing clause, most played first.', '', '| Decks | Title | Type | Missing | Reach |', '|---:|---|---|---|---|');
  for (const r of withText.filter((x) => x.missing.length)) {
    out.push(`| ${r.decks} | ${r.title.replace(/\|/g, '\\|')} | ${r.type} | ${missingText(r)} | ${r.withinReach ? 'yes' : 'no'} |`);
  }
  out.push('');
  return out.join('\n');
}

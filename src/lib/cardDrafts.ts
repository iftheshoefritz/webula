// Draft card definitions from game text (#1869, part of #1860). Much of 2E's text is templated: "When you play this
// personnel, you may download …", "Order - Discard a card from hand to draw three cards." A template here matches
// such a clause of the model backlog (`clausesOf` in `modelCoverage.ts`) and writes a draft of its row in the
// shared vocabulary: the effect steps of `effectSteps.ts`, as a `PlayModel` or an `OrderModel` reads them. A draft
// is never added to a registry by the script: a person, or an agent working one issue, checks it against the card
// and moves it in with a test, so a reviewed draft needs no change to the engine.
//
// `CARD_DRAFTS=<path>.md yarn test modelBacklog` writes the review file over the shipped decks, and with
// `CARD_DRAFTS_SCOPE=all` over every title of the card data: per concern how many unmodelled clauses a template
// matched and how many it did not, so the next template to write is the one that covers the most of them, then the
// drafts. A template reads a chain of the steps of the vocabulary (`chainSteps`) and a phrase of cards
// (`phraseTest`); a clause with a part outside them gets no draft. A condition of the table ("if you command two
// Vulcans") is drafted as not checked, for the reviewer to write. It imports no React and no reducer.

import type { Concern, CoverageReport } from './modelCoverage';
import { CONCERNS } from './modelCoverage';
import { bottomFromHand, discardFromHand, download, draw, score, shuffle, type DownloadTest, type EffectStep } from './effectSteps';
import type { OrderCost } from './orderModels';
import type { PlayCondition } from './playModels';

/** A draft row: what the registry of its concern takes, less the title, which the draft carries. */
export type DraftRow =
  | { registry: 'PLAY_MODELS'; text: string; condition?: PlayCondition; steps: EffectStep[] }
  | { registry: 'RESOLVE_MODELS'; steps: EffectStep[] }
  | { registry: 'ORDER_MODELS'; index: number; text: string; cost: OrderCost; oncePerTurn?: true; steps: EffectStep[] };

/** One draft: the title, the clause it came from, the template that matched, and the row. */
export interface CardDraft {
  title: string;
  type: string;
  decks: number;
  concern: Concern;
  template: string;
  clause: string;
  row: DraftRow;
}

/** A template: the concern of the clauses it reads, its pattern, and the row it writes, or null when a part of the match is not in the vocabulary. */
export interface DraftTemplate {
  id: string;
  concern: Concern;
  /** What it matches, for the report: "When you play this personnel, you may draw N cards." */
  shape: string;
  pattern: RegExp;
  row: (match: RegExpMatchArray, context: { orderIndex: number }) => DraftRow | null;
}

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** A count, "a", "two", "3", or null. */
export function countOf(word: string): number | null {
  const w = word.trim().toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBERS[w] ?? null;
}

// The affiliation icons, which a test reads by affiliation ("[Baj]" is "bajoran"); any other icon is an icon.
const AFFILIATIONS: Record<string, string> = {
  baj: 'bajoran',
  bor: 'borg',
  car: 'cardassian',
  dom: 'dominion',
  fed: 'federation',
  fer: 'ferengi',
  kli: 'klingon',
  rom: 'romulan',
  sf: 'starfleet',
  vid: 'vidiian',
  na: 'non-aligned',
};

const TYPES: Record<string, string> = {
  personnel: 'personnel',
  ship: 'ship',
  ships: 'ship',
  equipment: 'equipment',
  event: 'event',
  events: 'event',
  interrupt: 'interrupt',
  interrupts: 'interrupt',
  dilemma: 'dilemma',
  dilemmas: 'dilemma',
};

// The skills a test reads by name, "a Treachery Bajoran".
const SKILLS = new Set([
  'acquisition',
  'anthropology',
  'archaeology',
  'astrometrics',
  'biology',
  'diplomacy',
  'engineer',
  'exobiology',
  'geology',
  'honor',
  'intelligence',
  'law',
  'leadership',
  'medical',
  'navigation',
  'officer',
  'physics',
  'programming',
  'science',
  'security',
  'telepathy',
  'transporters',
  'treachery',
]);

// The species and keywords a test reads by name, plurals folded. A capitalised word that is none of these, nor a
// skill, has no place in a test, so its phrase gets no draft; a reviewer adds the word here when it is one.
const SPECIES = new Set(['bajoran', 'borg', 'cardassian', 'changeling', 'ferengi', 'human', "jem'hadar", 'klingon', 'romulan', 'vorta', 'vulcan']);
const KEYWORDS = new Set([
  'artifact',
  'assault',
  'capture',
  'commodity',
  'decay',
  'dissident',
  'drone',
  'glinn',
  'hand weapon',
  'maneuver',
  'prophet',
  'resistance',
  'smuggler',
  'temporal',
  'tribble',
]);

const singular = (w: string): string => (w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/**
 * The test of a phrase of cards, "a [Baj] personnel", "up to two unique [Bor] personnel", "an equipment, event, or
 * ship", "a non-Artifact equipment", "{Engage Cloak}": the count, the test, and the phrase as the text reads it;
 * null when a word is not in the vocabulary.
 */
export function phraseTest(phrase: string): { upTo: number; test: DownloadTest[]; testText: string } | null {
  const testText = phrase.trim().replace(/\.$/, '');
  const titles = [...testText.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].toLowerCase());
  if (titles.length) {
    // "{A}", "{A} or {B}": one card of one of those titles.
    if (testText.replace(/\{[^}]+\}/g, '').replace(/\b(a|an|or|and\/or)\b|,/gi, '').trim()) return null;
    return { upTo: 1, test: [{ titles }], testText };
  }
  const words = testText.replace(/,/g, ' ').replace(/\bHand Weapons?\b/gi, 'hand_weapon').split(/\s+/).filter(Boolean);
  let upTo: number | null;
  if (words[0]?.toLowerCase() === 'up' && words[1]?.toLowerCase() === 'to') {
    upTo = countOf(words[2] ?? '');
    words.splice(0, 3);
  } else {
    upTo = countOf(words[0] ?? '');
    words.shift();
  }
  if (!upTo) return null;
  const test: DownloadTest = {};
  let anyCard = false;
  for (const raw of words) {
    const word = raw.toLowerCase().replace('hand_weapon', 'hand weapon');
    const icon = /^\[([a-z0-9]+)\]$/.exec(word);
    const not = /^non-(.+)$/.exec(word);
    if (word === 'unique') test.unique = true;
    else if (word === 'or' || word === 'and/or') continue;
    else if (word === 'card' || word === 'cards') anyCard = true;
    else if (icon) {
      const affiliation = AFFILIATIONS[icon[1]];
      if (affiliation) (test.affiliations ??= []).push(affiliation);
      else (test.icons ??= []).push(`[${icon[1]}]`);
    } else if (TYPES[word]) (test.types ??= []).push(TYPES[word]);
    else if (SKILLS.has(word)) (test.skills ??= []).push(word);
    else if (SPECIES.has(singular(word))) (test.species ??= []).push(singular(word));
    else if (KEYWORDS.has(singular(word))) (test.keywords ??= []).push(singular(word));
    else if (not && KEYWORDS.has(singular(not[1]))) (test.notKeywords ??= []).push(singular(not[1]));
    else return null;
  }
  if (!Object.keys(test).length && !anyCard) return null;
  return { upTo, test: [test], testText };
}

const ONCE = / You may do this only once each turn\.$/i;
const N = '(a|an|one|two|three|four|five|six|seven|\\d+)';

const downloadSteps = (phrase: string): EffectStep[] | null => {
  const of = phraseTest(phrase);
  return of && Object.keys(of.test[0]).length ? [download(of.upTo, of.testText, of.test), shuffle()] : null;
};

// One step of an effect: "draw three cards", "download a [Voy] ship", "score 5 points", "discard a card from hand",
// "place three cards from hand on the bottom of your deck"; `may` from a "you may" before it.
function stepsOf(part: string, may: boolean): EffectStep[] | null {
  const e = part.trim().replace(/\.$/, '');
  let m = new RegExp(`^draw ${N} cards?$`, 'i').exec(e);
  if (m) return [draw(countOf(m[1])!, { may })];
  m = /^download (.+)$/i.exec(e);
  if (m) return downloadSteps(m[1]);
  m = /^score (\d+) points$/i.exec(e);
  if (m) return [score(Number(m[1]))];
  m = new RegExp(`^discard ${N} cards? from hand$`, 'i').exec(e);
  if (m) return [discardFromHand(countOf(m[1])!, may)];
  m = /^discard (.+) from hand$/i.exec(e);
  if (m) {
    const of = phraseTest(m[1]);
    return of ? [discardFromHand(of.upTo, may, of.test)] : null;
  }
  m = new RegExp(`^place ${N} cards? from hand on the bottom of your deck(?: in any order)?$`, 'i').exec(e);
  if (m) return [bottomFromHand(countOf(m[1])!)];
  return null;
}

/**
 * The steps of an effect, a chain of steps: "Discard a card from hand to draw two cards", "draw a card. If you do,
 * discard a card from hand", "draw three cards, then place three cards from hand on the bottom of your deck". The
 * first step is a "may" when the clause says "you may".
 */
export function chainSteps(text: string, may = false): EffectStep[] | null {
  const parts = text
    .trim()
    .replace(/\.$/, '')
    .split(/\.\s+If you do,\s+|,?\s+then\s+|\.\s+|\s+and then\s+|\s+and\s+(?=(?:draw|discard|download|score|place)\b)|\s+to\s+(?=(?:draw|download|score)\b)/i);
  const steps: EffectStep[] = [];
  for (const [i, part] of parts.entries()) {
    const s = stepsOf(part, may && i === 0);
    if (!s) return null;
    steps.push(...s);
  }
  return steps.length ? steps : null;
}

// The cost of an order, the text before "to".
function orderCost(cost: string): OrderCost | null {
  const c = cost.trim();
  let m = /^Discard (.+) from hand$/i.exec(c);
  if (m) {
    if (/^a card$/i.test(m[1])) return { kind: 'discardFromHand', count: 1, text: 'a card' };
    const of = phraseTest(m[1]);
    return of ? { kind: 'discardFromHand', count: of.upTo, test: of.test, text: of.testText } : null;
  }
  m = /^Stop one of your (.+)$/i.exec(c);
  if (m) {
    const of = phraseTest(`a ${m[1]}`);
    return of && of.upTo === 1 ? { kind: 'stopPersonnel', test: of.test, text: m[1] } : null;
  }
  if (/^Place this (?:personnel|card) on the bottom of (?:his|her|its) owner's deck$/i.test(c)) return { kind: 'placeThisOnBottom' };
  return null;
}

/** A condition a reviewer writes: the draft names it, as not checked, so the panel shows it until then. */
const unchecked = (condition: string): PlayCondition => ({ kind: 'unchecked', needs: 'a condition of the table, to write on review', text: condition });

/** The templates of today: a "when you play" effect, an order, and an event that resolves and destroys itself. */
export const DRAFT_TEMPLATES: DraftTemplate[] = [
  {
    id: 'play-effect',
    concern: 'whenPlayed',
    shape: 'When you play this …, [if <condition>,] [you may] <a chain of draw, download, score, discard and bottom steps>.',
    pattern: /^When you play this (?:personnel|ship), (?:if ([^,]+), )?(you may )?(.+)$/i,
    row: (m) => {
      const steps = chainSteps(m[3], !!m[2]);
      if (!steps) return null;
      const text = m[0].replace(/^When you play this (?:personnel|ship), /i, '').replace(/^./, (c) => c.toUpperCase());
      return { registry: 'PLAY_MODELS', text, ...(m[1] ? { condition: unchecked(`if ${m[1]}`) } : {}), steps };
    },
  },
  {
    id: 'order',
    concern: 'order',
    shape: 'Order - [<discard from hand | stop one of your … | place this on the bottom> to] <a chain of steps>.',
    pattern: /^Order - (.+?)\.((?: You may do this only once each turn\.)?)$/i,
    row: (m, { orderIndex }) => {
      const split = /^(.+?) to (.+)$/i.exec(m[1]);
      const cost = split ? orderCost(split[1]) : null;
      const steps = chainSteps(cost ? split![2] : m[1]);
      if (!steps) return null;
      return {
        registry: 'ORDER_MODELS',
        index: orderIndex,
        text: m[0].replace(/^Order - /i, ''),
        cost: cost ?? { kind: 'none' },
        ...(ONCE.test(m[0]) ? { oncePerTurn: true as const } : {}),
        steps,
      };
    },
  },
  {
    id: 'event-resolve',
    concern: 'eventResolve',
    shape: '[To play this event, …] <a chain of steps>. Destroy this event.',
    pattern: /^(?:To play this event, [^.]+\.\s+)?(.+?)\.\s+Destroy this event\.$/i,
    row: (m) => {
      const steps = chainSteps(m[1]);
      return steps ? { registry: 'RESOLVE_MODELS', steps } : null;
    },
  },
];

/** The draft of one clause by the first template that matches and writes a row, or null. */
export function draftOf(concern: Concern, clause: string, orderIndex = 0): { template: string; row: DraftRow } | null {
  const text = clause.trim();
  for (const t of DRAFT_TEMPLATES) {
    if (t.concern !== concern) continue;
    const m = text.match(t.pattern);
    const row = m && t.row(m, { orderIndex });
    if (row) return { template: t.id, row };
  }
  return null;
}

export interface DraftReport {
  drafts: CardDraft[];
  /** Per concern: the unmodelled clauses a template matched, and those none did. */
  counts: { concern: Concern; matched: number; unmatched: number }[];
}

/** The drafts of every unmodelled clause of `report` and the counts by concern, the concerns with the most unmatched first. */
export function draftReport(report: CoverageReport): DraftReport {
  const drafts: CardDraft[] = [];
  const counts = new Map<Concern, { matched: number; unmatched: number }>(CONCERNS.map((c) => [c, { matched: 0, unmatched: 0 }]));
  for (const row of report.rows) {
    let orderIndex = 0;
    for (const clause of row.clauses) {
      const index = clause.concern === 'order' ? orderIndex++ : 0;
      if (clause.modelled) continue;
      const draft = draftOf(clause.concern, clause.text, index);
      const count = counts.get(clause.concern)!;
      if (draft) {
        count.matched++;
        drafts.push({ title: row.title, type: row.type, decks: row.decks, concern: clause.concern, template: draft.template, clause: clause.text, row: draft.row });
      } else count.unmatched++;
    }
  }
  return {
    drafts,
    counts: [...counts]
      .map(([concern, c]) => ({ concern, ...c }))
      .filter((c) => c.matched + c.unmatched > 0)
      .sort((a, b) => b.unmatched - a.unmatched || b.matched - a.matched),
  };
}

/** The source of a draft's row, to paste into its registry once reviewed. */
export function draftSource(draft: CardDraft): string {
  const { registry, ...row } = draft.row;
  void registry;
  return JSON.stringify({ title: draft.title, ...row }, null, 2);
}

/** The review file: the counts by concern, then each draft with its clause and its row. */
export function draftMarkdown(report: DraftReport): string {
  const lines = [
    '# Card drafts',
    '',
    'Drafts from game text (#1869). Check each against the card, then move it into its registry with a test.',
    '',
    '| Concern | Matched | Unmatched |',
    '| --- | --- | --- |',
    ...report.counts.map((c) => `| ${c.concern} | ${c.matched} | ${c.unmatched} |`),
    '',
    `${report.drafts.length} drafts.`,
  ];
  for (const d of report.drafts) {
    lines.push('', `## ${d.title} (${d.type}, ${d.decks} decks)`, '', `${d.concern}, template \`${d.template}\`, for \`${d.row.registry}\`:`, '', `> ${d.clause}`, '', '```json', draftSource(d), '```');
  }
  return lines.join('\n') + '\n';
}

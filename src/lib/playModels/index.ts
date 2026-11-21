// The "when you play" models of the practice table (#1800): what the table automates of the text of a
// personnel or a ship that acts when the player plays it, "When you play this personnel, …". One model per
// title, by whole title (`cardTitleOf`), in the style of the resolve models of events
// (`src/lib/resolveModels/`). A model names its steps, each with whether it is a "may", and a condition.
// It ships one kind:
// - `'drawUpToThenDiscard'`: the player may draw up to N cards, a count the player picks from 0 to N, then
//   discards M cards from hand (Enabran Tain "Retired" Spymaster).
// - `'discardFromHand'`: the player discards N cards from hand, no "may" (#1808: Leeta Rebel Supporter, the
//   Dissident personnel and the others whose whole clause is "discard a card from hand").
// - `'examineTake'` (#1809): the player may examine the top N cards of the draw deck, take one (or as many as
//   the model allows) into hand, those that pass the model's test of the card, and place the rest on the
//   bottom of the draw deck in any order (Requisitions Drone, Lenara Kahn, Keiko O'Brien, Harry Kim, Sobi).
// - `'score'` (#1812): the player scores N points on a condition (Annexation Drone, DaiMon Solok, Opaka, Kira Taban).
// A personnel or a ship with no model plays as before.
//
// It imports no React and no reducer: the condition reads the facts of the cost models (`CostFacts`).

import { cardTitleOf } from '../cardTitle';
import type { CostCoreCard, CostFacts } from '../costModels/model';
import { missionRequires } from '../costModels/titles/completedMission';

/** "If each of your non-headquarters missions requires <skill>": an empty slot is no mission, and with no such mission it holds. */
export interface NonHeadquartersRequireCondition {
  kind: 'nonHeadquartersRequire';
  skill: string;
}

/** A condition the table cannot read, such as one of the opponent's: shown as not checked. */
export interface UncheckedCondition {
  kind: 'unchecked';
  /** What the check needs, "needs the opponent's score". */
  needs: string;
  text: string;
}

/** A condition of the table that the model tests on the facts (#1812): "you command three [Fer] personnel". */
export interface TableCondition {
  kind: 'table';
  text: string;
  holds: (facts: PlayConditionFacts) => boolean;
}

export type PlayCondition = NonHeadquartersRequireCondition | UncheckedCondition | TableCondition;

/** The facts a condition reads: the missions always, the rest of `CostFacts` where the page has them. */
export type PlayConditionFacts = Pick<CostFacts, 'missions'> & Partial<CostFacts>;

/** The names of the steps a model can have. */
export type PlayStepName = 'draw' | 'discard' | 'examine' | 'score';

export interface PlayStepSpec {
  step: PlayStepName;
  /** A "may": the player may skip it. A step after a "may" it depends on ("then") is skipped with it. */
  may: boolean;
}

/** "You may draw up to seven cards, then discard two cards from hand." */
export interface DrawUpToThenDiscardModel {
  kind: 'drawUpToThenDiscard';
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** The most cards the player may draw. */
  drawUpTo: number;
  /** The cards of the hand the player discards after the draw. */
  discard: number;
  condition?: PlayCondition;
  /** The effect's text, for the panel. */
  text: string;
}

/** "Discard a card from hand.": the whole clause, and not a "may". */
export interface DiscardFromHandModel {
  kind: 'discardFromHand';
  title: string;
  /** The cards of the hand the player discards. */
  discard: number;
  condition?: PlayCondition;
  text: string;
}

/** A card of the draw deck as the test of an examine reads it: its type, its keywords and its printed cost, as the card data has them. */
export interface ExaminedCard {
  type?: unknown;
  keywords?: unknown;
  cost?: unknown;
}

/**
 * The test of the card an examine takes (#1809): a type of `types` or a keyword of `keywords` ("an interrupt
 * or a Temporal card"), or a printed cost of `cost` or more.
 */
export type ExamineTest =
  | { kind: 'typeOrKeyword'; types: string[]; keywords?: string[] }
  | { kind: 'costAtLeast'; cost: number };

/** How many cards an examine may take: a fixed number, or one for each different card of the core with a keyword. */
export type ExamineTakeCount = { kind: 'fixed'; count: number } | { kind: 'differentCoreKeyword'; keyword: string };

/** "You may examine the top four cards of your deck and take one into hand. Place the remaining cards on the bottom …" */
export interface ExamineTakeModel {
  kind: 'examineTake';
  title: string;
  /** The cards of the top of the draw deck it examines. */
  examine: number;
  take: ExamineTakeCount;
  /** Whether a card must be taken once the cards are examined (Requisitions Drone), or "you may" take one. */
  mustTake: boolean;
  test?: ExamineTest;
  /** The words of the test, for the panel: "an event". */
  testText?: string;
  condition?: PlayCondition;
  text: string;
}

/** "… score 5 points." (#1812): the points go to the score, clamped as the score buttons clamp it. */
export interface ScoreModel {
  kind: 'score';
  title: string;
  points: number;
  /** Whether the text says "you may score". Skip shows either way: the player may skip a condition the table cannot check. */
  may: boolean;
  condition?: PlayCondition;
  text: string;
}

export type PlayModel = DrawUpToThenDiscardModel | DiscardFromHandModel | ExamineTakeModel | ScoreModel;

// The conditions of the score models (#1812). "You command" counts the unstopped personnel (`commanded`), as the
// cost models do (#1751).
const commandsCount = (facts: PlayConditionFacts, test: (p: CostFacts['commanded'][number]) => boolean, n: number): boolean =>
  (facts.commanded ?? []).filter(test).length >= n;

const commandsSpecies = (facts: PlayConditionFacts, species: string): boolean => commandsCount(facts, (p) => p.species.includes(species), 1);

/** A mission card titled `title`: its name is the title, or the title then its subtitle. */
const titled = (name: string, title: string): boolean => {
  const n = name.toLowerCase();
  return n === title || n.startsWith(`${title} `);
};

const SCORE_MODELS: ScoreModel[] = [
  // "When you play this personnel, if each of your non-headquarters missions is an [AQ] mission, score 5 points."
  {
    kind: 'score',
    title: 'Annexation Drone',
    points: 5,
    may: false,
    condition: {
      kind: 'table',
      text: 'each of your non-headquarters missions is an [AQ] mission',
      holds: (facts) => (facts.missions ?? []).every((m) => m.type === '' || m.type === 'h' || m.quadrant === 'a'),
    },
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command three [Fer] personnel, score 5 points."
  {
    kind: 'score',
    title: 'DaiMon Solok Cargo Runner',
    points: 5,
    may: false,
    condition: {
      kind: 'table',
      text: 'you command three [Fer] personnel',
      holds: (facts) => commandsCount(facts, (p) => p.affiliation === 'ferengi', 3),
    },
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command {Bajor} and no other headquarters mission, you may score 5 points."
  {
    kind: 'score',
    title: 'Opaka Collaborator',
    points: 5,
    may: true,
    condition: {
      kind: 'table',
      text: 'you command Bajor and no other headquarters mission',
      holds: (facts) => {
        const headquarters = (facts.missions ?? []).filter((m) => m.type === 'h');
        return headquarters.length === 1 && titled(headquarters[0].name, 'bajor');
      },
    },
    text: 'You may score 5 points.',
  },
  // "When you play this personnel, if you have a lower score than each of your opponents, score 5 points."
  {
    kind: 'score',
    title: 'Kira Taban Husband and Father',
    points: 5,
    may: false,
    condition: { kind: 'unchecked', needs: "needs the opponent's score", text: 'you have a lower score than each of your opponents' },
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command a Founder and a Vorta, you may score 5 points."
  {
    kind: 'score',
    title: 'Eris Harbinger of the Dominion',
    points: 5,
    may: true,
    condition: {
      kind: 'table',
      text: 'you command a Founder and a Vorta',
      holds: (facts) => commandsSpecies(facts, 'founder') && commandsSpecies(facts, 'vorta'),
    },
    text: 'You may score 5 points.',
  },
  // "When you play this personnel, if you command a Maneuver event, score 5 points."
  {
    kind: 'score',
    title: 'Klaa Dauntless Hunter',
    points: 5,
    may: false,
    condition: {
      kind: 'table',
      text: 'you command a Maneuver event',
      holds: (facts) => (facts.events ?? []).some((e) => e.keywords.includes('maneuver')),
    },
    text: 'Score 5 points.',
  },
  // "When you play this personnel, if you command a mission worth 40 or more points and three [Fer] personnel,
  // score 5 points." His cost clause is a cost model (`completedMission.ts`).
  {
    kind: 'score',
    title: 'Brunt Acting Grand Nagus',
    points: 5,
    may: false,
    condition: {
      kind: 'table',
      text: 'you command a mission worth 40 or more points and three [Fer] personnel',
      holds: (facts) =>
        (facts.missions ?? []).some((m) => m.type !== '' && m.points >= 40) && commandsCount(facts, (p) => p.affiliation === 'ferengi', 3),
    },
    text: 'Score 5 points.',
  },
];

// The personnel whose whole "When you play this personnel" clause is "discard a card from hand" (#1808), and
// Niala's "When you play this ship, discard two cards from hand." A clause that does more than the discard
// (Modern Galor, Dominion Galor, Bennet) is left out.
const DISCARD_A_CARD_TITLES = [
  'Borven',
  'Damar Martyred Outlaw',
  'Elim Garak Imposing Patriot',
  'Jake Sisko Reporter Behind the Lines',
  'Kira Nerys Reformed Collaborator',
  'Leeta Rebel Supporter',
  'Marris',
  'Natima Lang Professor of Political Ethics',
  'Odo Wayward Link',
  'Quark Resistance Informant',
  'Rekelen',
  'Rom Undercover Spy',
  'Tekeny Ghemor Prominent Official',
  'Tora Ziyal Beloved Daughter',
  'Yassim Vocal Martyr',
];

export const PLAY_MODELS: PlayModel[] = [
  // "When you play this personnel, if each of your non-headquarters missions requires Intelligence, you may
  // draw up to seven cards, then discard two cards from hand."
  {
    kind: 'drawUpToThenDiscard',
    title: 'Enabran Tain "Retired" Spymaster',
    drawUpTo: 7,
    discard: 2,
    condition: { kind: 'nonHeadquartersRequire', skill: 'Intelligence' },
    text: 'You may draw up to seven cards, then discard two cards from hand.',
  },
  ...DISCARD_A_CARD_TITLES.map(
    (title): DiscardFromHandModel => ({ kind: 'discardFromHand', title, discard: 1, text: 'Discard a card from hand.' })
  ),
  { kind: 'discardFromHand', title: 'Niala Intelligence Asset', discard: 2, text: 'Discard two cards from hand.' },
  // "When you play this personnel, you may examine the top four cards of your deck and take one into hand. Place
  // the remaining cards on the bottom of your deck in any order."
  {
    kind: 'examineTake',
    title: 'Requisitions Drone',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: true,
    text: 'You may examine the top four cards of your deck and take one into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… you may examine the top four cards of your deck. You may reveal one event and take it into hand. …"
  {
    kind: 'examineTake',
    title: 'Lenara Kahn Wormhole Theorist',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'typeOrKeyword', types: ['event'] },
    testText: 'an event',
    text: 'You may examine the top four cards of your deck. You may reveal one event and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal a card that has a cost of 4 or more and take it into your hand. …"
  {
    kind: 'examineTake',
    title: "Keiko O'Brien Botanist",
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'costAtLeast', cost: 4 },
    testText: 'a card with a cost of 4 or more',
    text: 'You may examine the top four cards of your deck. You may reveal a card that has a cost of 4 or more and take it into your hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may reveal an interrupt or a Temporal card and take it into hand. …"
  {
    kind: 'examineTake',
    title: 'Harry Kim Remorseful Survivor',
    examine: 4,
    take: { kind: 'fixed', count: 1 },
    mustTake: false,
    test: { kind: 'typeOrKeyword', types: ['interrupt'], keywords: ['temporal'] },
    testText: 'an interrupt or a Temporal card',
    text: 'You may examine the top four cards of your deck. You may reveal an interrupt or a Temporal card and take it into hand. Place the remaining cards on the bottom of your deck in any order.',
  },
  // "… You may take one card into hand for each different Commodity in your core, then place the remaining cards …"
  {
    kind: 'examineTake',
    title: 'Sobi Felicium Dealer',
    examine: 4,
    take: { kind: 'differentCoreKeyword', keyword: 'commodity' },
    mustTake: false,
    text: 'You may examine the top four cards of your deck. You may take one card into hand for each different Commodity in your core, then place the remaining cards on the bottom of your deck in any order.',
  },
  ...SCORE_MODELS,
];

const BY_TITLE = new Map(PLAY_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The "when you play" model of the card named `name`, by its title, or undefined. */
export const playModelOf = (name: string): PlayModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

/** The steps of a model, in order. */
export const playStepsOf = (model: PlayModel): PlayStepSpec[] => {
  switch (model.kind) {
    case 'drawUpToThenDiscard':
      return [
        { step: 'draw', may: true },
        { step: 'discard', may: false },
      ];
    case 'discardFromHand':
      return [{ step: 'discard', may: false }];
    case 'examineTake':
      return [{ step: 'examine', may: true }];
    case 'score':
      // Skip shows even without "you may" (#1812), since the table may not read the condition right.
      return [{ step: 'score', may: true }];
  }
};

export type PlayConditionStatus = 'met' | 'notMet' | 'unchecked';

export interface PlayConditionState {
  status: PlayConditionStatus;
  /** The condition's words, "each of your non-headquarters missions requires Intelligence". */
  text: string;
}

const conditionWords = (condition: PlayCondition): string =>
  condition.kind === 'nonHeadquartersRequire' ? `each of your non-headquarters missions requires ${condition.skill}` : condition.text;

/** Whether the model's condition holds on the facts of the table, or null for a model with none. */
export function playConditionOf(model: PlayModel, facts: PlayConditionFacts): PlayConditionState | null {
  const condition = model.condition;
  if (!condition) return null;
  const text = conditionWords(condition);
  if (condition.kind === 'unchecked') return { status: 'unchecked', text };
  if (condition.kind === 'table') return { status: condition.holds(facts) ? 'met' : 'notMet', text };
  const met = (facts.missions ?? []).every((m) => m.type === '' || m.type === 'h' || missionRequires(m, condition.skill));
  return { status: met ? 'met' : 'notMet', text };
}

/** "Condition met: …", "Condition not met: …" or "Condition not checked: …". */
export function playConditionLine(model: PlayModel, state: PlayConditionState): string {
  if (state.status === 'met') return `Condition met: ${state.text}`;
  if (state.status === 'notMet') return `Condition not met: ${state.text}`;
  const needs = model.condition?.kind === 'unchecked' ? model.condition.needs : 'the table cannot read it';
  return `Condition not checked: ${needs}`;
}

/** The cards a draw of `wanted` takes from a draw deck of `deck` cards, the count clamped to `0..drawUpTo`. */
export const drawUpToCount = (model: DrawUpToThenDiscardModel, wanted: number, deck: number): number =>
  Math.max(0, Math.min(Math.floor(wanted), model.drawUpTo, deck));

/** The cards the discard step asks for: the model's number, or the whole hand when it holds fewer. */
export const discardCount = (model: PlayModel, hand: number): number => ('discard' in model ? Math.min(model.discard, hand) : 0);

/** The cards an examine looks at: the model's number, or the whole draw deck when it holds fewer. */
export const examineCount = (model: ExamineTakeModel, deck: number): number => Math.max(0, Math.min(model.examine, deck));

const words = (value: unknown): string[] =>
  String(value ?? '')
    .toLowerCase()
    .split('.')
    .map((k) => k.trim())
    .filter(Boolean);

/** Whether the examine may take `card`: every card for a model with no test. */
export function examineTakes(model: ExamineTakeModel, card: ExaminedCard | null | undefined): boolean {
  const test = model.test;
  if (!test) return true;
  if (!card) return false;
  if (test.kind === 'costAtLeast') return (Number(card.cost) || 0) >= test.cost;
  const type = String(card.type ?? '').toLowerCase();
  const keywords = words(card.keywords);
  return test.types.includes(type) || (test.keywords ?? []).some((k) => keywords.includes(k));
}

/** The most cards the examine may take: the fixed number, or one for each different title of the core with the keyword. */
export function examineTakeMax(model: ExamineTakeModel, facts: { coreCards?: CostCoreCard[] }): number {
  if (model.take.kind === 'fixed') return model.take.count;
  const keyword = model.take.keyword;
  return new Set((facts.coreCards ?? []).filter((c) => c.keywords.includes(keyword)).map((c) => c.title.toLowerCase())).size;
}

/** The fewest cards the examine takes of `examined`: one for a "take one" when a card may be taken, else none. */
export const examineTakeMin = (model: ExamineTakeModel, examined: (ExaminedCard | null | undefined)[], max: number): number =>
  model.mustTake && max > 0 && examined.some((c) => examineTakes(model, c)) ? 1 : 0;

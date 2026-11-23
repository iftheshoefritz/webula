// The effect steps of the practice table (#1863): one vocabulary for what the "when you play" models
// (`src/lib/playModels/`) and the resolve models of events (`src/lib/resolveModels/`) automate. A model is a
// list of steps, in the order of its text, each with whether it is a "may":
// - `draw`: a fixed number of cards (Downfallen Civilization's 3 while no mission is completed too), up to a
//   number the player picks, the printed cost of a personnel the player picks, or a number after a pick of the
//   step before that has an icon (Second Edition's [AU]).
// - `discardFromHand`: N cards of the hand, or the whole hand when it holds fewer.
// - `bottomFromHand`: N cards of the hand to the bottom of the draw deck, in the player's order.
// - `examine`: the top N of the draw deck, some taken into hand, the rest to the bottom in the player's order.
// - `download`: up to N cards of the draw deck that pass a test, or a copy of a personnel the player commands,
//   into hand, aboard a ship, played aboard the played ship, or on top of the draw deck.
// - `shuffle`: the draw deck.
// - `score`: N points.
// - `exchange`: a personnel of the hand with one the player commands.
//
// A step that needs no input of the player (a shuffle, a fixed draw or a draw after a pick) runs with the step
// before it: one step the player acts on, and the steps that follow it on their own, are one *stage*, one panel,
// one action, one log record and one undo (`stagesOf`). The first step of a model always starts a stage.
//
// It imports no React and no reducer.

import { cardTitleOf } from './cardTitle';
import type { CostCoreCard } from './costModels/model';

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

/** A card of the draw deck as the test of a download reads it, as the card data has it, lowercased. */
export interface DownloadedCard {
  name?: unknown;
  type?: unknown;
  affiliation?: unknown;
  icons?: unknown;
  keywords?: unknown;
  species?: unknown;
  skills?: unknown;
  cost?: unknown;
  unique?: unknown;
}

/**
 * One test of the card a download takes (#1810): every field it has must hold, each by one of its values, all
 * lowercased. `titles` holds a card of that title, or, for a personnel or a ship, a version of that persona
 * ("{Kahless}" holds Kahless The Unforgettable); `affiliations` an affiliation by inclusion ("[Baj]" is
 * "bajoran"); `icons` an icon of the icons field ("[tng]").
 */
export interface DownloadTest {
  titles?: string[];
  types?: string[];
  affiliations?: string[];
  icons?: string[];
  keywords?: string[];
  species?: string[];
  skills?: string[];
  /** Keywords the card must not have (#1811): "a non-Drone personnel". */
  notKeywords?: string[];
  /** The least printed cost (#1811): "who has a cost of 4 or more". */
  costAtLeast?: number;
  /** A unique card (#1866): "two unique [Bor] personnel". */
  unique?: true;
}

/** The cards of a draw step. */
export type DrawCount =
  // A fixed number; `withoutCompleted` instead while the player commands no completed mission (#1745).
  | { kind: 'fixed'; count: number; withoutCompleted?: number }
  // Up to `count`, a number the player picks from 0 (#1800).
  | { kind: 'upTo'; count: number }
  // The printed cost of a personnel the player picks, stopped or not, never the brig (#1739).
  | { kind: 'personnelCost' }
  // `count` when the personnel the step before picked has `icon`, lowercased ("[au]"), else none (#1746).
  | { kind: 'ifPickedIcon'; icon: string; count: number };

/** What a download takes: the cards of the draw deck that pass a test, or a copy of a personnel the player commands (#1746). */
export type DownloadOf = { kind: 'test'; test: DownloadTest[]; testText: string } | { kind: 'copyOfCommanded' };

/**
 * Where a downloaded card goes (#1811): the hand; aboard one of the player's ships of an affiliation, which the
 * player picks; played aboard the played ship at its printed cost less `discount`; on top of the draw deck,
 * after the shuffle of its stage; or into the away team of the mission whose text it is (#1907, Nimbus III's
 * spend, "place him or her on this planet").
 */
export type DownloadTo =
  | { kind: 'hand' }
  | { kind: 'aboardShip'; affiliation: string; text: string }
  | { kind: 'playAboardThis'; discount: number }
  | { kind: 'drawDeckTop' }
  | { kind: 'thisAwayTeam' };

export interface DrawStep {
  kind: 'draw';
  count: DrawCount;
  may?: boolean;
}

export interface DiscardFromHandStep {
  kind: 'discardFromHand';
  count: number;
  may?: boolean;
}

export interface BottomFromHandStep {
  kind: 'bottomFromHand';
  count: number;
  /** The player sets the order, the last at the very bottom. */
  ordered: true;
  may?: boolean;
}

export interface ExamineStep {
  kind: 'examine';
  /** The cards of the top of the draw deck it examines. */
  count: number;
  take: ExamineTakeCount;
  /** Whether a card must be taken once the cards are examined (Requisitions Drone), or "you may" take one. */
  mustTake: boolean;
  test?: ExamineTest;
  /** The words of the test, for the panel: "an event". */
  testText?: string;
  /** Where the cards not taken go: the bottom of the draw deck, in the player's order. */
  rest: 'bottomOrdered';
  may?: boolean;
}

export interface DownloadStep {
  kind: 'download';
  of: DownloadOf;
  /** The most cards the player may download. */
  upTo: number;
  to: DownloadTo;
  may?: boolean;
}

export interface ShuffleStep {
  kind: 'shuffle';
}

export interface ScoreStep {
  kind: 'score';
  points: number;
  may?: boolean;
}

/**
 * "Exchange a [Vid] personnel in hand with a [Vid] personnel you command and own." (#1765), and The Crossing's
 * "Replace one of your personnel with a personnel of the same affiliation from your hand." (#1826).
 */
export interface ExchangeStep {
  kind: 'exchange';
  /**
   * The affiliation, lowercased, both personnel of the exchange must have ("vidiian"). Absent, the two must
   * share an affiliation, whichever it is (The Crossing).
   */
  affiliation?: string;
  /** Where the personnel taken off the table goes. */
  replacedTo: 'hand' | 'discard';
  may?: boolean;
}

export type EffectStep = DrawStep | DiscardFromHandStep | BottomFromHandStep | ExamineStep | DownloadStep | ShuffleStep | ScoreStep | ExchangeStep;

export type EffectStepKind = EffectStep['kind'];

// The step builders of the registries' rows.
export const draw = (count: number, opts: { withoutCompleted?: number; may?: boolean } = {}): DrawStep => ({
  kind: 'draw',
  count: { kind: 'fixed', count, ...(opts.withoutCompleted !== undefined ? { withoutCompleted: opts.withoutCompleted } : {}) },
  ...(opts.may ? { may: true } : {}),
});
export const drawUpTo = (count: number, may = true): DrawStep => ({ kind: 'draw', count: { kind: 'upTo', count }, ...(may ? { may } : {}) });
export const drawPersonnelCost = (): DrawStep => ({ kind: 'draw', count: { kind: 'personnelCost' } });
export const drawIfPickedIcon = (icon: string, count: number): DrawStep => ({ kind: 'draw', count: { kind: 'ifPickedIcon', icon, count } });
export const discardFromHand = (count: number, may = false): DiscardFromHandStep => ({ kind: 'discardFromHand', count, ...(may ? { may } : {}) });
export const bottomFromHand = (count: number): BottomFromHandStep => ({ kind: 'bottomFromHand', count, ordered: true });
export const download = (upTo: number, testText: string, test: DownloadTest[]): DownloadStep => ({
  kind: 'download',
  of: { kind: 'test', test, testText },
  upTo,
  to: { kind: 'hand' },
  may: true,
});
export const shuffle = (): ShuffleStep => ({ kind: 'shuffle' });
export const score = (points: number): ScoreStep => ({ kind: 'score', points, may: true });

/** Whether a step runs on its own, with no input of the player, so it joins the stage of the step before it. */
export const isAutomaticStep = (step: EffectStep): boolean =>
  step.kind === 'shuffle' || (step.kind === 'draw' && (step.count.kind === 'fixed' || step.count.kind === 'ifPickedIcon'));

/** A stage: the step the player acts on (`lead`), then the automatic steps after it, and whether it is a "may". */
export interface EffectStage {
  index: number;
  lead: EffectStep;
  steps: EffectStep[];
  may: boolean;
}

/** The stages of a list of steps, in order: a new stage at the first step and at every step that is not automatic. */
export function stagesOf(steps: EffectStep[]): EffectStage[] {
  const stages: EffectStage[] = [];
  steps.forEach((step, i) => {
    const last = stages[stages.length - 1];
    if (i > 0 && last && isAutomaticStep(step)) {
      last.steps.push(step);
      return;
    }
    stages.push({ index: stages.length, lead: step, steps: [step], may: 'may' in step && step.may === true });
  });
  return stages;
}

/** The first step of `kind` of a list of steps, or undefined. */
export function stepOf<K extends EffectStepKind>(steps: EffectStep[], kind: K): Extract<EffectStep, { kind: K }> | undefined {
  return steps.find((s): s is Extract<EffectStep, { kind: K }> => s.kind === kind);
}

/** The cards a draw step draws, before the clamp to the draw deck, or null for a count the player picks. */
export function drawWanted(count: DrawCount, facts: { anyCompleted: boolean; pickedIcons?: (icon: string) => boolean }): number | null {
  if (count.kind === 'fixed') return !facts.anyCompleted && count.withoutCompleted !== undefined ? count.withoutCompleted : count.count;
  if (count.kind === 'ifPickedIcon') return facts.pickedIcons?.(count.icon) ? count.count : 0;
  return null;
}

/** The cards a draw of `wanted` takes from a draw deck of `deck` cards, the count clamped to `0..most`. */
export const drawUpToCount = (most: number, wanted: number, deck: number): number => Math.max(0, Math.min(Math.floor(wanted), most, deck));

/** The cards a hand step asks for: the step's number, or the whole hand when it holds fewer. */
export const handCount = (step: { count: number }, hand: number): number => Math.min(step.count, hand);

/** The cards an examine looks at: the step's number, or the whole draw deck when it holds fewer. */
export const examineCount = (step: Pick<ExamineStep, 'count'>, deck: number): number => Math.max(0, Math.min(step.count, deck));

const words = (value: unknown): string[] =>
  String(value ?? '')
    .toLowerCase()
    .split('.')
    .map((k) => k.trim())
    .filter(Boolean);

/** Whether the examine may take `card`: every card for a step with no test. */
export function examineTakes(step: Pick<ExamineStep, 'test'>, card: ExaminedCard | null | undefined): boolean {
  const test = step.test;
  if (!test) return true;
  if (!card) return false;
  if (test.kind === 'costAtLeast') return (Number(card.cost) || 0) >= test.cost;
  const type = String(card.type ?? '').toLowerCase();
  const keywords = words(card.keywords);
  return test.types.includes(type) || (test.keywords ?? []).some((k) => keywords.includes(k));
}

/** The most cards the examine may take: the fixed number, or one for each different title of the core with the keyword. */
export function examineTakeMax(step: Pick<ExamineStep, 'take'>, facts: { coreCards?: CostCoreCard[] }): number {
  if (step.take.kind === 'fixed') return step.take.count;
  const keyword = step.take.keyword;
  return new Set((facts.coreCards ?? []).filter((c) => c.keywords.includes(keyword)).map((c) => c.title.toLowerCase())).size;
}

/** The fewest cards the examine takes of `examined`: one for a "take one" when a card may be taken, else none. */
export const examineTakeMin = (step: Pick<ExamineStep, 'mustTake' | 'test'>, examined: (ExaminedCard | null | undefined)[], max: number): number =>
  step.mustTake && max > 0 && examined.some((c) => examineTakes(step, c)) ? 1 : 0;

/** Whether a download may take `card`: it passes one of the tests. */
export function downloadTakes(of: { test: DownloadTest[] }, card: DownloadedCard | null | undefined): boolean {
  if (!card) return false;
  const type = String(card.type ?? '').toLowerCase();
  const title = cardTitleOf(String(card.name ?? '')).toLowerCase();
  const affiliation = String(card.affiliation ?? '').toLowerCase();
  const icons: string[] = String(card.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [];
  const keywords = words(card.keywords);
  const species = String(card.species ?? '')
    .toLowerCase()
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  // The skills as words, the counts dropped, as `skillWordsOf` reads them.
  const skills = String(card.skills ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const persona = type === 'personnel' || type === 'ship';
  const passes = (t: DownloadTest): boolean =>
    (!t.titles || t.titles.some((n) => title === n || (persona && title.startsWith(`${n} `)))) &&
    (!t.types || t.types.includes(type)) &&
    (!t.affiliations || t.affiliations.some((a) => affiliation.includes(a))) &&
    (!t.icons || t.icons.some((i) => icons.includes(i))) &&
    (!t.keywords || t.keywords.some((k) => keywords.includes(k))) &&
    (!t.species || t.species.some((sp) => species.includes(sp))) &&
    (!t.skills || t.skills.some((sk) => skills.includes(sk))) &&
    (!t.notKeywords || !t.notKeywords.some((k) => keywords.includes(k))) &&
    (t.costAtLeast === undefined || (Number(card.cost) || 0) >= t.costAtLeast) &&
    (!t.unique || String(card.unique ?? '').toLowerCase() === 'y');
  return of.test.some(passes);
}

/** Where the played card stands (#1810): the mission slot and its instance id, for "at this mission". */
export interface PlayedAt {
  missionIndex?: number;
  id?: string;
}

/** A ship of the player as a download destination (#1811): its instance id, its affiliation and its mission slot. */
export interface DownloadShip {
  id: string;
  affiliation: string;
  missionIndex: number;
}

/**
 * The ships a download may place its card aboard (#1811), the ships of the played card's mission slot first,
 * then the rest in slot order: for `'aboardShip'` the ships of its affiliation, for `'playAboardThis'` the
 * played ship alone, and none otherwise.
 */
export function downloadPlaceShips<S extends DownloadShip>(to: DownloadTo, ships: S[], played: PlayedAt): S[] {
  if (to.kind !== 'aboardShip' && to.kind !== 'playAboardThis') return [];
  if (to.kind === 'playAboardThis') return ships.filter((s) => s.id === played.id);
  const own = ships.filter((s) => s.affiliation.toLowerCase().includes(to.affiliation));
  return [...own.filter((s) => s.missionIndex === played.missionIndex), ...own.filter((s) => s.missionIndex !== played.missionIndex)];
}

/** The cost of the play of `'playAboardThis'` (#1811): the printed cost less the discount, never below 0. */
export const downloadPlayCost = (to: DownloadTo, printed: number): number | null =>
  to.kind === 'playAboardThis' ? Math.max(0, printed - to.discount) : null;

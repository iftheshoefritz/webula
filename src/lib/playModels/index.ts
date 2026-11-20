// The "when you play" models of the practice table (#1800): what the table automates of the text of a
// personnel or a ship that acts when the player plays it, "When you play this personnel, …". One model per
// title, by whole title (`cardTitleOf`), in the style of the resolve models of events
// (`src/lib/resolveModels/`). A model names its steps, each with whether it is a "may", and a condition.
// It ships one kind:
// - `'drawUpToThenDiscard'`: the player may draw up to N cards, a count the player picks from 0 to N, then
//   discards M cards from hand (Enabran Tain "Retired" Spymaster).
// A personnel or a ship with no model plays as before.
//
// It imports no React and no reducer: the condition reads the facts of the cost models (`CostFacts`).

import { cardTitleOf } from '../cardTitle';
import type { CostFacts } from '../costModels/model';
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

export type PlayCondition = NonHeadquartersRequireCondition | UncheckedCondition;

/** The names of the steps a model can have. */
export type PlayStepName = 'draw' | 'discard';

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

export type PlayModel = DrawUpToThenDiscardModel;

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
export function playConditionOf(model: PlayModel, facts: Pick<CostFacts, 'missions'>): PlayConditionState | null {
  const condition = model.condition;
  if (!condition) return null;
  const text = conditionWords(condition);
  if (condition.kind === 'unchecked') return { status: 'unchecked', text };
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
export const discardCount = (model: DrawUpToThenDiscardModel, hand: number): number => Math.min(model.discard, hand);

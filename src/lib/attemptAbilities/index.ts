// The abilities a card uses while it attempts a mission (#1835): "While this personnel is attempting a mission, you
// may make the ship he is aboard Weapons +5 until the end of this mission attempt. If you do this, he is killed at
// the end of this turn. You may do this only once each turn." One row per ability, by whole title (`cardTitleOf`),
// plain data: its text, a condition on the attempted mission, a use limit, and its steps.
//
// The steps of today:
// - `modify`: a change of numbers for the rest of the attempt, to the card itself (`self`), to the ship it is aboard
//   (`itsShip`), or to one personnel of the attempting group the player chooses (`chosenPersonnel`, one offer per
//   unstopped personnel). The use keeps it on `Attempt.timed`, so the attribute readers add it and `endAttempt` ends
//   it; a change of a `facingDilemma` row ends earlier, with its dilemma (`TimedChange.untilDilemma`).
// - `gainSkill` (#1958): the card itself (`self`) or a chosen personnel of the group (`chosenPersonnel`) gains one
//   level of a skill it already has, the player's pick among `gainSkillOptionsOf`, kept on `Attempt.timed` as a
//   `TimedChange` with `skills`, so it ends as a `modify` change ends. The gained level is not a listed skill (p. 9).
// - `killAtEndOfTurn`: a delayed trigger, "he is killed at the end of this turn". The use's log entry sets it up;
//   the trigger rows of `src/lib/triggers/titles/delayed.ts` offer the kill when the next turn starts, from that
//   entry (`afterAbility`), once.
//
// The source: by default (`self`) the card is an unstopped personnel of the attempting group (the away team at a
// planet mission, the crew of the attempting ship at a space mission); a `core` row's card is in the core, and its
// change goes to a chosen personnel of the group, "your personnel" facing the dilemma (#1956).
//
// The window (#1956), as the Glossary times both in step 3h of "attempting missions" (p. 17): `attempting`, the whole
// attempt, the default; or `facingDilemma`, "While your personnel is facing a dilemma, you may …", from the reveal of
// the top card of the stack in `'face'` until that dilemma leaves the top of the stack ("is no longer being faced",
// Glossary › "dilemmas", p. 17). A "While" row has no limit: each use is its own, with its own cost. A later "When …
// facing a dilemma" row may need a per-dilemma limit; the use's log entry records the faced dilemma's id for it.
//
// The attempted mission passes the condition in either window. It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';
import type { AmountQuantity } from '../modifiers/model';
import type { MissionQuery } from '../tableView';
import { ONCE_EACH_TURN, type UseLimit } from '../useLimit';

/** A change of numbers for the rest of the attempt, to the card itself, the ship it is aboard, or a chosen personnel. */
export interface ModifyStep {
  kind: 'modify';
  target: 'self' | 'itsShip' | 'chosenPersonnel';
  changes: Partial<Record<AmountQuantity, number>>;
}

/** "Make that personnel gain a skill he or she already has": one more level of a skill the target has, its pick. */
export interface GainSkillStep {
  kind: 'gainSkill';
  target: 'self' | 'chosenPersonnel';
}

/** "He is killed at the end of this turn": a delayed trigger the use sets up. */
export interface KillAtEndOfTurnStep {
  kind: 'killAtEndOfTurn';
}

export type AttemptAbilityStep = ModifyStep | GainSkillStep | KillAtEndOfTurnStep;

export interface AttemptAbility {
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** Which ability of the card this is, from 0. */
  index: number;
  /** The clause, for the log and the button's title. */
  text: string;
  /** The button's words: "Weapons +5". */
  label: string;
  /** The attempted mission must pass this query ("a [GQ] mission"); absent: any mission. */
  mission?: MissionQuery;
  /** When the ability may be used (#1956); absent: `attempting`. */
  window?: AttemptAbilityWindow;
  /** Where its card must be (#1956); absent: `self`, the card is an attempting personnel. */
  source?: AttemptAbilitySource;
  limit?: UseLimit;
  steps: AttemptAbilityStep[];
}

export type AttemptAbilityWindow = 'attempting' | 'facingDilemma';
export type AttemptAbilitySource = 'self' | 'core';

export const windowOf = (a: AttemptAbility): AttemptAbilityWindow => a.window ?? 'attempting';
export const sourceOf = (a: AttemptAbility): AttemptAbilitySource => a.source ?? 'self';

/**
 * Whether a row's source and its change agree (#1956): a `core` row's card attempts nothing, so its change goes to a
 * chosen personnel; a `self` row's change goes to the card or its ship, never to a chosen one.
 */
export function attemptAbilityRowValid(a: AttemptAbility): boolean {
  const targets = a.steps.flatMap((s) => (s.kind === 'modify' || s.kind === 'gainSkill' ? [s.target] : []));
  return sourceOf(a) === 'core' ? targets.every((t) => t === 'chosenPersonnel') : !targets.includes('chosenPersonnel');
}

const PERSONNEL_PLUS = (n: number): Partial<Record<AmountQuantity, number>> => ({ integrity: n, cunning: n, strength: n });

export const ATTEMPT_ABILITIES: readonly AttemptAbility[] = [
  {
    title: 'Storil Courageous Captain',
    index: 0,
    text: 'While this personnel is attempting a mission, you may make the ship he is aboard Weapons +5 until the end of this mission attempt. If you do this, he is killed at the end of this turn. You may do this only once each turn.',
    label: 'Weapons +5',
    limit: ONCE_EACH_TURN,
    steps: [{ kind: 'modify', target: 'itsShip', changes: { weapons: 5 } }, { kind: 'killAtEndOfTurn' }],
  },
  {
    title: 'Worf Honorable Explorer',
    index: 0,
    text: 'While this personnel is attempting a [GQ] mission, you may make him attributes +2 until the end of this mission attempt. If you do this, he is killed at the end of this turn. You may do this only once each turn.',
    label: 'Attributes +2',
    mission: { quadrant: 'g' },
    limit: ONCE_EACH_TURN,
    steps: [{ kind: 'modify', target: 'self', changes: PERSONNEL_PLUS(2) }, { kind: 'killAtEndOfTurn' }],
  },
  {
    title: "Ikat'ika Honorable Warrior",
    index: 0,
    text: 'While this personnel is attempting a mission, you may make him attributes +2 until the end of this mission attempt. If you do this, he is killed at the end of this turn. You may do this only once each turn.',
    label: 'Attributes +2',
    limit: ONCE_EACH_TURN,
    steps: [{ kind: 'modify', target: 'self', changes: PERSONNEL_PLUS(2) }, { kind: 'killAtEndOfTurn' }],
  },
];

const BY_TITLE = new Map<string, AttemptAbility[]>();
for (const a of ATTEMPT_ABILITIES) {
  const key = a.title.toLowerCase();
  BY_TITLE.set(key, [...(BY_TITLE.get(key) ?? []), a]);
}

/** The attempt abilities of a card, by its name or title, in the order of its text. */
export const attemptAbilitiesOfTitle = (name: string): AttemptAbility[] => BY_TITLE.get(cardTitleOf(name).toLowerCase()) ?? [];

/** The titles of the registry, in the case of the card data, each once: the model backlog's. */
export const ATTEMPT_ABILITY_TITLES: readonly string[] = [...new Set(ATTEMPT_ABILITIES.map((a) => a.title))];

/** Whether an ability makes a personnel gain a skill it has (#1958). */
export const gainsSkill = (a: AttemptAbility): boolean => a.steps.some((s) => s.kind === 'gainSkill');

/** Whether an ability sets up the kill at the end of the turn. */
export const killsAtEndOfTurn = (a: AttemptAbility): boolean => a.steps.some((s) => s.kind === 'killAtEndOfTurn');

const QUANTITY_WORDS: Record<AmountQuantity, string> = {
  integrity: 'Integrity',
  cunning: 'Cunning',
  strength: 'Strength',
  range: 'Range',
  weapons: 'Weapons',
  shields: 'Shields',
};

/** The words of a change: "Weapons +5", "attributes +2" for the three personnel attributes alike. */
export function changesText(changes: Partial<Record<AmountQuantity, number>>): string {
  const entries = Object.entries(changes) as [AmountQuantity, number][];
  const sign = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
  const n = changes.integrity;
  if (entries.length === 3 && n !== undefined && changes.cunning === n && changes.strength === n) return `attributes ${sign(n)}`;
  return entries.map(([q, d]) => `${QUANTITY_WORDS[q]} ${sign(d)}`).join(', ');
}

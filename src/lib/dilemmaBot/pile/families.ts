import { RequirementBranch, SKILL_INDEX, parseRequirementBranches } from '../requirements';
import { Attr, PlayState } from './play';

// The families of the dilemma registry (#1320, the pilot). A family is a shape of dilemma text with
// parameters, such as "Unless you have <requirements>, <effect>" or "Choose a personnel who has <skills>
// to be stopped. If you cannot, <effect>". Each builder returns the `play` of a `DilemmaModel`.

export type Play = (s: PlayState) => void;
export type Test = (s: PlayState, k: number) => boolean;

/** The branches of a requirement text, such as "2 Medical and Cunning>38 or Telepathy". Throws on a text the parser cannot read. */
export function req(text: string): RequirementBranch[] {
  const branches = parseRequirementBranches(text);
  if (!branches) throw new Error(`the requirement parser cannot read "${text}"`);
  return branches;
}

/** The index of a skill in `BOT_SKILLS`. */
export function sk(name: string): number {
  const i = SKILL_INDEX[name.toLowerCase()];
  if (i === undefined) throw new Error(`unknown skill ${name}`);
  return i;
}

// ---- Effects: what a dilemma does to the attempting personnel ----

export const stopAll: Play = (s) => s.stopAll();
export const killRandom = (count: number, test?: Test): Play => (s) =>
  s.kill(s.select(count, test ? s.unstopped().filter((k) => test(s, k)) : undefined));
export const brigRandom = (count: number): Play => (s) => s.brig(s.select(count));
export const stopRandom = (count: number): Play => (s) => s.stop(s.select(count));
export const killRandomThenStopAll: Play = (s) => {
  s.kill(s.select(1));
  s.stopAll();
};
export const loseShip: Play = (s) => s.loseShip();
export const noEffect: Play = (s) => s.trace?.('  no effect during the attempt');

/** Each effect in turn. */
export const both = (...effects: Play[]): Play => (s) => effects.forEach((e) => s.live > 0 && e(s));

// ---- Tests on one personnel ----

export const hasAny = (...skills: string[]): Test => {
  const ix = skills.map(sk);
  return (s, k) => s.hasSkill(k, ...ix);
};
export const attrAbove = (a: Attr, n: number): Test => (s, k) => s.attr(k, a) > n;
export const attrBelow = (a: Attr, n: number): Test => (s, k) => s.attr(k, a) < n;
export const costAtMost = (n: number): Test => (s, k) => s.group[k].cost <= n;
export const either = (...tests: Test[]): Test => (s, k) => tests.some((t) => t(s, k));
export const affiliationIs = (icon: string): Test => (s, k) => s.group[k].affiliation === icon;
/** "A skill required by this mission": a skill some branch of the requirements names. */
export const hasRequiredSkill: Test = (s, k) => s.requirements.some((b) => b.skills.some((n, i) => n > 0 && s.skill(k, i) > 0));
/** A printed keyword, lowercased, such as `'admiral'`. A personnel with no `traits` has none. */
export const keywordIs = (keyword: string): Test => (s, k) => !!s.group[k].traits?.keywords.includes(keyword);
/** A printed icon, lowercased, such as `'[cmd]'`. A personnel with no `traits` has none. */
export const iconIs = (icon: string): Test => (s, k) => !!s.group[k].traits?.icons.includes(icon);

// ---- The families ----

/** "Unless you have <requirements>, <effect>." */
export const unless = (requirements: string, effect: Play): Play => {
  const branches = req(requirements);
  return (s) => {
    if (s.has(branches)) s.trace?.(`  the group has ${requirements}: no effect`);
    else effect(s);
  };
};

/** "Unless <a test of the whole group>, <effect>." A condition the requirement parser cannot read. */
export const unlessGroup = (holds: (s: PlayState) => boolean, effect: Play, what = 'the condition'): Play => (s) => {
  if (holds(s)) s.trace?.(`  ${what} holds: no effect`);
  else effect(s);
};

/** "Choose a personnel who has <test> to be stopped. If you cannot, <otherwise>." The player chooses. */
export const chooseOrElse = (test: Test, otherwise: Play | null): Play => (s) => {
  const candidates = s.unstopped().filter((k) => test(s, k));
  if (candidates.length) s.stop(s.playerChooses(candidates));
  else if (otherwise) otherwise(s);
  else s.trace?.('  no personnel qualifies: no effect');
};

/** "Unless you have <test>, all your personnel are stopped. If you have two or more, all but one are stopped." */
export const allButOne = (test: Test): Play => (s) => {
  const holders = s.unstopped().filter((k) => test(s, k));
  if (!holders.length) s.stopAll();
  else if (holders.length >= 2) {
    const keep = s.select(1, holders)[0];
    s.stop(holders.filter((k) => k !== keep));
  }
};

/** "Randomly select <count> personnel" and act on them. */
export const selectRandom = (count: number, act: (s: PlayState, selected: number[]) => void): Play => (s) => {
  const selected = s.select(count);
  s.trace?.(`  selects ${selected.map((k) => s.name(k)).join(', ')}`);
  act(s, selected);
};

/** "Randomly select <count> personnel. Each of those personnel who does not have <test> is <effect>." */
export const selectEachWithout = (count: number, test: Test, effect: 'stop' | 'kill'): Play =>
  selectRandom(count, (s, selected) => {
    const hit = selected.filter((k) => !test(s, k));
    if (effect === 'stop') s.stop(hit);
    else s.kill(hit);
  });

/**
 * "Randomly select <count> personnel. Unless those personnel have <requirements> [or your unselected
 * personnel have <rest>], <effect>." The requirements are read on the selected personnel alone.
 */
export const unlessSelected = (count: number, requirements: string, effect: (s: PlayState, selected: number[]) => void, rest?: string): Play => {
  const branches = req(requirements);
  const restBranches = rest ? req(rest) : null;
  return selectRandom(count, (s, selected) => {
    if (s.hasAmong(branches, selected)) s.trace?.(`  the selected personnel have ${requirements}: no effect`);
    else if (restBranches && s.hasAmong(restBranches, s.unstopped().filter((k) => !selected.includes(k)))) s.trace?.(`  the unselected personnel have ${rest}: no effect`);
    else effect(s, selected);
  });
};

/** "Randomly select personnel until <done>. <act> each selected personnel." Every personnel is selected once at most. */
export const selectUntil = (done: (s: PlayState, selected: number[]) => boolean, act: (s: PlayState, selected: number[]) => void): Play => (s) => {
  const order = s.select(s.live);
  const selected: number[] = [];
  for (const k of order) {
    selected.push(k);
    if (done(s, selected)) break;
  }
  act(s, selected);
};

/** "Your opponent chooses <count> personnel to be <effect>." The bot chooses, among `test` when given. */
export const botChooses = (count: number, effect: 'stop' | 'kill' | 'brig' | 'discard', test?: Test): Play => (s) => {
  const candidates = s.unstopped().filter((k) => !test || test(s, k));
  const chosen = s.botChooses(candidates, count);
  if (effect === 'stop') s.stop(chosen);
  else if (effect === 'kill') s.kill(chosen);
  else if (effect === 'discard') s.kill(chosen);
  else s.brig(chosen);
};

/** "Choose <count> personnel to be stopped." The player chooses. */
export const playerStops = (count: number | ((s: PlayState) => number)): Play => (s) =>
  s.stop(s.playerChooses(s.unstopped(), typeof count === 'number' ? count : count(s)));

/** "Choose <count> personnel to be placed in your opponent's brig." The player chooses. */
export const playerBrigs = (count: number): Play => (s) => s.brig(s.playerChooses(s.unstopped(), count));

/**
 * "Choose <count> personnel to be placed in your discard pile." The player chooses; a personnel placed in
 * the discard pile counts as killed.
 */
export const playerDiscards = (count: number): Play => (s) => s.kill(s.playerChooses(s.unstopped(), count));

/**
 * "Randomly select three personnel. If any of those personnel <test>, all three are stopped. Otherwise,
 * <one> of those personnel is stopped": the player's choice, or a random one.
 */
export const anyOfThree = (test: Test, one: 'player' | 'random'): Play =>
  selectRandom(3, (s, selected) => {
    if (selected.some((k) => test(s, k))) s.stop(selected);
    else s.stop(one === 'player' ? s.playerChooses(selected) : s.select(1, selected));
  });

/** "Randomly select three personnel. If any is a <icon> personnel, all are stopped. Otherwise, choose one to be stopped." */
export const anyOfAffiliation = (affiliation: string): Play => anyOfThree(affiliationIs(affiliation), 'player');

/**
 * "Randomly select a personnel to be stopped. Unless you reveal a <skill> personnel or a <skill> personnel
 * from your hand, that personnel is killed instead." It reads the hand of `PileTable.hand`: absent, the hand
 * holds no personnel, and the personnel is killed.
 */
export const revealOrElse = (...skills: string[]): Play => {
  const ix = skills.map(sk);
  return (s) => {
    const selected = s.select(1);
    const reveals = (s.attempt.table.hand ?? []).some((h) => ix.some((i) => h.skills.includes(i)));
    if (reveals) s.stop(selected, `the player reveals a ${skills.join(' or ')} personnel`);
    else s.kill(selected);
  };
};

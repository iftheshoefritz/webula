import { Rand, seededRandom } from '../simulator';
import { DilemmaModel, PersonnelOp, PileAttempt, PileModifiers, PlayContext, PlayEffect, PlayModifiers } from './model';
import { LABEL_SEED, LabelRow, modelsOf, withRevealedCost } from './label';
import { playPileStack, skillName } from './play';
import { modelOf } from './registry';

// The Resolve of a dilemma the player faces in a bot game (#1588): the effects of the revealed top card
// on the personnel of the reveal snapshot, reconciled with what the player already did by hand. Like
// `label.ts`, this file imports nothing from the practice table: the page hands it the attempt, the card
// ids of its personnel, and where each card is now.

/** The ops a Resolve applies to a card. A `move` has no destination on the table yet (#1578). */
export type PileResolveOp = Exclude<PersonnelOp, 'move'>;

const RESOLVE_OPS: ReadonlyArray<PileResolveOp> = ['stop', 'kill', 'remove', 'brig', 'holdInCore', 'returnToHand'];

/** Where a card of the snapshot is now: still in the attempting row, in a zone of the table, or nowhere. */
export type PileResolveWhere =
  | { at: 'row'; stopped: boolean }
  | { at: 'zone'; zone: string; removedFromGame?: boolean }
  | { at: 'gone' };

export interface PileResolveInput {
  /** The card id of each entry of `attempt.personnel`, from `pileAttemptOf`. */
  personnelIds: ReadonlyArray<string | undefined>;
  /** Every personnel id of the snapshot, the stopped ones too, in row order. */
  snapshotIds: ReadonlyArray<string>;
  where: (id: string) => PileResolveWhere;
  /** The cards revealed in this attempt before the top card, as `pileLabelOf` reads them. */
  revealed?: ReadonlyArray<LabelRow>;
  /** The rest of the facing stack, in order. */
  rest?: ReadonlyArray<LabelRow>;
  /** The press: the random function that rolls each random pick. */
  rand?: Rand;
  /** A press again (redo, reload): the picks a press returned, as card ids, in place of the roll. */
  picks?: ReadonlyArray<ReadonlyArray<string>>;
  /** The personnel the player selected in the attempting row (#1593), as card ids: their choice. */
  selected?: ReadonlyArray<string>;
  /**
   * The roll a title with `rollsBeforeChoice` made at the reveal (#1594), from `pileRevealPicksOf`: the
   * card ids of each random select, in call order. The preview and the press both play with it.
   */
  revealPicks?: ReadonlyArray<ReadonlyArray<string>>;
}

export type PileResolve =
  | { resolvable: false; reason: string }
  | {
      resolvable: true;
      /** The text, from the snapshot and the table only, never from a roll. */
      preview: string;
      /** Per op, the card ids still in the row to apply it to, in play order. */
      changes: { op: PileResolveOp; ids: string[] }[];
      /** Per op, how many of its personnel the player already handled. Only ops with one or more. */
      done: { op: PileResolveOp; done: number; of: number }[];
      /** The snapshot personnel out of the row whom no change targets and no op counts as done. */
      byTable: string[];
      /** On a press: the card ids of each random pick, in call order. */
      picks?: string[][];
      /**
       * The player's choice is not made yet (#1593): a call lacks personnel, or a selected personnel is
       * one no call takes. The preview reads the task, `changes` is empty, and `candidates` are the card
       * ids the selection may draw from.
       */
      pending?: { candidates: string[] };
      /**
       * What the dilemma changed in how the personnel are read for the rest of the attempt (#1597): the
       * whole modifiers after its play, by card id, the earlier ones too. Absent when it changed nothing.
       */
      modifiers?: PileModifiers;
      /** The clause that names what `modifiers` adds (#1598), "abilities off for the rest of the attempt", for the log. */
      modifiersClause?: string;
    };

/** The modifiers by card id (#1597), from the play's by personnel index. A personnel with no card id is left out. */
export function pileModifiersOf(m: PlayModifiers, personnelIds: ReadonlyArray<string | undefined>): PileModifiers {
  const { attrLoss, ...rest } = m;
  const out: PileModifiers = { ...rest };
  const losses = (attrLoss ?? []).flatMap(({ k, loss }) => (personnelIds[k] ? [[personnelIds[k]!, loss] as const] : []));
  if (losses.length) out.attrLoss = Object.fromEntries(losses);
  return out;
}

/** The modifiers by personnel index (#1597), from the table's by card id. A card no longer in the group is left out. */
export function playModifiersOf(m: PileModifiers, personnelIds: ReadonlyArray<string | undefined>): PlayModifiers {
  const { attrLoss, ...rest } = m;
  const out: PlayModifiers = { ...rest };
  const losses = Object.entries(attrLoss ?? {}).flatMap(([id, loss]) => {
    const k = personnelIds.indexOf(id);
    return k === -1 || !(loss > 0) ? [] : [{ k, loss }];
  });
  if (losses.length) out.attrLoss = losses.sort((a, b) => a.k - b.k);
  return out;
}

/** A canonical text of a value, its object keys sorted, so two equal modifiers compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The play's modifiers by card id when they differ from the ones it started from, or undefined (#1597). */
function changedModifiers(attempt: PileAttempt, after: PlayModifiers | undefined, personnelIds: ReadonlyArray<string | undefined>): PileModifiers | undefined {
  if (!after) return undefined;
  const now = pileModifiersOf(after, personnelIds);
  const before = pileModifiersOf(attempt.modifiers ?? {}, personnelIds);
  return canonical(now) === canonical(before) ? undefined : now;
}

/** What `after` adds to `before` (#1598): the flags it turns on, the skills it blocks, the change of the bonus, each new loss. */
export function addedModifiers(before: PileModifiers, after: PileModifiers): PileModifiers {
  const out: PileModifiers = {};
  if (after.abilitiesOff && !before.abilitiesOff) out.abilitiesOff = true;
  const blocked = (after.blockedSkills ?? []).filter((i) => !(before.blockedSkills ?? []).includes(i));
  if (blocked.length) out.blockedSkills = blocked;
  if (after.firstSkillOff && !before.firstSkillOff) out.firstSkillOff = true;
  const bonus = (after.attrBonus ?? 0) - (before.attrBonus ?? 0);
  if (bonus) out.attrBonus = bonus;
  const losses = Object.entries(after.attrLoss ?? {}).flatMap(([id, loss]) => {
    const added = loss - (before.attrLoss?.[id] ?? 0);
    return added > 0 ? [[id, added] as const] : [];
  });
  if (losses.length) out.attrLoss = Object.fromEntries(losses);
  if (after.overwhelmed && !before.overwhelmed) out.overwhelmed = true;
  if (after.requirements && canonical(after.requirements) !== canonical(before.requirements ?? null)) out.requirements = after.requirements;
  return out;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const signed = (n: number) => (n > 0 ? `+${n}` : `\u2212${-n}`);

/**
 * The parts of the text of the modifiers (#1598), in a fixed order: "Abilities off", "First skill off",
 * "Navigation, Physics blocked", "+1 attributes", "\u22122 attributes: Data, Worf", "Overwhelmed",
 * "Requirements changed". `nameOf` names a personnel by card id. None for no modifiers.
 */
export function modifierParts(m: PileModifiers, nameOf: (id: string) => string): string[] {
  const parts: string[] = [];
  if (m.abilitiesOff) parts.push('Abilities off');
  if (m.firstSkillOff) parts.push('First skill off');
  if (m.blockedSkills?.length) parts.push(`${m.blockedSkills.map(skillName).join(', ')} blocked`);
  if (m.attrBonus) parts.push(`${signed(m.attrBonus)} attributes`);
  const byLoss = new Map<number, string[]>();
  for (const [id, loss] of Object.entries(m.attrLoss ?? {})) if (loss > 0) byLoss.set(loss, [...(byLoss.get(loss) ?? []), nameOf(id)]);
  for (const [loss, names] of Array.from(byLoss).sort((a, b) => a[0] - b[0])) parts.push(`${signed(-loss)} attributes: ${names.join(', ')}`);
  if (m.overwhelmed) parts.push('Overwhelmed');
  if (m.requirements) parts.push('Requirements changed');
  return parts;
}

/** The line of the active modifiers of an attempt (#1598), or '' for none. */
export const modifiersText = (m: PileModifiers | undefined, nameOf: (id: string) => string): string =>
  m ? modifierParts(m, nameOf).join(' \u00b7 ') : '';

/** The parts with no name in them, which a clause writes in lower case. */
const FIXED_PARTS = new Set(['Abilities off', 'First skill off', 'Overwhelmed', 'Requirements changed']);

/**
 * The clause of a Resolve that changes the modifiers (#1598), "first skill off for the rest of the
 * attempt", in lower case but for skill names, or '' when `after` adds nothing to `before`.
 */
export function modifiersClause(before: PileModifiers, after: PileModifiers | undefined, nameOf: (id: string) => string): string {
  if (!after) return '';
  const parts = modifierParts(addedModifiers(before, after), nameOf);
  if (!parts.length) return '';
  return `${parts.map((p) => (FIXED_PARTS.has(p) ? p.toLowerCase() : p)).join(', ')} for the rest of the attempt`;
}

/** The `why` of a stop by Overwhelmed, of a check that passes (`PlayState.passes`). */
const OVERWHELMED = 'Overwhelmed';

const VERBS: Record<PileResolveOp, [string, string]> = {
  stop: ['Stops', ''],
  kill: ['Kills', ''],
  remove: ['Removes', ' from the game'],
  brig: ['Places', " in the bot's brig"],
  holdInCore: ['Holds', ' in the core'],
  returnToHand: ['Returns', ' to the hand'],
};

const PAST: Record<PileResolveOp, string> = {
  stop: 'stopped',
  kill: 'killed',
  remove: 'removed from the game',
  brig: "placed in the bot's brig",
  holdInCore: 'held in the core',
  returnToHand: 'returned to the hand',
};

type PersonnelEffect = { op: PileResolveOp; ks: number[] };
type SelectEffect = Extract<PlayEffect, { op: 'select' }>;

const isResolveOp = (e: PlayEffect): e is PlayEffect & PersonnelEffect => (RESOLVE_OPS as ReadonlyArray<string>).includes(e.op);

/** Is the card already where `op` puts it? A stop is done for a stopped card, and for one out of the row. */
function isDone(op: PileResolveOp, where: PileResolveWhere): boolean {
  if (op === 'stop') return where.at !== 'row' || where.stopped;
  if (where.at !== 'zone') return false;
  if (op === 'kill') return where.zone === 'discard';
  if (op === 'remove') return where.zone === 'discard' && !!where.removedFromGame;
  if (op === 'brig') return where.zone === 'botBrig';
  if (op === 'holdInCore') return where.zone === 'core';
  return where.zone === 'hand';
}

/**
 * The records of one play of `model`, then the `rest`: those of the top title only, up to the first record
 * of a later title. `own` keeps the stops of Chula: The Game before it too; `kept` leaves out every record
 * with a `why`, which is not the dilemma's own effect, but for Overwhelmed's stops (#1598): those a
 * passing check of this dilemma makes are part of its effect.
 */
function recordPlay(attempt: PileAttempt, model: DilemmaModel, rest: DilemmaModel[], options: Pick<PlayContext, 'picks' | 'chooses'> = {}) {
  const all: PlayEffect[] = [];
  let modifiers: PlayModifiers | undefined;
  playPileStack(attempt, [model, ...rest], seededRandom(LABEL_SEED), undefined, 0, {
    effects: (e) => all.push(e),
    modifiers: (m) => (modifiers = m),
    ...options,
  });
  const end = all.findIndex((e) => e.title !== model.title);
  const own = end === -1 ? all : all.slice(0, end);
  return { own, kept: own.filter((e) => !e.why || e.why === OVERWHELMED), modifiers };
}

type ChoiceEffect = Extract<PlayEffect, { op: 'playerChooses' }>;
/** A `playerChooses` call of personnel (#1593), which the player makes with the row selection. */
const isChoice = (e: PlayEffect): e is ChoiceEffect & { count: number; pool: number[]; ks: number[] } => e.op === 'playerChooses' && !!e.pool;

const ROLL_THEN_CHOOSE = 'the choice follows a roll';
/**
 * The titles with a player's choice that get no Resolve yet (#1593), whatever the seeded play does: a
 * random selection is the pool of the choice and the table does not keep the roll (the titles with
 * `rollsBeforeChoice` do, #1594), the count is not known up front, or the choice breaks a tie.
 */
const NO_CHOICE_RESOLVE: Record<string, string> = {
  'The Captain\'s "Guest"': ROLL_THEN_CHOOSE,
  'Toe to Toe': ROLL_THEN_CHOOSE,
  Distraction: 'the player stops personnel until their costs total 4',
  'Dramatis Personae': 'the player breaks a tie',
};

/** Why the table cannot apply the play's records, or null. `rolled`: the selects are the roll the reveal kept (#1594). */
function noResolveReason(kept: PlayEffect[], rolled = false): string | null {
  if (kept.some((e) => e.op === 'playerChooses' && !isChoice(e))) return 'the player chooses';
  const firstChoice = kept.findIndex(isChoice);
  if (!rolled && firstChoice !== -1 && kept.slice(0, firstChoice).some((e) => e.op === 'select')) return ROLL_THEN_CHOOSE;
  if (kept.some((e) => e.op === 'move')) return 'the dilemma moves personnel, which the table cannot apply yet';
  if (kept.some((e) => e.op === 'loseShip')) return 'the dilemma takes the ship, which the table cannot apply yet';
  if (kept.some((e) => e.op === 'roll' || (e.op === 'select' && e.order))) return 'the number of personnel depends on the roll';
  return null;
}

/** The changes, the done counts and the by-the-table ids of the kept records, against where each card is now. */
function reconcile(kept: PlayEffect[], input: PileResolveInput) {
  const changes: { op: PileResolveOp; ids: string[] }[] = [];
  const done: { op: PileResolveOp; done: number; of: number }[] = [];
  const targeted = new Set<string>();
  const byTable: string[] = [];
  for (const e of kept) {
    if (!isResolveOp(e)) continue;
    let tally = done.find((d) => d.op === e.op);
    if (!tally) done.push((tally = { op: e.op, done: 0, of: 0 }));
    for (const k of e.ks) {
      const id = input.personnelIds[k];
      if (!id) continue;
      targeted.add(id);
      tally.of++;
      const where = input.where(id);
      if (isDone(e.op, where)) tally.done++;
      else if (where.at === 'row') {
        let change = changes.find((c) => c.op === e.op);
        if (!change) changes.push((change = { op: e.op, ids: [] }));
        change.ids.push(id);
      } else byTable.push(id);
    }
  }
  for (const id of input.snapshotIds) if (!targeted.has(id) && input.where(id).at !== 'row') byTable.push(id);
  return { changes, done: done.filter((d) => d.done > 0), byTable };
}

/**
 * The preview text: one clause per effect of the dilemma, in play order, then the done counts. `rolled`:
 * the selects are the roll the reveal kept (#1594), so the clauses name the personnel.
 */
function previewOf(attempt: PileAttempt, own: PlayEffect[], done: { op: PileResolveOp; done: number; of: number }[], rolled = false): string {
  const hit = new Set<number>();
  let random = false;
  const clauses: string[] = [];
  for (const e of own) {
    if (e.op === 'select' && !e.why && !rolled) random = true;
    if (e.op === 'loseShip') e.ks.forEach((k) => hit.add(k));
    if (!isResolveOp(e)) continue;
    const alive = attempt.personnel.length - hit.size;
    if (!e.why) {
      const [verb, tail] = VERBS[e.op];
      if (e.op === 'stop' && e.ks.length > 1 && e.ks.length === alive) clauses.push('Stops all');
      else if (random) clauses.push(`${verb} ${e.ks.length} random personnel${tail}`);
      else clauses.push(`${verb} ${e.ks.map((k) => attempt.personnel[k].name).join(', ')}${tail}`);
    } else if (e.why === OVERWHELMED) {
      clauses.push(`Stops ${e.ks.map((k) => attempt.personnel[k].name).join(', ')} (${OVERWHELMED})`);
    }
    e.ks.forEach((k) => hit.add(k));
  }
  if (!clauses.length) return 'No effect';
  return [...clauses, ...done.map((d) => `${d.done} of ${d.of} already ${PAST[d.op]}`)].join('; ');
}

/**
 * The op each random select of the preview play fed, or each choice with `of: 'choices'` (#1593): the
 * first personnel effect after it that hits one of its picks.
 */
function fedOps(kept: PlayEffect[], of: 'selects' | 'choices' = 'selects'): (PileResolveOp | undefined)[] {
  return kept.flatMap((e, i) => {
    const ks = of === 'selects' ? (e.op === 'select' ? e.ks : null) : isChoice(e) ? e.ks : null;
    if (!ks) return [];
    const fed = kept.slice(i + 1).find((f) => isResolveOp(f) && f.ks.some((k) => ks.includes(k)));
    return [fed && isResolveOp(fed) ? fed.op : undefined];
  });
}

/** Has the player already handled `id` by hand for `op`: out of the row, or where `op` puts it? */
function handled(input: PileResolveInput, id: string | undefined, op: PileResolveOp | undefined): boolean {
  if (!id) return false;
  const where = input.where(id);
  return where.at !== 'row' || (op !== undefined && isDone(op, where));
}

/**
 * The player's choice for one play (#1593): each `playerChooses` call takes the candidates the player
 * already handled by hand for the op it feeds (`ops`, from the model's own play, never shown), then the
 * selected candidates no earlier call took, up to its count or the size of its pool. A call that gets
 * fewer goes into `short`; `taken` holds every card id a call took.
 */
function choiceOf(input: PileResolveInput, ops: (PileResolveOp | undefined)[]) {
  const short: { op: PileResolveOp | undefined; missing: number; pool: string[] }[] = [];
  const taken = new Set<string>();
  let call = 0;
  const chooses = (count: number, pool: number[]): number[] => {
    const op = ops[call++];
    const need = Math.min(count, pool.length);
    const idOf = (k: number) => input.personnelIds[k];
    const ks = pool.filter((k) => !taken.has(idOf(k) ?? '') && handled(input, idOf(k), op)).slice(0, need);
    for (const id of input.selected ?? []) {
      const k = input.personnelIds.indexOf(id);
      if (ks.length < need && k !== -1 && pool.includes(k) && !ks.includes(k) && !taken.has(id)) ks.push(k);
    }
    ks.forEach((k) => taken.add(idOf(k) ?? ''));
    if (ks.length < need) short.push({ op, missing: need - ks.length, pool: pool.map(idOf).filter((id): id is string => !!id && !taken.has(id)) });
    return ks;
  };
  return { chooses, short, taken };
}

/** "Selected A, B, C": the personnel of each select of the dilemma's own play, which the reveal rolled (#1594). */
function selectedText(attempt: PileAttempt, own: PlayEffect[]): string {
  const ks = own.flatMap((e) => (e.op === 'select' && !e.why ? e.ks : []));
  return `Selected ${ks.map((k) => attempt.personnel[k].name).join(', ') || 'no personnel'}`;
}

/** The random picks of a play from card ids (#1594): each select takes its list of `picks`, the ids in its pool, up to its count. */
function picksFrom(input: PileResolveInput, picks: ReadonlyArray<ReadonlyArray<string>>) {
  let call = 0;
  return (count: number, pool: number[]): number[] =>
    (picks[call++] ?? [])
      .map((id) => input.personnelIds.indexOf(id))
      .filter((k) => pool.includes(k))
      .slice(0, count);
}

/**
 * The roll at the reveal of `row` (#1594), for a title with `rollsBeforeChoice`: the card ids each random
 * select of its own play picks, rolled with `rand`, in call order. Undefined for any other title. The page
 * rolls it before the `flip` that takes the reveal snapshot, and the snapshot keeps it.
 */
export function pileRevealPicksOf(
  row: LabelRow,
  attempt: PileAttempt,
  input: Pick<PileResolveInput, 'personnelIds' | 'revealed' | 'rest'> & { rand: Rand },
): string[][] | undefined {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  if (!model?.rollsBeforeChoice) return undefined;
  const picked: string[][] = [];
  const picks = (count: number, pool: number[]): number[] => {
    const rest = pool.slice();
    const ks: number[] = [];
    while (ks.length < count && rest.length) ks.push(rest.splice(Math.floor(input.rand() * rest.length), 1)[0]);
    picked.push(ks.map((k) => input.personnelIds[k] ?? ''));
    return ks;
  };
  recordPlay(withRevealedCost(attempt, model, input.revealed ?? []), model, modelsOf(input.rest ?? []), { picks });
  return picked;
}

/**
 * The Resolve of `row`, the revealed top card, when the group of `attempt` faces it (#1588). `attempt` is
 * the snapshot's group, with the attempt's spend, as `pileLabelOf` takes it; the cost of `revealed` counts
 * as spent, and the play faces the `rest` after it, as the label's does. No Resolve, with a reason, for a
 * title the registry lacks, a choice the table cannot make (`NO_CHOICE_RESOLVE`, `playerChoice`), one
 * that moves personnel or takes the ship, and one whose number of personnel depends on the roll.
 *
 * Where the player chooses personnel (#1593), the preview and the press play with `input.selected` as
 * the choice (`choiceOf`). Until every call has its personnel, and while a selected personnel is one no
 * call takes, the Resolve is `pending`: the preview reads the task, "Choose 1 personnel to be stopped",
 * and there are no changes. The model's own pick is never shown.
 *
 * The preview play is the label's seeded play, so the personnel a rule picks are the label's. A press,
 * `rand` or `picks`, plays again with each random pick of the dilemma decided by the caller: the pool
 * personnel the player already affected by hand first, in snapshot order, then rolls from the rest of the
 * pool. Its records give the changes, the done counts and the by-the-table ids; the preview stays the
 * preview play's.
 *
 * A title with `rollsBeforeChoice` (#1594) plays every time with `input.revealPicks`, the roll the reveal
 * kept, and never rolls: the preview names the set, "Selected A, B, C; choose 1 to be stopped", and then
 * what the dilemma does to the personnel it names. With no kept roll it has no Resolve.
 */
export function pileResolveOf(row: LabelRow, attempt: PileAttempt, input: PileResolveInput): PileResolve {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  if (!model) return { resolvable: false, reason: 'the bot has no model of this dilemma' };
  const played = withRevealedCost(attempt, model, input.revealed ?? []);
  const rest = modelsOf(input.rest ?? []);
  const refused = NO_CHOICE_RESOLVE[model.title];
  if (refused) return { resolvable: false, reason: refused };
  const rolled = !!model.rollsBeforeChoice;
  if (rolled && !input.revealPicks) return { resolvable: false, reason: 'the roll before the choice is not made yet' };
  // A fresh reader of the kept roll for each play.
  const kept = () => (rolled ? { picks: picksFrom(input, input.revealPicks!) } : {});
  const modelPlay = recordPlay(played, model, rest, kept());
  const modelReason = noResolveReason(modelPlay.kept, rolled);
  if (modelReason) return { resolvable: false, reason: modelReason };

  // A play where the player chooses plays again with the player's choice: the model's pick only finds
  // the op each choice feeds, and never shows.
  const choiceOps = modelPlay.kept.some(isChoice) ? fedOps(modelPlay.kept, 'choices') : null;
  const choice = choiceOps && choiceOf(input, choiceOps);
  const preview = choice ? recordPlay(played, model, rest, { chooses: choice.chooses, ...kept() }) : modelPlay;
  const previewReason = noResolveReason(preview.kept, rolled);
  if (previewReason) return { resolvable: false, reason: previewReason };
  if (choice) {
    const stray = (input.selected ?? []).filter((id) => !choice.taken.has(id));
    if (choice.short.length || stray.length) {
      const tasks = choice.short.map((c) =>
        rolled ? `choose ${c.missing}${c.op ? ` to be ${PAST[c.op]}` : ''}` : `Choose ${c.missing} personnel${c.op ? ` to be ${PAST[c.op]}` : ''}`,
      );
      if (stray.length) tasks.push(`${stray.length === 1 ? 'A selected personnel' : `${stray.length} selected personnel`} cannot be chosen`);
      if (rolled) tasks.unshift(selectedText(played, preview.own));
      const candidates = Array.from(new Set(choice.short.flatMap((c) => c.pool)));
      return { resolvable: true, preview: tasks.join('; '), changes: [], done: [], byTable: [], pending: { candidates } };
    }
  }
  const previewResult = reconcile(preview.kept, input);
  const effects = previewOf(played, preview.own, previewResult.done, rolled);
  const previewModifiers = changedModifiers(played, preview.modifiers, input.personnelIds);
  const before = pileModifiersOf(played.modifiers ?? {}, input.personnelIds);
  const nameOf = (id: string) => played.personnel[input.personnelIds.indexOf(id)]?.name ?? 'a personnel';
  // A Resolve that changes the modifiers names them (#1598), in place of "No effect".
  const previewClause = modifiersClause(before, previewModifiers, nameOf);
  const withClause = !previewClause ? effects : effects === 'No effect' ? capitalize(previewClause) : `${effects}; ${previewClause}`;
  const text = rolled ? `${selectedText(played, preview.own)}; ${withClause}` : withClause;
  if (!input.rand && !input.picks) {
    return {
      resolvable: true,
      preview: text,
      ...previewResult,
      ...(previewModifiers ? { modifiers: previewModifiers } : {}),
      ...(previewClause ? { modifiersClause: previewClause } : {}),
    };
  }

  const ops = fedOps(preview.kept);
  const indexOf = (id: string) => input.personnelIds.indexOf(id);
  const picked: string[][] = [];
  const picks = (count: number, pool: number[]): number[] => {
    const call = picked.length;
    let ks: number[];
    const fixed = rolled ? input.revealPicks : input.picks;
    if (fixed) {
      ks = (fixed[call] ?? []).map(indexOf).filter((k) => pool.includes(k)).slice(0, count);
    } else {
      const op = ops[call];
      const affected = (k: number) => handled(input, input.personnelIds[k], op);
      ks = pool.filter(affected).slice(0, count);
      const unaffected = pool.filter((k) => !affected(k));
      while (ks.length < count && unaffected.length) ks.push(unaffected.splice(Math.floor(input.rand!() * unaffected.length), 1)[0]);
    }
    picked.push(ks.map((k) => input.personnelIds[k] ?? ''));
    return ks;
  };
  const press = recordPlay(played, model, rest, { picks, ...(choiceOps ? { chooses: choiceOf(input, choiceOps).chooses } : {}) });
  const pressReason = noResolveReason(press.kept, rolled);
  if (pressReason) return { resolvable: false, reason: pressReason };
  const modifiers = changedModifiers(played, press.modifiers, input.personnelIds);
  const clause = modifiersClause(before, modifiers, nameOf);
  return {
    resolvable: true,
    preview: text,
    ...reconcile(press.kept, input),
    picks: picked,
    ...(modifiers ? { modifiers, ...(clause ? { modifiersClause: clause } : {}) } : {}),
  };
}

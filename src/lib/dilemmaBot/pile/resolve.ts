import { Rand, seededRandom } from '../simulator';
import { DilemmaModel, PersonnelOp, PileAttempt, PlayEffect } from './model';
import { LABEL_SEED, LabelRow, modelsOf, withRevealedCost } from './label';
import { playPileStack } from './play';
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
    };

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
 * with a `why`, which is not the dilemma's own effect.
 */
function recordPlay(attempt: PileAttempt, model: DilemmaModel, rest: DilemmaModel[], picks?: (count: number, pool: number[]) => number[]) {
  const all: PlayEffect[] = [];
  playPileStack(attempt, [model, ...rest], seededRandom(LABEL_SEED), undefined, 0, { effects: (e) => all.push(e), picks });
  const end = all.findIndex((e) => e.title !== model.title);
  const own = end === -1 ? all : all.slice(0, end);
  return { own, kept: own.filter((e) => !e.why) };
}

/** Why the table cannot apply the play's records, or null. */
function noResolveReason(kept: PlayEffect[]): string | null {
  if (kept.some((e) => e.op === 'playerChooses')) return 'the player chooses';
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

/** The preview text: one clause per effect of the dilemma, in play order, then the done counts. */
function previewOf(attempt: PileAttempt, own: PlayEffect[], done: { op: PileResolveOp; done: number; of: number }[]): string {
  const hit = new Set<number>();
  let random = false;
  const clauses: string[] = [];
  for (const e of own) {
    if (e.op === 'select' && !e.why) random = true;
    if (e.op === 'loseShip') e.ks.forEach((k) => hit.add(k));
    if (!isResolveOp(e)) continue;
    const alive = attempt.personnel.length - hit.size;
    if (!e.why) {
      const [verb, tail] = VERBS[e.op];
      if (e.op === 'stop' && e.ks.length > 1 && e.ks.length === alive) clauses.push('Stops all');
      else if (random) clauses.push(`${verb} ${e.ks.length} random personnel${tail}`);
      else clauses.push(`${verb} ${e.ks.map((k) => attempt.personnel[k].name).join(', ')}${tail}`);
    }
    e.ks.forEach((k) => hit.add(k));
  }
  if (!clauses.length) return 'No effect';
  return [...clauses, ...done.map((d) => `${d.done} of ${d.of} already ${PAST[d.op]}`)].join('; ');
}

/** The op each random select of the preview play fed: the first personnel effect after it that hits one of its picks. */
function fedOps(kept: PlayEffect[]): (PileResolveOp | undefined)[] {
  return kept.flatMap((e, i) => {
    if (e.op !== 'select') return [];
    const fed = kept.slice(i + 1).find((f) => isResolveOp(f) && f.ks.some((k) => e.ks.includes(k)));
    return [fed && isResolveOp(fed) ? fed.op : undefined];
  });
}

/**
 * The Resolve of `row`, the revealed top card, when the group of `attempt` faces it (#1588). `attempt` is
 * the snapshot's group, with the attempt's spend, as `pileLabelOf` takes it; the cost of `revealed` counts
 * as spent, and the play faces the `rest` after it, as the label's does. No Resolve, with a reason, for a
 * title the registry lacks, a play where the player chooses, one that moves personnel or takes the ship,
 * and one whose number of personnel depends on the roll.
 *
 * The preview play is the label's seeded play, so the personnel a rule picks are the label's. A press,
 * `rand` or `picks`, plays again with each random pick of the dilemma decided by the caller: the pool
 * personnel the player already affected by hand first, in snapshot order, then rolls from the rest of the
 * pool. Its records give the changes, the done counts and the by-the-table ids; the preview stays the
 * preview play's.
 */
export function pileResolveOf(row: LabelRow, attempt: PileAttempt, input: PileResolveInput): PileResolve {
  const model = row?.originalName ? modelOf(row.originalName) : undefined;
  if (!model) return { resolvable: false, reason: 'the bot has no model of this dilemma' };
  const played = withRevealedCost(attempt, model, input.revealed ?? []);
  const rest = modelsOf(input.rest ?? []);
  const preview = recordPlay(played, model, rest);
  const previewReason = noResolveReason(preview.kept);
  if (previewReason) return { resolvable: false, reason: previewReason };
  const previewResult = reconcile(preview.kept, input);
  const text = previewOf(played, preview.own, previewResult.done);
  if (!input.rand && !input.picks) return { resolvable: true, preview: text, ...previewResult };

  const ops = fedOps(preview.kept);
  const indexOf = (id: string) => input.personnelIds.indexOf(id);
  const picked: string[][] = [];
  const picks = (count: number, pool: number[]): number[] => {
    const call = picked.length;
    let ks: number[];
    if (input.picks) {
      ks = (input.picks[call] ?? []).map(indexOf).filter((k) => pool.includes(k)).slice(0, count);
    } else {
      const op = ops[call];
      const affected = (k: number) => {
        const id = input.personnelIds[k];
        if (!id) return false;
        const where = input.where(id);
        return where.at !== 'row' || (op !== undefined && isDone(op, where));
      };
      ks = pool.filter(affected).slice(0, count);
      const unaffected = pool.filter((k) => !affected(k));
      while (ks.length < count && unaffected.length) ks.push(unaffected.splice(Math.floor(input.rand!() * unaffected.length), 1)[0]);
    }
    picked.push(ks.map((k) => input.personnelIds[k] ?? ''));
    return ks;
  };
  const press = recordPlay(played, model, rest, picks);
  const pressReason = noResolveReason(press.kept);
  if (pressReason) return { resolvable: false, reason: pressReason };
  return { resolvable: true, preview: text, ...reconcile(press.kept, input), picks: picked };
}

// The bot's attempt modifiers as rows (#1889, part 3 of #1864): the bonus and the losses of `PileModifiers`, each
// one `thisAttempt` row of the three personnel attributes, and back. The save keeps `PileModifiers`; a row is never
// stored, and never in `MODIFIER_ROWS`, so `attributeOf` and `rangeOf` never read one: the bot's play applies them.

import type { PileModifiers } from '../dilemmaBot/pile/model';
import { each, PERSONNEL_QUANTITIES, type ModifierRow } from './model';

/** The title of every attempt row: `PileModifiers` keeps no dilemma that set a change. No card has it. */
export const ATTEMPT_ROW_TITLE = 'An earlier dilemma of the attempt';

const attemptRow = (delta: number, targetId?: string): ModifierRow => ({
  title: ATTEMPT_ROW_TITLE,
  source: 'attempt',
  target: targetId === undefined ? 'attempting' : 'card',
  changes: each(PERSONNEL_QUANTITIES, delta),
  scope: 'thisAttempt',
  ...(targetId === undefined ? {} : { targetId }),
});

/** The rows of the numeric parts of `m`: the bonus, then each loss above 0, in the order of `attrLoss`. */
export function attemptRowsOf(m: PileModifiers): ModifierRow[] {
  const rows: ModifierRow[] = [];
  if (m.attrBonus) rows.push(attemptRow(m.attrBonus));
  for (const [id, loss] of Object.entries(m.attrLoss ?? {})) if (loss > 0) rows.push(attemptRow(-loss, id));
  return rows;
}

/** The numeric parts of a `PileModifiers` from attempt rows: the changes summed per target, a bonus of 0 omitted, only the losses above 0. */
export function attemptModifiersOf(rows: readonly ModifierRow[]): Pick<PileModifiers, 'attrBonus' | 'attrLoss'> {
  let bonus = 0;
  const losses = new Map<string, number>();
  for (const r of rows) {
    if (r.scope !== 'thisAttempt' || r.source !== 'attempt') continue;
    const delta = typeof r.changes.integrity === 'number' ? r.changes.integrity : 0;
    if (r.target === 'attempting') bonus += delta;
    else if (r.target === 'card' && r.targetId !== undefined) losses.set(r.targetId, (losses.get(r.targetId) ?? 0) - delta);
  }
  const out: Pick<PileModifiers, 'attrBonus' | 'attrLoss'> = {};
  if (bonus) out.attrBonus = bonus;
  const kept = Array.from(losses).filter(([, loss]) => loss > 0);
  if (kept.length) out.attrLoss = Object.fromEntries(kept);
  return out;
}

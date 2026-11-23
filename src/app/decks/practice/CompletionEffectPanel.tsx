import React, { useRef, useState } from 'react';
import { cardDisplayName } from '../../../lib/cardCount';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { panelScrollClassName, useScrollsVertically } from './CardListPanel';
import {
  CompletionEffect,
  completionConditionText,
  costOf,
  destroyShipsActions,
  discardActions,
  discardCandidates,
  discardableInvolved,
  downloadActions,
  downloadCandidates,
  hqSlotsFor,
  involvedPersonnel,
  involvedSpecies,
  placeAtHqActions,
  scoreActions,
  scoreHolds,
  toDeckBottomActions,
  totalCost,
} from './completionEffects';
import { ScrollIndicator } from './ScrollIndicator';
import type { CardInstance, TableAction, TableState } from './tableReducer';
import { useEscapeLayer } from './useEscapeLayer';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// The card data is lowercased: "human/vulcan" shows as "Human/Vulcan".
const speciesLabel = (species: string): string => species.replace(/(^|[\s/'-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());

// The panel of a mission's completion effect (#1757): it names the mission and quotes its effect, and
// offers its choice. Confirm completes the mission with the effect, Skip completes it with none, and
// Escape and the backdrop close it with nothing done, so the mission stays not complete.
export function CompletionEffectPanel({
  table,
  missionIndex,
  effect,
  onComplete,
  onClose,
}: {
  table: TableState;
  missionIndex: number;
  effect: CompletionEffect;
  /** Completes the mission, then dispatches `actions`, none for Skip. */
  onComplete: (actions: TableAction[]) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  const [chosen, setChosen] = useState<string[]>([]);
  const [hqChoice, setHqChoice] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mission = cardDisplayName(table.missions[missionIndex]?.mission?.card);

  const candidates: CardInstance[] =
    effect.kind === 'download'
      ? downloadCandidates(table, effect).slice(0, 1)
      : effect.kind === 'discardToHq'
        ? discardCandidates(table)
        : effect.kind === 'discardOrDestroy'
          ? discardableInvolved(table, missionIndex, effect)
          : effect.kind === 'toDeckBottom'
            ? involvedPersonnel(table, missionIndex)
            : [];
  const scrolls = useScrollsVertically(scrollRef, candidates.length > 0, [candidates.length]);
  const single = effect.kind === 'discardOrDestroy';
  const picked = chosen.flatMap((id) => candidates.filter((c) => c.id === id));
  const total = totalCost(picked);
  const overCap = effect.cap !== undefined && total > effect.cap;
  const hqs = effect.kind === 'discardToHq' ? hqSlotsFor(table, picked) : [];
  const hq = hqChoice !== null && hqs.includes(hqChoice) ? hqChoice : hqs[0];
  const ships = table.missions[missionIndex]?.ships ?? [];
  const species = effect.kind === 'score' ? involvedSpecies(table, missionIndex) : [];
  const scores = effect.kind === 'score' && scoreHolds(table, missionIndex, effect);
  const bySpecies = effect.kind === 'score' && (effect.condition?.kind ?? 'species') === 'species';
  const toggle = (id: string) =>
    setChosen((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : single ? [id] : [...ids, id]));

  const confirmActions = (): TableAction[] | null => {
    switch (effect.kind) {
      case 'download':
        return candidates[0] ? downloadActions(candidates[0].id) : null;
      case 'discardToHq':
        return picked.length && !overCap && hq !== undefined ? placeAtHqActions(chosen, hq) : null;
      case 'discardOrDestroy':
        return picked.length === 1 ? discardActions(chosen) : null;
      case 'toDeckBottom':
        return picked.length && !overCap ? toDeckBottomActions(chosen) : null;
      case 'score':
        return scores ? scoreActions(effect) : null;
      default:
        return null;
    }
  };
  const actions = confirmActions();
  const note =
    effect.kind === 'discardToHq' && picked.length && hqs.length === 0
      ? 'No headquarters mission of yours can take every picked personnel.'
      : effect.kind === 'download' && !candidates.length
        ? `No ${effect.download} in the draw deck.`
        : null;
  const empty =
    effect.kind === 'discardToHq'
      ? 'No unique personnel in the discard pile can be placed.'
      : effect.kind === 'discardOrDestroy'
        ? `No personnel involved costs ${effect.min} or more.`
        : 'No personnel involved.';

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
        onClick={onClose}
        aria-label="Cancel the completion"
      />
      <div
        role="dialog"
        aria-label={`Complete ${mission}`}
        data-testid="completion-effect"
        data-effect={effect.kind}
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('24rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">Complete {mission}</h2>
        <p data-testid="completion-effect-text" className="text-xs italic text-text-muted">
          {effect.watches ? `${effect.title}: ` : ''}
          {effect.text}
        </p>
        {effect.cap !== undefined && (
          <p data-testid="completion-effect-total" data-over={overCap ? 'true' : undefined} className={`text-xs ${overCap ? 'text-amber-400' : 'text-text-muted'}`}>
            Total cost {total} of {effect.cap}
          </p>
        )}
        {effect.kind === 'score' && !bySpecies && effect.condition && (
          <p data-testid="completion-effect-condition" data-met={scores ? 'true' : 'false'} className={`text-sm ${scores ? 'text-text-primary' : 'text-amber-400'}`}>
            {`Condition ${scores ? 'met' : 'not met'}: ${completionConditionText(effect.condition)}.`}
          </p>
        )}
        {effect.kind === 'score' && effect.notChecked && (
          <p data-testid="completion-effect-not-checked" className="text-xs text-text-muted">
            {`Not checked: ${effect.notChecked}.`}
          </p>
        )}
        {bySpecies && (
          <p data-testid="completion-effect-species" data-count={species.length} className={`text-sm ${scores ? 'text-text-primary' : 'text-amber-400'}`}>
            {involvedPersonnel(table, missionIndex).length === 0
              ? 'No personnel involved.'
              : scores
                ? `${species.length} different species involved: ${species.map(speciesLabel).join(', ')}.`
                : `Only ${species.length} different species ${species.length === 1 ? 'was' : 'were'} involved${species.length ? `: ${species.map(speciesLabel).join(', ')}` : ''}; ${effect.minSpecies} are needed.`}
          </p>
        )}
        {effect.kind !== 'download' && effect.kind !== 'score' && (
          <div className="relative flex min-h-0 flex-col">
            <div ref={scrollRef} className={`min-h-0 overscroll-contain ${panelScrollClassName(scrolls)}`}>
              {candidates.length === 0 ? (
                <p className="text-sm text-text-muted">{empty}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {candidates.map((c) => {
                    const on = chosen.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-testid="completion-effect-candidate"
                        data-card-choice={c.id}
                        aria-pressed={on}
                        onClick={() => toggle(c.id)}
                        className={`flex min-h-11 items-center gap-2 rounded border px-2 text-left text-sm ${
                          on ? 'border-blue-400 bg-blue-500/20 text-text-primary' : 'border-white/10 text-text-primary'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{cardDisplayName(c.card)}</span>
                        <span className="shrink-0 text-xs text-text-muted">cost {costOf(c)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <ScrollIndicator scrollerRef={scrollRef} scrolls={scrolls} deps={[candidates.length]} />
          </div>
        )}
        {effect.kind === 'discardToHq' && hqs.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Headquarters">
            {hqs.map((i) => (
              <button
                key={i}
                type="button"
                data-testid={`completion-effect-hq-${i}`}
                aria-pressed={i === hq}
                onClick={() => setHqChoice(i)}
                className={`min-h-11 rounded border px-2 text-sm ${i === hq ? 'border-blue-400 bg-blue-500/20' : 'border-white/10'} text-text-primary`}
              >
                {cardDisplayName(table.missions[i].mission?.card)}
              </button>
            ))}
          </div>
        )}
        {note && (
          <p data-testid="completion-effect-note" className="text-xs text-amber-400">
            {note}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-2">
          <button type="button" data-testid="completion-effect-skip" onClick={() => onComplete([])} className="btn-icon min-h-11 w-auto px-3 text-sm">
            Skip
          </button>
          {effect.kind === 'discardOrDestroy' && (
            <button
              type="button"
              data-testid="completion-effect-destroy"
              disabled={!ships.length}
              onClick={() => onComplete(destroyShipsActions(table, missionIndex))}
              className="btn-icon min-h-11 w-auto px-3 text-sm disabled:opacity-40"
            >
              Destroy the ships here
            </button>
          )}
          <button
            type="button"
            data-testid="completion-effect-confirm"
            disabled={!actions}
            onClick={() => actions && onComplete(actions)}
            className="btn-icon min-h-11 w-auto px-3 text-sm disabled:opacity-40"
          >
            {effect.kind === 'download'
              ? 'Download'
              : effect.kind === 'discardOrDestroy'
                ? 'Discard'
                : effect.kind === 'score'
                  ? `Score ${effect.points}`
                  : 'Confirm'}
          </button>
        </div>
      </div>
    </>
  );
}

import React, { useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { panelScrollClassName, useScrollsVertically } from './CardListPanel';
import { ScrollIndicator } from './ScrollIndicator';
import { PersonnelCandidateGroup, personnelChoiceSummary } from './personnelChoice';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// The choice of personnel of a card's effect (#1712), Common Purpose's: the unstopped personnel the
// player commands, by place, each a toggle with its name and affiliation. The header sums up the pick,
// "3 personnel, 2 affiliations: +2". Confirm hands the chosen ids to the page, Cancel, the backdrop and
// Escape close it with no change. The selection is the panel's own, not the page's `selectedCardIds`.
export function PersonnelChoicePanel({
  title,
  groups,
  onConfirm,
  onClose,
}: {
  title: string;
  groups: PersonnelCandidateGroup[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  useEscapeLayer(onClose);
  const [chosen, setChosen] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = groups.reduce((n, g) => n + g.cards.length, 0);
  const scrolls = useScrollsVertically(scrollRef, count > 0, [count]);
  const candidates = groups.flatMap((g) => g.cards);
  const picked = candidates.filter((c) => chosen.includes(c.id));
  const toggle = (id: string) => setChosen((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`}
        onClick={onClose}
        aria-label="Cancel the choice of personnel"
      />
      <div
        role="dialog"
        aria-label={`${title}: choose personnel`}
        data-testid="personnel-choice"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(90), width: safeModalWidth('22rem') }}
      >
        <h2 className="text-sm font-semibold text-text-primary">{title}: stop personnel</h2>
        <p data-testid="personnel-choice-summary" className="text-xs text-text-muted">
          {personnelChoiceSummary(picked)}
        </p>
        <div className="relative flex min-h-0 flex-col">
          <div ref={scrollRef} className={`min-h-0 overscroll-contain ${panelScrollClassName(scrolls)}`}>
            {count === 0 ? (
              <p className="text-sm text-text-muted">No unstopped personnel on the table.</p>
            ) : (
              groups.map((group) => (
                <div key={group.key} data-testid="personnel-choice-group" className="mb-2 flex flex-col gap-1">
                  <h3 className="text-[11px] text-text-muted">{group.label}</h3>
                  {group.cards.map((c) => {
                    const on = chosen.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-testid="personnel-choice-card"
                        data-card-choice={c.id}
                        aria-pressed={on}
                        onClick={() => toggle(c.id)}
                        className={`flex min-h-11 items-center gap-2 rounded border px-2 text-left text-sm ${
                          on ? 'border-blue-400 bg-blue-500/20 text-text-primary' : 'border-white/10 text-text-primary'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-xs text-text-muted">{c.affiliation || 'No affiliation'}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <ScrollIndicator scrollerRef={scrollRef} scrolls={scrolls} deps={[count]} />
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-2">
          <button type="button" data-testid="personnel-choice-cancel" onClick={onClose} className="btn-icon min-h-11 w-auto px-3 text-sm">
            Cancel
          </button>
          <button
            type="button"
            data-testid="personnel-choice-confirm"
            onClick={() => onConfirm(picked.map((c) => c.id))}
            className="btn-icon min-h-11 w-auto px-3 text-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  );
}

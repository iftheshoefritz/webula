import React, { useEffect, useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { controlsBySection } from './controls';
import { useFinePointer } from './useFinePointer';

type ControlColumn = 'touch' | 'mouse';

const COLUMNS: { column: ControlColumn; label: string }[] = [
  { column: 'touch', label: 'Touch' },
  { column: 'mouse', label: 'Mouse' },
];

// The Controls panel (#1088), opened from the game menu or by `?controls=1`: every action of the
// table, grouped by section, for touch or for a mouse. It opens on the column of the device
// (`useFinePointer`), and the Touch / Mouse switch shows the other one. The switch is not
// remembered, so every opening follows the device again. A tap on the backdrop or Escape closes
// it, the same as the Game log panel.
export default function ControlsPanel({ onClose }: { onClose: () => void }) {
  const finePointer = useFinePointer();
  // Null until the player picks a column, so the panel follows the device, which
  // `useFinePointer` reports only after the first render.
  const [picked, setPicked] = useState<ControlColumn | null>(null);
  const column: ControlColumn = picked ?? (finePointer ? 'mouse' : 'touch');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Close controls" />
      <div
        role="dialog"
        aria-label="Controls"
        data-testid="controls-panel"
        data-column={column}
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex max-h-[85vh] w-[min(32rem,90vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Controls</h2>
          <div role="group" aria-label="Show the controls for" className="flex overflow-hidden rounded-md border border-white/10">
            {COLUMNS.map(({ column: value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={column === value}
                onClick={() => setPicked(value)}
                className={`px-3 py-1 text-sm ${
                  column === value ? 'bg-white/[0.15] text-text-primary' : 'text-text-muted hover:bg-white/[0.08] hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto">
          {controlsBySection().map(({ section, rows }) => (
            <section key={section} className="mb-3 last:mb-0">
              <h3 className="text-xs uppercase tracking-wide text-text-muted">{section}</h3>
              <dl className="divide-y divide-solid divide-white/[0.06]">
                {rows.map((row) => (
                  <div key={row.id} data-testid={`control-${row.id}`} className="py-1 text-sm">
                    <dt className="font-medium text-text-primary">{row.action}</dt>
                    <dd className="text-text-secondary">{row[column]}</dd>
                    {/* The clips of #1089 go here. */}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

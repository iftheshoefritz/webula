import React, { useEffect, useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { EMPTY_LOG_TEXT, gameLogText, LogEntry, logByTurn, logEntryText } from './gameLog';

// How long the Copy button says "Copied" or "Copy failed".
const COPY_FEEDBACK_MS = 1500;

// The game log (#1065), opened from the game menu: the entries grouped by turn, oldest first,
// read-only. Copy puts the whole log on the clipboard as plain text. A tap on the backdrop or
// Escape closes it, the same as the Decklist panel.
export default function GameLogPanel({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gameLogText(log));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
  };

  return (
    <>
      <button type="button" className={`fixed inset-0 ${LAYER_MODAL_BACKDROP} bg-black/40`} onClick={onClose} aria-label="Close game log" />
      <div
        role="dialog"
        aria-label="Game log"
        data-testid="game-log"
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex max-h-[85vh] w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Game log</h2>
          <button type="button" onClick={copy} className="btn-primary">
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
        <div className="overflow-y-auto">
          {log.length === 0 ? (
            <p className="py-1 text-sm text-text-muted">{EMPTY_LOG_TEXT}</p>
          ) : (
            logByTurn(log).map(({ turn, entries }, groupIndex) => (
              <section key={groupIndex} data-testid={`game-log-turn-${turn}`} className="mb-3 last:mb-0">
                <h3 className="text-xs uppercase tracking-wide text-text-muted">Turn {turn}</h3>
                <ol className="divide-y divide-solid divide-white/[0.06]">
                  {entries.map((entry, i) => (
                    <li key={i} className="py-1 text-sm text-text-secondary">
                      {logEntryText(entry)}
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}

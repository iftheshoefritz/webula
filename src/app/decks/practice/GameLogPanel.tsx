import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LAYER_MODAL, LAYER_MODAL_BACKDROP } from '../../../lib/layers';
import { useEscapeLayer } from './useEscapeLayer';
import { effectiveLog, EMPTY_LOG_TEXT, gameLogText, LogEntry, logByTurn, logEntryText, segmentTotalText, TURN_SEGMENT_HEADINGS } from './gameLog';
import { safeModalMaxHeight, safeModalWidth } from './useSafeAreaInsets';

// How long the Copy button says "Copied" or "Copy failed".
const COPY_FEEDBACK_MS = 1500;

// How close to the end, in px, the list counts as scrolled to the end.
const AT_END_SLACK = 4;

// The game log (#1065), opened by the game log button under the undo button (#1399): the entries grouped by turn, oldest first,
// read-only. It opens scrolled to the end, so the newest entry shows (#1562), and while it is
// open it follows a new entry (an undo or a redo by the keyboard) only when it was at the end.
// Copy puts the whole log on the clipboard as plain text. A tap on the backdrop or
// Escape closes it, the same as the Decklist panel.
export default function GameLogPanel({ log, onClose }: { log: LogEntry[]; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEscapeLayer(onClose);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Whether the list was at its end at the last scroll; true on mount, so it opens at the end.
  const atEndRef = useRef(true);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && atEndRef.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atEndRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_END_SLACK;
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

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
        className={`fixed left-1/2 top-1/2 ${LAYER_MODAL} flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-white/10 bg-bg-secondary p-3 shadow-lg`}
        style={{ maxHeight: safeModalMaxHeight(85), width: safeModalWidth('28rem') }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Game log</h2>
          <button type="button" onClick={copy} className="btn-primary">
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        </div>
        <div ref={scrollRef} onScroll={onScroll} data-testid="game-log-scroll" className="overflow-y-auto">
          {log.length === 0 ? (
            <p className="py-1 text-sm text-text-muted">{EMPTY_LOG_TEXT}</p>
          ) : (
            // Each charge at its corrected cost (#1607).
            logByTurn(effectiveLog(log)).map(({ turn, segments }, groupIndex) => (
              <section key={groupIndex} data-testid={`game-log-turn-${turn}`} className="mb-3 last:mb-0">
                <h3 className="text-xs uppercase tracking-wide text-text-muted">Turn {turn}</h3>
                {segments.map(({ segment, entries }, segmentIndex) => {
                  // The counters of a play and draw segment (#1606), from its entries alone.
                  const total = segmentTotalText(segment, entries);
                  return (
                    <div key={segmentIndex} data-testid="game-log-segment" data-segment={segment} className="mt-1">
                      <h4 className="text-xs italic text-text-muted">{TURN_SEGMENT_HEADINGS[segment]}</h4>
                      {total && (
                        <p data-testid="game-log-segment-total" className="text-xs text-text-muted">
                          {total}
                        </p>
                      )}
                      <ol className="divide-y divide-solid divide-white/[0.06]">
                        {entries.map((entry, i) => (
                          <li key={i} className="py-1 text-sm text-text-secondary">
                            {logEntryText(entry)}
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}

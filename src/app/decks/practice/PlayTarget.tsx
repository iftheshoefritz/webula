// The Play drop target (#1729), mounted only while it shows (`playTarget.ts`): a box over the whole
// table above `line`, the mission row and the ship rows, that reads Play. It takes the `valid` ring
// while it shows and the `over` ring under the pointer. It is portalled into the game layer, which is
// `fixed inset-0`, so `line` is a viewport y. It takes no pointer events: dnd-kit measures it and
// tracks the pointer on the window.

import { useDroppable } from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import { LAYER_PLAY_TARGET } from '../../../lib/layers';
import { PLAY_TARGET_ID } from './playTarget';
import { highlightClassName } from './zoneAccepts';

export function PlayTarget({ line, container }: { line: number; container: HTMLElement | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAY_TARGET_ID });
  const highlight = isOver ? 'over' : 'valid';
  if (!container) return null;
  return createPortal(
    <div
      ref={setNodeRef}
      data-zone={PLAY_TARGET_ID}
      data-testid="play-target"
      data-highlight={highlight}
      className={`fixed inset-x-0 top-0 ${LAYER_PLAY_TARGET} pointer-events-none flex items-center justify-center rounded-lg bg-accent/10 ${highlightClassName(highlight)}`}
      style={{ height: Math.max(0, line) }}
    >
      <span className="rounded-full bg-black/60 px-4 py-1 text-lg font-semibold text-text-primary">Play</span>
    </div>,
    container
  );
}

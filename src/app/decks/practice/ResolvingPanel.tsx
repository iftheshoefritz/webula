// The resolving event (#1728): the modal panel that shows the event of `TableState.resolving` while its
// text resolves, and the small card it collapses to under View table or Escape.
//
// The panel shows the event as a whole card, with Resolved → Discard, Cancel and View table. Its card,
// and the small card, drag out under `panelDraggableId` like a card list panel's, so the page's drag
// handlers find the card in `resolving` and the drop lands wherever any drop of it lands. The panel is no
// drop target. It follows the card list panel's `hidden` convention: during a drag it stays mounted, with
// no visibility and no pointer events, so every target on the table can be reached.
//
// The backdrop and the panel sit below the charge chip (`LAYER_RESOLVING_PANEL`), so the chip of the
// play and its choices stay reachable, and below the game menu splash, which covers them.

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { LAYER_RESOLVING_MINI, LAYER_RESOLVING_PANEL } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { cardImageUrl, showCardMissing } from '../../../lib/cardImageUrl';
import { panelDraggableId } from './panelDragId';
import { CardInstance } from './tableReducer';
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH } from './viewerCardSize';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { useEscapeLayer } from './useEscapeLayer';
import { PREVIEW_MAX_HEIGHT } from './previewSize';
import { SAFE_INSET_CSS, safeAreaMargins } from './useSafeAreaInsets';
import { PANEL_SURFACE_CLASSNAME } from './CardListPanel';

// The height of the panel's card: the native height of the image at most, and what the screen leaves
// once the panel's padding and the insets are off, so the card and its buttons fit 667×375.
const PANEL_CARD_HEIGHT = `min(${PREVIEW_MAX_HEIGHT}px, calc(100dvh - 48px - ${SAFE_INSET_CSS.top} - ${SAFE_INSET_CSS.bottom}))`;
// The small card of View table, the size of a pile card at scale 1.
export const RESOLVING_MINI_WIDTH = 56; // px
const MINI_HEIGHT = Math.round((RESOLVING_MINI_WIDTH * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH);

// The event's card, a drag source and a hold preview, with `data-card-id` inside a `data-zone` of
// `resolving` for `practice_drag.sh`. No `useDroppable`.
function ResolvingCard({
  instance,
  onTap,
  imageStyle,
  testId,
}: {
  instance: CardInstance;
  onTap?: () => void;
  imageStyle: React.CSSProperties;
  testId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: panelDraggableId(instance.id) });
  const holdListeners = useCardHold(instance.id, listeners);
  const name = cardDisplayName(instance.card);
  return (
    <div data-zone="resolving" data-testid={testId} className="relative shrink-0">
      <button
        ref={setNodeRef}
        type="button"
        data-card-id={instance.id}
        onClick={onTap}
        {...attributes}
        {...holdListeners}
        className="block touch-none rounded-md focus:outline-hidden"
        style={{ ...NO_CALLOUT_STYLE, opacity: isDragging ? 0.5 : 1 }}
        aria-label={onTap ? `Show ${name}` : name}
      >
        <img
          draggable={false}
          src={cardImageUrl(instance.card)}
          onError={showCardMissing}
          width={CARD_IMAGE_WIDTH}
          height={CARD_IMAGE_HEIGHT}
          alt={name}
          className="rounded-md shadow-md"
          style={{ ...NO_CALLOUT_STYLE, ...imageStyle }}
        />
      </button>
    </div>
  );
}

export function ResolvingPanel({
  instance,
  hidden,
  escapeActive,
  onDiscard,
  onCancel,
  onViewTable,
}: {
  instance: CardInstance;
  // During a drag: mounted, with no visibility and no pointer events.
  hidden: boolean;
  // Whether Escape reaches the panel: not while the game menu splash covers it.
  escapeActive: boolean;
  onDiscard: () => void;
  onCancel: () => void;
  onViewTable: () => void;
}) {
  // Escape collapses the panel to the small card, and never discards the event; during a drag it does
  // nothing, as a card list panel's does.
  useEscapeLayer(() => {
    if (!hidden) onViewTable();
  }, escapeActive);
  const name = cardDisplayName(instance.card);
  const button = 'btn-primary w-full whitespace-nowrap text-sm';
  const secondary = `${button} bg-none bg-white/[0.05]`;
  return (
    <div
      className={`fixed inset-0 ${LAYER_RESOLVING_PANEL} flex items-center justify-center`}
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      {/* The backdrop takes a tap and does nothing with it: the event resolves by a button. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-label={`Resolving ${name}`}
        data-testid="resolving-panel"
        className={`relative flex flex-row items-center gap-3 rounded-lg ${PANEL_SURFACE_CLASSNAME} p-3`}
        style={safeAreaMargins('top', 'right', 'bottom', 'left')}
      >
        <ResolvingCard
          instance={instance}
          testId="resolving-card"
          imageStyle={{ height: PANEL_CARD_HEIGHT, width: 'auto', aspectRatio: `${CARD_IMAGE_WIDTH} / ${CARD_IMAGE_HEIGHT}` }}
        />
        <div className="flex w-32 flex-col gap-2">
          <p className="text-xs text-text-muted">Resolving</p>
          <button type="button" data-testid="resolving-discard" className={button} onClick={onDiscard}>
            Resolved → Discard
          </button>
          <button type="button" data-testid="resolving-cancel" className={secondary} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" data-testid="resolving-view-table" className={secondary} onClick={onViewTable}>
            View table
          </button>
        </div>
      </div>
    </div>
  );
}

// The small card of View table, at the right side of the screen, above the table: a tap brings the panel
// back, a hold previews the event, and it drags out like the panel's card.
export function ResolvingMini({ instance, onOpen }: { instance: CardInstance; onOpen: () => void }) {
  return (
    <div
      className={`fixed ${LAYER_RESOLVING_MINI} flex flex-col items-center gap-0.5 rounded-md bg-black/60 p-1`}
      style={{ right: 8, top: '30%', ...safeAreaMargins('right') }}
    >
      <span className="text-[9px] uppercase tracking-wide leading-3 text-text-secondary">Resolving</span>
      <ResolvingCard
        instance={instance}
        testId="resolving-mini"
        onTap={onOpen}
        imageStyle={{ width: RESOLVING_MINI_WIDTH, height: MINI_HEIGHT }}
      />
    </div>
  );
}

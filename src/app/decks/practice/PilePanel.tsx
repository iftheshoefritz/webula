'use client';

// A mission's personnel, event, or under-the-mission pile panel (#602, #606), and, since #640,
// the core's and the brig's own panel too: a tap on a pile's badge (or,
// for the under-the-mission pile, the card-edge strip) (`MissionRow`), or a tap on any card
// already sitting in the core or the brig (`FlatCardRow`), opens this panel, listing that zone's
// cards face up regardless of their stored face (the same true-face-to-owner convention
// `CardPreview` uses for the enlarged preview). A panel that has a Flip button (#762, below) does
// not follow that convention: it draws the card back for a card whose stored
// `face` is `down`, and the art for a card whose `face` is `up`, so a Flip shows in the panel.
// `CardPreview` keeps the true-face-to-owner convention. The panels with no Flip button (the
// core, the brig, a crew, a ship row, and the draw and dilemma piles, which the player opens to
// download, #690) still list every card face up. The tap acts, the hold looks: a tap on a card
// toggles it in or out of the selection, and a press and hold shows its preview (`useCardHold`).
// Each card is draggable out via the same `useDraggable` + `DragOverlay` mechanism
// the hand and the crew row already use. The card name stays off the panel as visible text (#674);
// it is still on the image's `alt` and the card button's `aria-label`, for a screen reader.
//
// The `'crew'` zone (#664) is opened by a tap on a ship with crew aboard, and uses the same
// centered, up-to-90%-wide box every other zone uses.
//
// Follows a `hidden` convention: the panel stays mounted (not
// unmounted) for the rest of a drag that started from a card inside it, so a touch drag begun
// there survives the panel closing (the #611 WebKit hazard: an element removed from the document
// mid-touch-drag stops receiving further touch events). `page.tsx`'s existing "any drag closing
// clears the open preview" logic (`handleDragEnd`) extends to close this panel too.
//
// Each card also carries a small select checkbox (#677), a sibling of the card's own draggable
// button rather than nested inside it — the same "control and drop/drag target sit side by
// side, not nested" pattern `PileBadge`/`ShipCrewBadge` (`MissionRow.tsx`) already use, since a
// `<button>` cannot nest inside another `<button>`. A tap on the checkbox toggles that card in
// or out of `selectedIds`, owned by `page.tsx` (not this component), so a drag started from a
// selected card can pick up the whole selection in `handleDragStart`. A tap on the card itself
// toggles it the same way; the checkbox stays as a second, smaller way to do it.
//
// A Shuffle button (#680) sits in every panel, as the first item in the box, next to the cards
// rather than on the backdrop — a tap on the backdrop still just closes the panel. `onShuffle`
// dispatches the `shuffle` table action for whichever zone this panel is currently open for
// (`page.tsx` picks the right `location` per call site); the reducer puts that zone's cards in a
// random order in the table state itself, so the panel, the table, and the next time the panel
// opens all agree on the new order. A tap on Shuffle does not close the panel.
// A "Stop"/"Unstop" button (#681) shows above the card grid whenever the selection holds one or
// more personnel cards; a selection with no personnel card at all shows no button, and a
// non-personnel card in the selection just never changes. The label reads "Stop" once any
// selected personnel card is not yet stopped, and "Unstop" only once every one of them already
// is — a tap then sets every selected personnel card's `stopped` flag to that single value in
// one `onSetStopped` call (owned by `page.tsx`, like the selection itself), never a per-card
// toggle, so a mixed selection cannot go out of step with itself. The selection stays after the
// tap, so the player can still drag the same cards next.
// A "Flip" button (#762) sits beside it, in the panels whose cards the preview can flip: a
// mission's personnel, event, and under-the-mission piles, and the dilemma stack. `page.tsx`
// passes `onFlip` only for those zones. It shows
// once the selection holds one or more of this panel's cards, and a tap dispatches the existing
// `flip` action once per selected card, so each card turns over on its own: a mixed selection
// stays mixed, inverted. The selection stays after the tap, as with Stop.
//
// A card sets `touch-none`, so the browser does not pan the table under a touch drag. Inside a
// card grid that scrolls (#720) that also stopped the grid from scrolling under a finger, and a
// scroll picked the card up instead (#788). So once the grid overflows, its cards take
// `touch-action: pan-y` and the grid carries `PANEL_SCROLLS_ATTRIBUTE`, which hands a touch or
// pen press there to `PanelScrollSensor` (`panelScrollSensor.ts`): a first move mostly up or down
// scrolls, a first move mostly sideways drags. A grid that fits keeps `touch-none` and a drag in
// any direction.

import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionPileName } from './tableReducer';
import { STOPPED_IMAGE_CLASSNAME } from './TableCard';
import OverlapRow from './OverlapRow';
import { viewerCardSize } from './viewerCardSize';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { PANEL_SCROLLS_ATTRIBUTE } from './panelGesture';

// A plain inline icon (not react-icons, the same reasoning `MissionRow.tsx`'s small badge icons
// document): every test that renders this page mocks `react-icons/fa` with an explicit list of
// the icons `page.tsx` itself imports, so a new react-icons import here would need every one of
// those mocks updated too, for a component this small.
export function ShuffleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
      aria-hidden="true"
    >
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

// A mission pile is one of `MissionPileName`; the core and the brig (#640) are two more flat
// zones this same panel now lists, alongside a mission's piles. A ship's crew (#664) is a third:
// like the core and the brig, it is not addressed by mission index, so it is named the same way,
// by its own zone string rather than a `MissionPileName`. The draw pile and the dilemma pile
// (#690) are a fourth and fifth: opening this panel for either one lets the player download from
// it — the game's term for a look through every card without drawing — while the rest of the pile
// stays exactly where it was, in its existing order. The player normally shuffles afterwards,
// with the panel's own Shuffle button, because the download showed them the whole pile.
// A mission's own ship row (#713) is a sixth: once it holds more ships than fit without overlap,
// a tap on any of them opens this panel listing every ship on that row individually, the same
// way the core and the brig already list their own cards. The dilemma stack (#733) is a seventh;
// #630 gives it the tap target on the table that opens this panel. The discard pile (#782) is an
// eighth: a tap on it lists every discarded card, not just the top one the table shows. It has no
// Shuffle and no Stop control: its order comes from play, and a discarded card is never stopped.
export type PanelZone =
  | MissionPileName
  | 'core'
  | 'brig'
  | 'crew'
  | 'pile'
  | 'dilemmaPile'
  | 'dilemmaStack'
  | 'shipRow'
  | 'discard';

const PANEL_LABEL: Record<PanelZone, string> = {
  personnel: 'Personnel',
  event: 'Event',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
  crew: 'Crew',
  pile: 'Draw pile',
  dilemmaPile: 'Dilemma pile',
  dilemmaStack: 'Dilemma stack',
  shipRow: 'Ships',
  discard: 'Discard pile',
};

// The core, the brig, a ship's crew (#664), the draw pile, the dilemma pile (#690), the dilemma
// stack (#733), and a mission's own ship row (#713) already say "pile" or "stack" (or need no
// such word at all) in their own label, so their close button's label does not repeat it; a mission pile's label keeps the
// trailing "pile", unchanged from before #640.
const closeLabel = (zone: PanelZone): string =>
  zone === 'core' ||
  zone === 'brig' ||
  zone === 'crew' ||
  zone === 'pile' ||
  zone === 'dilemmaPile' ||
  zone === 'dilemmaStack' ||
  zone === 'shipRow' ||
  zone === 'discard'
    ? `Close ${PANEL_LABEL[zone].toLowerCase()}`
    : `Close ${PANEL_LABEL[zone].toLowerCase()} pile`;

function PilePanelCard({
  instance,
  selected,
  onToggleSelect,
  cardWidth,
  cardArtHeight,
  reorderable = false,
  showBackWhenFaceDown = false,
  gridScrolls = false,
}: {
  instance: CardInstance;
  selected: boolean;
  onToggleSelect: () => void;
  cardWidth: number;
  cardArtHeight: number;
  // The dilemma stack's own popup only (#632): registers this card's own instance id as a drop
  // target too, alongside the draggable identity every card already has, so a drop that lands on
  // top of this card resolves to something (`handleDragEnd` in `page.tsx` then reads it as "move
  // this stack card next to that one" rather than a move out of the zone). Every other `PilePanel`
  // zone leaves this card a plain, non-droppable `useDraggable`, unchanged.
  reorderable?: boolean;
  // A panel with a Flip button (#762) draws a face-down card as the card back.
  showBackWhenFaceDown?: boolean;
  // The panel's card grid overflows (#788): let the browser pan it vertically under a touch.
  gridScrolls?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: instance.id, disabled: !reorderable });
  const holdListeners = useCardHold(instance.id, listeners);
  const { card } = instance;
  const showBack = showBackWhenFaceDown && instance.face === 'down';

  return (
    <div
      ref={reorderable ? setDropRef : undefined}
      data-zone={reorderable ? instance.id : undefined}
      className="relative"
      style={{ width: cardWidth }}
    >
      <button
        ref={setNodeRef}
        type="button"
        data-card-id={instance.id}
        onClick={onToggleSelect}
        {...attributes}
        {...holdListeners}
        className={`flex flex-col items-center gap-0.5 focus:outline-none ${
          gridScrolls ? 'touch-pan-y' : 'touch-none'
        } w-full rounded-md ${
          selected ? 'ring-2 ring-accent' : ''
        }`}
        style={{
          ...NO_CALLOUT_STYLE,
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        aria-label={card.name}
      >
        <div className="relative w-full" style={{ height: cardArtHeight }}>
          <div className="w-full h-full rounded-md overflow-hidden bg-black/20">
            <img
              src={showBack ? '/cardimages/cardback.jpg' : `/cardimages/${card.imagefile}.jpg`}
              alt={card.name}
              className={`w-full h-full object-cover object-top ${instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
              style={NO_CALLOUT_STYLE}
            />
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${card.name}` : `Select ${card.name}`}
        className={`absolute top-0.5 right-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-none ${
          selected ? 'bg-accent border-accent text-white' : 'bg-black/50 border-white/50 text-transparent'
        }`}
      >
        ✓
      </button>
    </div>
  );
}

export default function PilePanel({
  zone,
  cards,
  onClose,
  selectedIds,
  onToggleSelect,
  onShuffle,
  onSetStopped,
  onFlip,
  onDiscard,
  hidden = false,
  cardWidth = viewerCardSize(1).width,
  cardArtHeight = viewerCardSize(1).artHeight,
}: {
  zone: PanelZone;
  cards: CardInstance[];
  onClose: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  // Left out for the discard pile (#782), whose panel shows no Shuffle button.
  onShuffle?: () => void;
  // Sets `stopped` to one explicit value on a list of ids (#681), so the "Stop"/"Unstop" button
  // below sets every selected card the same way rather than toggling each one on its own.
  // Left out for the discard pile (#782), whose panel shows no Stop button.
  onSetStopped?: (ids: string[], stopped: boolean) => void;
  // Turns each id over on its own (#762). Given only for the zones whose cards can be flipped;
  // its presence is what shows the "Flip" button and draws face-down cards as the card back.
  onFlip?: (ids: string[]) => void;
  // Moves each id to the discard pile, in the panel's order (#787). Left out for the discard
  // pile's own panel, whose cards are already there.
  onDiscard?: (ids: string[]) => void;
  hidden?: boolean;
  // Issue #717: this panel is one of "the modals" the issue names, so its own card grid grows
  // the same way the table's mission cards do — `page.tsx` computes both from the same `scale`
  // (`tableScale.ts`) and passes the result down here, at the viewer's 1.5x (`viewerCardSize`,
  // #802). Defaults to that size at scale 1 for callers, including this component's own tests,
  // that don't care about the grown state.
  cardWidth?: number;
  cardArtHeight?: number;
}) {
  // The dilemma stack's own popup only (#632): a wrapped, multi-per-row grid — every other
  // `PilePanel` zone's layout — has no single top or bottom once it wraps past one row, so this
  // one zone instead lays its cards out in a single ordered row, left-to-right mapped to
  // first-revealed-to-last-revealed (#630/#733's index-0-is-first-revealed convention), with a
  // label at each end saying so. A single column of cards (this popup's original #632 layout)
  // overflows a short, wide viewport (568x320) after only two or three cards, clipping the rest
  // below the panel's own `max-h` cap — the clipped card is still in the DOM, at a real but
  // off-screen position, so a tap there hits whatever paints underneath instead (the panel's own
  // backdrop, closing it) rather than picking the card up. A row, like the open hand's own fan
  // (`CardHand.tsx`, `offsetFor` in `overlapOffset.ts`), instead overlaps the cards' edges to fit
  // many of them into the same bounded width every other bottom-row zone already fits into, so
  // every card stays reachable at that viewport. Each card also becomes a drop target of its own
  // (`reorderable` on `PilePanelCard`), so a drop on top of a neighbour reorders the stack instead
  // of leaving the zone.
  const isDilemmaStack = zone === 'dilemmaStack';
  // The stack's row is `OverlapRow` (#802), the same component the open fan uses. Its width
  // bound is the row's own measured width, not a card-count guess (#632's browser-check
  // follow-up): a guess of six cards let the sixth card fall outside the panel at 568 x 320, and a
  // card outside the panel is clipped, so a tap there hits whatever paints underneath. The row
  // sits inside the stack's own `w-[86vw]` box, so every card stays inside the panel.
  // Whether the card grid scrolls (#788), from the grid element itself. Re-measured when the
  // grid resizes (the viewport changes the panel's height bound) and when the card count or size changes (the
  // grid keeps its capped height while its content grows). jsdom reports 0 for both heights, so
  // the Jest tests see a grid that fits, and today's `touch-none`.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridScrolls, setGridScrolls] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || isDilemmaStack) {
      setGridScrolls(false);
      return;
    }
    const measure = () => setGridScrolls(el.scrollHeight > el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDilemmaStack, cards.length, cardWidth, cardArtHeight]);
  // #802: the panel may use the full height of the game layer. `insetClassName` is a box inset
  // a little from each edge of this component's own `fixed inset-0` box (the same box as the game
  // layer), so the panel follows the layer's height without any `dvh` arithmetic. It lets taps
  // through (`pointer-events-none`) to the backdrop, and only the panel inside it takes them.
  const insetClassName = 'absolute inset-2 flex flex-col items-center pointer-events-none';
  // Positioning only; the visible card grid itself is `gridClassName` below, a sibling of the
  // button row. `max-h-full` bounds the panel by the inset box but sets no height, so a pile of
  // two cards keeps a small box that hugs its cards.
  const layoutClassName = 'flex flex-col items-center gap-2 max-w-[90%] max-h-full min-h-0 pointer-events-auto';
  // #720: a pile with many cards used to grow this box past the bottom of the screen, with no
  // way to scroll down to the cards that fell off. The grid is the one child of the panel that
  // shrinks (`min-h-0`) once the panel reaches `max-h-full`, and `overflow-y-auto` scrolls the
  // cards inside it once they no longer fit. The buttons above stay outside this scrolling
  // element (`shrink-0`), so they never scroll out of view with the cards. The stack's box hugs
  // its one row: `dilemmaStackPopupCollisionDetection` reads its rectangle as "reorder only".
  const gridClassName = isDilemmaStack
    ? 'shrink-0 flex flex-col items-stretch gap-1 rounded-lg bg-black/70 p-2 w-[86vw] overflow-hidden'
    : 'min-h-0 flex flex-wrap items-start justify-center gap-2 rounded-lg bg-black/70 p-2 overflow-y-auto overscroll-contain';
  // The two end labels sit on their own line above the cards, not at the two ends of the card
  // row: a label in the row takes width from the cards, and the row must keep all of its width
  // for them. The line reads left to right, the same order the
  // cards below it do.
  const stackEndLabelClassName = 'shrink-0 text-[10px] font-bold uppercase tracking-wide text-text-secondary';

  const selectedPersonnel = cards.filter(
    (instance) => selectedIds.includes(instance.id) && instance.card.type === 'personnel'
  );
  const showStopButton = onSetStopped !== undefined && selectedPersonnel.length > 0;
  const allSelectedStopped = showStopButton && selectedPersonnel.every((instance) => instance.stopped);
  const handleStopTap = () => onSetStopped?.(selectedPersonnel.map((instance) => instance.id), !allSelectedStopped);
  const selectedInPanel = cards.filter((instance) => selectedIds.includes(instance.id));
  const showFlipButton = onFlip !== undefined && selectedInPanel.length > 0;
  const handleFlipTap = () => onFlip?.(selectedInPanel.map((instance) => instance.id));
  const showDiscardButton = onDiscard !== undefined && selectedInPanel.length > 0;
  const handleDiscardTap = () => onDiscard?.(selectedInPanel.map((instance) => instance.id));

  return (
    <div
      className="fixed inset-0 z-[150]"
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label={closeLabel(zone)}
      />
      <div className={insetClassName}>
      <div className={layoutClassName}>
        {(showStopButton || showFlipButton || showDiscardButton) && (
          <div className="shrink-0 flex flex-row items-center gap-2">
            {showStopButton && (
              <button type="button" onClick={handleStopTap} className="btn-primary">
                {allSelectedStopped ? 'Unstop' : 'Stop'}
              </button>
            )}
            {showFlipButton && (
              <button type="button" onClick={handleFlipTap} className="btn-primary">
                Flip
              </button>
            )}
            {showDiscardButton && (
              <button type="button" onClick={handleDiscardTap} className="btn-primary">
                Discard
              </button>
            )}
          </div>
        )}
        {/* The Shuffle button (#680) sits inside the panel, next to the cards, not on the
            backdrop — a tap on the backdrop still closes the panel, and a tap here does not.
            It is a sibling of the card grid, the same place the "Stop"/"Unstop" button (#681)
            sits, so both panel controls stack above the cards. */}
        {onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            className="shrink-0 flex items-center justify-center gap-1 rounded-md bg-white/[0.05] border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.1] transition-colors duration-150"
          >
            <ShuffleIcon />
            Shuffle
          </button>
        )}
        <div
          ref={gridRef}
          data-zone={`pile-panel-${zone}`}
          {...{ [PANEL_SCROLLS_ATTRIBUTE]: gridScrolls ? 'true' : undefined }}
          className={gridClassName}
        >
          {isDilemmaStack && (
            <div className="flex flex-row justify-between">
              <span className={stackEndLabelClassName}>Top (revealed first)</span>
              <span className={stackEndLabelClassName}>Bottom (revealed last)</span>
            </div>
          )}
          {isDilemmaStack ? (
            // The cards overlap rather than sit side by side (`OverlapRow`), with `zIndex` rising
            // left to right, so a later (further down the stack) card's edge sits on top of the
            // one before it, the same reading order the labels at each end describe.
            <OverlapRow
              items={cards}
              keyFor={(instance) => instance.id}
              cardWidth={cardWidth}
              height={cardArtHeight}
              renderCard={(instance) => (
                <PilePanelCard
                  instance={instance}
                  selected={selectedIds.includes(instance.id)}
                  onToggleSelect={() => onToggleSelect(instance.id)}
                  cardWidth={cardWidth}
                  cardArtHeight={cardArtHeight}
                  reorderable
                  showBackWhenFaceDown={onFlip !== undefined}
                />
              )}
            />
          ) : (
            cards.map((instance) => (
              <PilePanelCard
                key={instance.id}
                instance={instance}
                selected={selectedIds.includes(instance.id)}
                onToggleSelect={() => onToggleSelect(instance.id)}
                cardWidth={cardWidth}
                cardArtHeight={cardArtHeight}
                showBackWhenFaceDown={onFlip !== undefined}
                gridScrolls={gridScrolls}
              />
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

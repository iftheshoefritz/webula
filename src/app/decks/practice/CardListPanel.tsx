'use client';

// A mission's away team or under-the-mission card list panel (#602, #606), and, since #640,
// the core's and the brig's own panel too: a tap on a pile's badge (or,
// for the under-the-mission pile, the card-edge strip) (`MissionRow`), or a tap on any card
// already sitting in the core or the brig (`FlatCardRow`), opens this panel, listing that zone's
// cards face up regardless of their stored face. Each card shows as the whole card image (#806)
// (except, on a phone or a tablet, in the crew panel and the away team panel, #1071: see `artCrop`),
// frame and text included, not as the cropped art of the table card (`TableCard.tsx`): the panel
// is where the player reads a card, so the text on it must be there (the same true-face-to-owner convention
// `CardPreview` uses for the enlarged preview). A panel that has a Flip button (#762, below) draws
// the card face up too, and marks a card whose stored `face` is `down` with the same "Face down"
// badge the preview shows (#826), so a Flip shows in the panel and the player can still read the
// card. The away team panel shows no mark (#964): its cards are face down by default. The mark is not the stopped look (`STOPPED_IMAGE_CLASSNAME`): a card can be both. The
// panels with no Flip button (the core, the brig, a crew, a ship row, and the draw and dilemma
// piles, which the player opens to download, #690) list every card face up with no mark. The tap acts, the hold looks: a tap on a card
// toggles it in or out of the selection, and a press and hold shows its preview (`useCardHold`).
// Each card is draggable out via the same `useDraggable` + `DragOverlay` mechanism
// the hand and the crew row already use. The card name stays off the panel as visible text (#674);
// it is still on the image's `alt` and the card button's `aria-label`, for a screen reader.
//
// The `'crew'` zone (#664) is opened by a tap on a ship, and uses the same
// centered, up-to-90%-wide box every other zone uses. Since #832 it also shows the ship itself
// (`host`), in its own section outside the crew grid (`PanelHost`), so a ship with no
// crew opens the panel too. Since #881 the panel of the cards placed on a card shows that card the
// same way. Since #894 that section sits to the right of the grid, not above it, and keeps the
// size of a panel card: above the grid it shrank with the grid on a short viewport until the host
// could not be read. The ship is for display and a hold preview only: it registers no
// draggable (the ship's `TableCard` already holds a draggable under the same id) and a tap on it
// does not select it.
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
// toggles it the same way; the checkbox stays as a second, smaller way to do it. The checkbox
// shows only while the card is selected (#1015): an empty box on every unselected card was
// clutter, since a tap on the card already selects it. A tap on the shown checkbox deselects.
//
// A Shuffle button (#680) sits in every panel but the discard pile's, last in the row of
// controls above the cards (#880), rather than on the backdrop — a tap on the backdrop still just closes the panel. `onShuffle`
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
// mission's away team and under-the-mission piles. `page.tsx` passes `onFlip` only for those
// zones. The dilemma stack's panel gets none (#819): its cards stay face down on the table, but
// the panel lists them face up so the player can read them to order the stack, and the table's
// own Reveal control turns the top one over. It shows
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

import React, { RefObject, useEffect, useRef, useState } from 'react';
import { LAYER_CARD_LIST_PANEL } from '../../../lib/layers';
import { cardDisplayName } from '../../../lib/cardCount';
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { cardIdOfDraggable, panelDraggableId } from './panelDragId';
import { dilemmaStackInsertPoint } from './dilemmaStackInsert';
import { CardInstance, MissionPileName } from './tableReducer';
import TableCard, { STOPPED_IMAGE_CLASSNAME, cardBorderStyle } from './TableCard';
import { FACE_DOWN_BADGE_CLASSNAME, FACE_DOWN_LABEL } from './CardPreview';
import OverlapRow from './OverlapRow';
import { artCropHeight, CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, PANEL_TOP_INSET, viewerCardSize, VIEWER_TOP_INSET } from './viewerCardSize';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';
import { PANEL_SCROLLS_ATTRIBUTE } from './panelGesture';
import { BoxSelectRect, useBoxSelect } from './useBoxSelect';

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

// A plain inline eye icon (#751), for the same reason as `ShuffleIcon`. The dilemma stack's
// "Reveal top dilemma" control, each pile's reveal button and the reveal panel's "Reveal top" and
// "Reveal bottom" buttons (#1070, #1078) share it.
export function RevealIcon({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// A mission pile is one of `MissionPileName`; the core and the brig (#640) are two more flat
// zones this same panel now lists, alongside a mission's piles. A ship's crew (#664) is a third:
// like the core and the brig, it is not addressed by mission index, so it is named the same way,
// by its own zone string rather than a `MissionPileName`. The draw pile and the dilemma pile
// (#690) are a fourth and fifth: opening this panel for either one lets the player download from
// it: the player selects cards and presses the panel's Download button (#827), which moves them
// into the matching hand (the draw deck's into `hand`, the dilemma pile's into `dilemmaHand`),
// closes the panel, and shuffles the rest of the pile, because the download showed it to them.
// A mission's own ship row (#713) is a sixth: once it holds more ships than fit without overlap,
// a tap on any of them opens this panel listing every ship on that row individually, the same
// way the core and the brig already list their own cards. The dilemma stack (#733) is a seventh;
// #630 gives it the tap target on the table that opens this panel. The discard pile (#782) is an
// eighth: a tap on it lists every discarded card, not just the top one the table shows. It has no
// Shuffle and no Stop control: its order comes from play, and a discarded card is never stopped.
// The cards placed on a card (#810) in the core or the brig are a ninth.
// #932: the vertical scroll classes of a panel element that may overflow (the card grid and the
// host section beside it). A touch device draws an overlay scrollbar that shows only while a
// finger moves, so an element that overflows takes `overflow-y-scroll` and `scrollbar-visible`
// (`globals.css`), a scrollbar that keeps its place and whose thumb shows how much is off screen.
// An element that fits keeps `overflow-y-auto` and shows no scrollbar.
export function panelScrollClassName(scrolls: boolean): string {
  return scrolls ? 'overflow-y-scroll scrollbar-visible' : 'overflow-y-auto';
}

// Whether the element overflows its height (#788, #932). Re-measured when the element resizes
// and when `deps` change (the element keeps its capped height while its content grows). jsdom
// reports 0 for both heights, so the Jest tests see an element that fits.
function useScrollsVertically(ref: RefObject<HTMLElement | null>, enabled: boolean, deps: unknown[]): boolean {
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) {
      setScrolls(false);
      return;
    }
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, ...deps]);
  return scrolls;
}

export type PanelLocation =
  | MissionPileName
  | 'core'
  | 'brig'
  | 'crew'
  | 'drawDeck'
  | 'dilemmaPile'
  | 'dilemmaStack'
  // The reveal panel of the top cards of the draw deck or the dilemma pile (#1070), apart from
  // the pile's Download panel, which keeps `drawDeck` / `dilemmaPile`.
  | 'drawDeckReveal'
  | 'dilemmaPileReveal'
  | 'shipRow'
  | 'discard'
  | 'on'
  // The cards placed on a mission card, split by type (#1081): the dilemmas, and every other card.
  | 'onEvents'
  | 'onDilemmas';

const PANEL_LABEL: Record<PanelLocation, string> = {
  awayTeam: 'Away team',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
  crew: 'Crew',
  drawDeck: 'Draw deck',
  dilemmaPile: 'Dilemma pile',
  dilemmaStack: 'Dilemma stack',
  drawDeckReveal: 'Top of the draw deck',
  dilemmaPileReveal: 'Top of the dilemma pile',
  shipRow: 'Ships',
  discard: 'Discard pile',
  on: 'On the card',
  onEvents: 'Events on the card',
  onDilemmas: 'Dilemmas on the card',
};

// The core, the brig, a ship's crew (#664), the draw deck, the dilemma pile (#690), the dilemma
// stack (#733), the away team (#841) and a mission's own ship row (#713) already say "deck",
// "pile", "team" or "stack" (or need no
// such word at all) in their own label, so their close button's label does not repeat it; a mission pile's label keeps the
// trailing "pile", unchanged from before #640.
export const isRevealLocation = (location: PanelLocation): location is 'drawDeckReveal' | 'dilemmaPileReveal' =>
  location === 'drawDeckReveal' || location === 'dilemmaPileReveal';

// The reveal panel's title follows the end of the pile it shows (#1078).
const panelLabel = (location: PanelLocation, revealEnd: 'top' | 'bottom'): string =>
  revealEnd === 'bottom' && isRevealLocation(location)
    ? PANEL_LABEL[location].replace(/^Top of the /, 'Bottom of the ')
    : PANEL_LABEL[location];

const closeLabel = (location: PanelLocation, revealEnd: 'top' | 'bottom' = 'top'): string =>
  location === 'core' ||
  location === 'brig' ||
  location === 'crew' ||
  location === 'awayTeam' ||
  location === 'drawDeck' ||
  location === 'dilemmaPile' ||
  location === 'dilemmaStack' ||
  isRevealLocation(location) ||
  location === 'shipRow' ||
  location === 'discard' ||
  location === 'on' ||
  location === 'onEvents' ||
  location === 'onDilemmas'
    ? `Close ${panelLabel(location, revealEnd).toLowerCase()}`
    : `Close ${panelLabel(location, revealEnd).toLowerCase()} pile`;

// The dilemma stack's one row (#632), and the reveal panel's (#1070), with the insertion mark of a reorder drag (#956). The mark
// reads the drag's live `active` and `over` from dnd-kit, the same `over` `handleDragEnd` in
// `page.tsx` receives, so it shows exactly where the drop puts the card
// (`dilemmaStackInsertPoint`). It shows nothing over the dragged card's own slot, over the row's
// empty space, or outside the panel: none of those drops reorders. The mark is a thin accent bar
// that takes no pointer events and carries no `data-zone`: it is not a drop target.
function DilemmaStackRow({
  cards,
  selectedIds,
  onToggleSelect,
  cardWidth,
  cardHeight,
  markFaceDown,
}: {
  cards: CardInstance[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  cardWidth: number;
  cardHeight: number;
  markFaceDown: boolean;
}) {
  const { active, over } = useDndContext();
  const insert = dilemmaStackInsertPoint(
    cards.map((instance) => instance.id),
    active ? cardIdOfDraggable(active.id) : null,
    over ? String(over.id) : null
  );

  return (
    <OverlapRow
      items={cards}
      keyFor={(instance) => instance.id}
      cardWidth={cardWidth}
      height={cardHeight}
      markBoundary={insert?.boundary ?? null}
      renderMark={(left, zIndex) => (
        <div
          data-testid="dilemma-stack-insert-indicator"
          data-slot={insert?.slot}
          aria-hidden="true"
          className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-accent pointer-events-none"
          style={{ left, zIndex }}
        />
      )}
      renderCard={(instance) => (
        <CardListPanelCard
          instance={instance}
          selected={selectedIds.includes(instance.id)}
          onToggleSelect={() => onToggleSelect(instance.id)}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          reorderable
          markFaceDown={markFaceDown}
        />
      )}
    />
  );
}

function CardListPanelCard({
  instance,
  selected,
  onToggleSelect,
  cardWidth,
  cardHeight,
  reorderable = false,
  markFaceDown = false,
  gridScrolls = false,
  artCrop = false,
}: {
  instance: CardInstance;
  selected: boolean;
  onToggleSelect: () => void;
  cardWidth: number;
  cardHeight: number;
  // The dilemma stack's own popup only (#632): registers this card's own instance id as a drop
  // target too, alongside the draggable identity every card already has, so a drop that lands on
  // top of this card resolves to something (`handleDragEnd` in `page.tsx` then reads it as "move
  // this stack card next to that one" rather than a move out of the zone). Every other `CardListPanel`
  // zone leaves this card a plain, non-droppable `useDraggable`, unchanged.
  reorderable?: boolean;
  // A panel with a Flip button (#762) marks a face-down card with a "Face down" badge (#826).
  markFaceDown?: boolean;
  // The panel's card grid overflows (#788): let the browser pan it vertically under a touch.
  gridScrolls?: boolean;
  // #1071: draw the art crop at `cardHeight`, as the table card does, not the whole card.
  artCrop?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: panelDraggableId(instance.id) });
  const { setNodeRef: setDropRef } = useDroppable({ id: instance.id, disabled: !reorderable });
  const holdListeners = useCardHold(instance.id, listeners);
  const { card } = instance;
  const showFaceDownMark = markFaceDown && instance.face === 'down';

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
        className={`relative flex flex-col items-center gap-0.5 focus:outline-none ${
          gridScrolls ? 'touch-pan-y' : 'touch-none'
        } w-full rounded-md ${
          selected ? 'ring-2 ring-accent' : ''
        }`}
        style={{
          ...NO_CALLOUT_STYLE,
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        aria-label={cardDisplayName(card)}
      >
        {artCrop ? (
          // #1071: on a phone or a tablet the crew and away team panels show the art crop the
          // table card shows (`TableCard`): the top of the image in a box `cardHeight` tall,
          // cropped by `object-cover object-top`, never squashed.
          <div
            data-testid="panel-card-art"
            className="rounded-md shadow-md overflow-hidden"
            style={{ ...cardBorderStyle(cardWidth), width: cardWidth, height: cardHeight }}
          >
            <img
              src={`/cardimages/${card.imagefile}.jpg`}
              width={CARD_IMAGE_WIDTH}
              height={CARD_IMAGE_HEIGHT}
              alt={cardDisplayName(card)}
              className={`w-full h-full object-cover object-top ${instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
              style={NO_CALLOUT_STYLE}
            />
          </div>
        ) : (
          // The whole card image, frame and text included (#806), not the cropped art the table
          // card shows: the panel is where the player reads the card. The height comes from the
          // image's own ratio (`fullCardHeight`), so the image is never squashed.
          <img
            src={`/cardimages/${card.imagefile}.jpg`}
            width={CARD_IMAGE_WIDTH}
            height={CARD_IMAGE_HEIGHT}
            alt={cardDisplayName(card)}
            className={`rounded-md shadow-md h-auto ${instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
            style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(cardWidth), width: cardWidth, height: cardHeight }}
          />
        )}
        {/* Bottom left, clear of the select checkbox; it takes no tap, so the card still selects
            and drags. */}
        {showFaceDownMark && (
          <span
            data-testid="face-down-mark"
            className={`absolute bottom-1 left-1 pointer-events-none whitespace-nowrap ${FACE_DOWN_BADGE_CLASSNAME}`}
          >
            {FACE_DOWN_LABEL}
          </span>
        )}
      </button>
      {selected && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed
          aria-label={`Deselect ${cardDisplayName(card)}`}
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] leading-none focus:outline-none bg-accent border-accent text-white"
        >
          ✓
        </button>
      )}
    </div>
  );
}

// #986: the surface of the panel grid. #1016: the grid keeps its dark background of before
// #986, and a border in the raised shade marks its edge against the dimmed table behind it.
export const PANEL_SURFACE_CLASSNAME = 'bg-black/70 border border-bg-raised';

// The card the panel's cards belong to, in its own section to the right of the grid (#894): the ship whose crew
// the panel lists (#832), or the card the listed cards are placed on (#881). The whole card image
// at the size of a panel card, face up, on a framed box of its own so it does not read as one of
// the listed cards. No label above it (#916): the card speaks for itself. A hold shows its preview; a tap does nothing. No `useDraggable` and no
// `data-zone`: it is neither a drag source nor a drop target (the card's `TableCard` already holds
// a draggable under the same id).
//
// #957: the crew panel's ship section also shows the cards placed on the ship (`placedOn`), below
// the ship, as tiny table cards about a third of the ship's width. Only the crew panel: the `'on'`
// panel lists those same cards in its grid. A tiny card shows its preview on a hold or a hover,
// like every other card; a tap does nothing, and it is not selectable, so Discard and Stop do not
// act on it. It is a drag source (#963), under `panelDraggableId` like every panel card, so a drag
// out of here takes the card off the ship; it is not a drop target (no `data-zone`).
// #965: the row of the grid and the ship grows (`flex-1`) to fill the height of the panel. The
// panel's `max-h-full` caps it at the height it may use, so on a short screen the panel still ends
// above the bottom row, and the ship section scrolls.
const PLACED_ON_GAP = 4; // px, between the tiny cards
export const placedOnCardWidth = (cardWidth: number): number => Math.floor((cardWidth - 2 * PLACED_ON_GAP) / 3);
const placedOnArtHeight = (cardWidth: number): number => artCropHeight(placedOnCardWidth(cardWidth));

// #1014: the framed box of the crew panel's ship section is at least as tall as the ship and one
// row of the tiny cards placed on it, also with no card placed on the ship, so the box always has
// room for that row. It replaces the 1.5 card heights of #965. The sum is the box's padding
// (`pt-1 pb-2`), its border (1 px on each side), the gap between the ship and the row (`gap-1`),
// the ship, and one tiny card. A crew grid or more rows of placed cards that make the panel
// taller keep it taller.
const SHIP_SECTION_CHROME = 4 + 8 + 2 + 4; // px
export const crewShipSectionMinHeight = (cardWidth: number, cardHeight: number): number =>
  cardHeight + placedOnArtHeight(cardWidth) + SHIP_SECTION_CHROME;

function PanelHost({
  host,
  testId,
  cardWidth,
  cardHeight,
  showPlacedOn = false,
}: {
  host: CardInstance;
  testId: string;
  cardWidth: number;
  cardHeight: number;
  showPlacedOn?: boolean;
}) {
  const placedOn = showPlacedOn ? (host.placedOn ?? []) : [];
  const tinyWidth = placedOnCardWidth(cardWidth);
  const tinyArtHeight = placedOnArtHeight(cardWidth);
  const holdListeners = useCardHold(host.id);
  const { card } = host;
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const sectionScrolls = useScrollsVertically(sectionRef, true, [cardWidth, cardHeight, placedOn.length]);
  // #965: the section scrolls in an outer box that stretches to the height of the row, and the
  // framed box inside it hugs the ship and its placed cards. The row takes its height from the
  // taller of the grid and the framed box, so the section scrolls only when the panel reaches the
  // height of the screen. A `max-h-full` on the section clamped it to the grid's height in a
  // browser that resolves the percentage against the row.
  return (
    <div
      ref={sectionRef}
      data-testid={testId}
      className={`shrink-0 min-h-0 ${panelScrollClassName(sectionScrolls)} overscroll-contain`}
    >
      <div
        className="flex flex-col items-center gap-1 rounded-lg border border-accent/60 bg-white/[0.08] px-3 pt-1 pb-2"
        style={showPlacedOn ? { minHeight: crewShipSectionMinHeight(cardWidth, cardHeight) } : undefined}
      >
      {/* The section sits beside the grid (#894), so it takes no height from it: the image keeps
          the size of a panel card at every viewport. Where the row is shorter than the card (568 x
          320), the section scrolls, the same way the grid beside it does, rather than run over
          the bottom row. */}
      <div
        role="img"
        aria-label={cardDisplayName(card)}
        {...holdListeners}
        className="touch-pan-y flex justify-center"
        style={NO_CALLOUT_STYLE}
      >
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          width={CARD_IMAGE_WIDTH}
          height={CARD_IMAGE_HEIGHT}
          alt={cardDisplayName(card)}
          className={`rounded-md shadow-md ${host.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
          style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(cardWidth), width: cardWidth, height: cardHeight }}
        />
      </div>
      {placedOn.length > 0 && (
        <div
          data-testid={`${testId}-placed-on`}
          className="flex flex-wrap content-start"
          style={{ width: cardWidth, gap: PLACED_ON_GAP }}
        >
          {placedOn.map((c) => (
            <div key={c.id} data-testid={`card-list-panel-crew-on-${c.id}`}>
              <TableCard
                instance={c}
                width={tinyWidth}
                artHeight={tinyArtHeight}
                draggable
                draggableId={panelDraggableId(c.id)}
              />
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

export default function CardListPanel({
  location,
  cards,
  host,
  onClose,
  selectedIds,
  onToggleSelect,
  onSelectIds,
  onShuffle,
  onSetStopped,
  onFlip,
  onDiscard,
  onDownload,
  revealEnd = 'top',
  onReveal,
  canRevealTop = false,
  canRevealBottom = false,
  onSendToDeck,
  hidden = false,
  cardWidth = viewerCardSize(1).width,
  cardHeight = viewerCardSize(1).height,
  artCrop = false,
  bottomInset = VIEWER_TOP_INSET,
}: {
  location: PanelLocation;
  cards: CardInstance[];
  // The card `cards` belong to, shown in its own section to the right of the grid (#894): the ship of a crew panel
  // (#832), or the card the cards of an `'on'` panel are placed on (#881).
  host?: CardInstance;
  onClose: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  // Replaces the selection with a list of ids (#993), for the box a mouse drag draws. Left out,
  // no box starts.
  onSelectIds?: (ids: string[]) => void;
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
  // Moves each id into the pile's hand, in the panel's order, then shuffles the pile (#827).
  // Given only for the draw deck and the dilemma pile; `page.tsx` binds which pile and hand.
  // Its presence shows the "Download" button, disabled while nothing is selected.
  onDownload?: (ids: string[]) => void;
  // The reveal panel only (#1070, #1078): the end of the pile its cards come from, which sets the
  // title and the end labels of the row.
  revealEnd?: 'top' | 'bottom';
  // The reveal panel only (#1070, #1078): shows one more card from the top or the bottom of the
  // pile. Its presence shows the "Reveal top" and "Reveal bottom" buttons, even with no card in
  // the panel; `canRevealTop` and `canRevealBottom` say whether each one can reveal a card.
  onReveal?: (end: 'top' | 'bottom') => void;
  canRevealTop?: boolean;
  canRevealBottom?: boolean;
  // The reveal panel only (#1070): sends the selected cards, in the panel's order, to the top or
  // the bottom of the pile. Its presence shows the "Top" and "Bottom" buttons, disabled while
  // nothing is selected.
  onSendToDeck?: (ids: string[], position: 'top' | 'bottom') => void;
  hidden?: boolean;
  // Issue #717: this panel is one of "the modals" the issue names, so its own card grid grows
  // the same way the table's mission cards do — `page.tsx` computes both from the same `scale`
  // (`tableScale.ts`) and passes the result down here, at the viewer's 1.5x (`viewerCardSize`,
  // #802). `cardHeight` is the height of the whole card image at that width (#806), not the
  // height of the cropped art the table card shows; the ship of a crew panel always draws at it.
  // Defaults to that size at scale 1 for callers, including this component's own tests, that
  // don't care about the grown state.
  cardWidth?: number;
  cardHeight?: number;
  // #1071: a phone or a tablet (no fine pointer, `useFinePointer`). The grid cards of a crew panel
  // or an away team panel then show the art crop (`artCropHeight`) instead of the whole card, so
  // the panel shows more rows in the same height. Every other location keeps the whole card.
  artCrop?: boolean;
  // Issue #828: how far the panel's area stops above the bottom of the game layer. `page.tsx`
  // measures the bottom row and passes its height plus a small gap, so the panel's bottom sits
  // just above the bottom row. Defaults to `VIEWER_TOP_INSET`, the old symmetric inset, for
  // callers, including this component's own tests, that have no bottom row.
  bottomInset?: number;
}) {
  // The dilemma stack's own popup only (#632): a wrapped, multi-per-row grid — every other
  // `CardListPanel` zone's layout — has no single top or bottom once it wraps past one row, so this
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
  // (`reorderable` on `CardListPanelCard`), so a drop on top of a neighbour reorders the stack instead
  // of leaving the zone.
  // The reveal panel (#1070) uses the same ordered row: its cards are the top or the bottom of the
  // pile (#1078), in order, and a drop on a neighbour reorders the pile.
  const isRevealPanel = isRevealLocation(location);
  const isOrdered = location === 'dilemmaStack' || isRevealPanel;
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
  const cropGridCards = artCrop && (location === 'crew' || location === 'awayTeam');
  const gridCardHeight = cropGridCards ? artCropHeight(cardWidth) : cardHeight;
  const gridScrolls = useScrollsVertically(gridRef, !isOrdered, [cards.length, cardWidth, gridCardHeight]);
  // #993: a mouse drag from the empty space of the grid, or from the backdrop, draws a box that
  // selects the cards of the grid it touches (`useBoxSelect.tsx`).
  const boxSelect = useBoxSelect(gridRef, selectedIds, onSelectIds);
  const startBoxOnGrid = (event: React.PointerEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    boxSelect.onPointerDown(event);
  };
  // #802: the panel may use the full height of the game layer. `insetClassName` is a box inset
  // a little from each edge of this component's own `fixed inset-0` box (the same box as the game
  // layer), so the panel follows the layer's height without any `dvh` arithmetic. It lets taps
  // through (`pointer-events-none`) to the backdrop, and only the panel inside it takes them.
  // The side insets are `VIEWER_TOP_INSET`. The top inset is `PANEL_TOP_INSET` (#1068), which keeps
  // the controls row of a full panel out of the top band where iOS Safari takes a tap to show its
  // toolbar. The bottom inset is `bottomInset`, just above the bottom row (#828).
  // `justify-end` anchors the panel's bottom edge there, so a panel grows upward as it gains cards
  // and leaves no empty band above the bottom row.
  const insetClassName = 'absolute flex flex-col items-center justify-end pointer-events-none';
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
  // #986, #1016: the border of `PANEL_SURFACE_CLASSNAME` marks the grid's edge against the dimmed
  // table around it, so a tap outside the grid is easy to aim.
  const gridClassName = isOrdered
    ? `shrink-0 flex flex-col items-stretch gap-1 rounded-lg ${PANEL_SURFACE_CLASSNAME} p-2 w-[86vw] overflow-hidden`
    : `min-h-0 min-w-0 flex flex-wrap items-start justify-center gap-2 rounded-lg ${PANEL_SURFACE_CLASSNAME} p-2 ${panelScrollClassName(gridScrolls)} overscroll-contain`;
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
  // #995: a ship's crew panel and a mission's away team panel also get "Stop all", which stops
  // every personnel card of the panel, with or without a selection. It is disabled once every
  // personnel card there is already stopped.
  const showStopAllButton = onSetStopped !== undefined && (location === 'crew' || location === 'awayTeam');
  const unstoppedPersonnel = cards.filter((instance) => instance.card.type === 'personnel' && !instance.stopped);
  const handleStopAllTap = () => onSetStopped?.(unstoppedPersonnel.map((instance) => instance.id), true);
  const selectedInPanel = cards.filter((instance) => selectedIds.includes(instance.id));
  const showFlipButton = onFlip !== undefined && selectedInPanel.length > 0;
  const handleFlipTap = () => onFlip?.(selectedInPanel.map((instance) => instance.id));
  const markFaceDown = onFlip !== undefined && location !== 'awayTeam';
  const showDiscardButton = onDiscard !== undefined;
  const handleDiscardTap = () => onDiscard?.(selectedInPanel.map((instance) => instance.id));
  const showDownloadButton = onDownload !== undefined;
  const handleDownloadTap = () => onDownload?.(selectedInPanel.map((instance) => instance.id));
  const showSendButtons = onSendToDeck !== undefined;
  const handleSendTap = (position: 'top' | 'bottom') =>
    onSendToDeck?.(
      selectedInPanel.map((instance) => instance.id),
      position
    );
  const deckName = PANEL_LABEL[location].replace(/^Top of the /, '');

  // Issue #861: the grid is a selector for the tests and for the scripts, not a drop target. It
  // has no `useDroppable`, and no drag aims at it: the open panel covers the table, and a reorder
  // inside the panel aims at another card's own droppable. So the name goes in `data-testid`. A
  // `data-zone` here would make `practice_drag.sh` print `card-list-panel-<location>` for a card
  // that never moved (see #860).
  const gridElement = (
    <div
      ref={gridRef}
      data-testid={`card-list-panel-${location}`}
      {...{ [PANEL_SCROLLS_ATTRIBUTE]: gridScrolls ? 'true' : undefined }}
      className={gridClassName}
      onPointerDown={startBoxOnGrid}
    >
      {isOrdered && (
        // The reveal panel's cards are only one end of the pile (#1070, #1078), so the label at
        // its other end is not an end of the pile.
        <div className="flex flex-row justify-between">
          <span className={stackEndLabelClassName}>
            {isRevealPanel ? (revealEnd === 'bottom' ? 'Drawn earlier' : 'Top (drawn first)') : 'Top (revealed first)'}
          </span>
          <span className={stackEndLabelClassName}>
            {isRevealPanel ? (revealEnd === 'bottom' ? 'Bottom (drawn last)' : 'Drawn later') : 'Bottom (revealed last)'}
          </span>
        </div>
      )}
      {isRevealPanel && cards.length === 0 && (
        <p data-testid="reveal-panel-empty" className="text-xs text-text-muted text-center py-2">
          No card revealed yet.
        </p>
      )}
      {isOrdered ? (
        // The cards overlap rather than sit side by side (`OverlapRow`), with `zIndex` rising
        // left to right, so a later (further down the stack) card's edge sits on top of the
        // one before it, the same reading order the labels at each end describe.
        <DilemmaStackRow
          cards={cards}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          markFaceDown={markFaceDown}
        />
      ) : (
        cards.map((instance) => (
          <CardListPanelCard
            key={instance.id}
            instance={instance}
            selected={selectedIds.includes(instance.id)}
            onToggleSelect={() => onToggleSelect(instance.id)}
            cardWidth={cardWidth}
            cardHeight={gridCardHeight}
            artCrop={cropGridCards}
            markFaceDown={markFaceDown}
            gridScrolls={gridScrolls}
          />
        ))
      )}
    </div>
  );

  return (
    <div
      className={`fixed inset-0 ${LAYER_CARD_LIST_PANEL}`}
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        onPointerDown={boxSelect.onPointerDown}
        aria-label={closeLabel(location, revealEnd)}
      />
      <div className={insetClassName} style={{
          top: PANEL_TOP_INSET,
          left: VIEWER_TOP_INSET,
          right: VIEWER_TOP_INSET,
          bottom: bottomInset,
        }}
      >
      <div className={layoutClassName}>
        {(onReveal || showSendButtons || showDownloadButton || showStopButton || showStopAllButton || showFlipButton || showDiscardButton || onShuffle) && (
          <div data-testid="panel-controls" className="shrink-0 flex flex-row flex-wrap justify-center items-start gap-2">
            {/* The reveal panel's own controls (#1070, #1078). Both reveal buttons show even with no
                card in the panel, so an empty panel always has a way to reveal. */}
            {onReveal && (
              <>
                <button
                  type="button"
                  onClick={() => onReveal('top')}
                  disabled={!canRevealTop}
                  className="btn-primary shrink-0 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RevealIcon className="w-3 h-3" />
                  Reveal top
                </button>
                <button
                  type="button"
                  onClick={() => onReveal('bottom')}
                  disabled={!canRevealBottom}
                  className="btn-primary shrink-0 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RevealIcon className="w-3 h-3" />
                  Reveal bottom
                </button>
              </>
            )}
            {showSendButtons && (
              <>
                <button
                  type="button"
                  onClick={() => handleSendTap('top')}
                  disabled={selectedInPanel.length === 0}
                  aria-label={`Selected cards to the top of the ${deckName.toLowerCase()}`}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => handleSendTap('bottom')}
                  disabled={selectedInPanel.length === 0}
                  aria-label={`Selected cards to the bottom of the ${deckName.toLowerCase()}`}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Bottom
                </button>
              </>
            )}
            {/* The Download button (#827) shows whenever the panel is given `onDownload`, first in
                the row, and stays disabled until a card is selected. The Discard button does the same (#902). */}
            {showDownloadButton && (
              <button
                type="button"
                onClick={handleDownloadTap}
                disabled={selectedInPanel.length === 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download
              </button>
            )}
            {showStopButton && (
              <button type="button" onClick={handleStopTap} className="btn-primary">
                {allSelectedStopped ? 'Unstop' : 'Stop'}
              </button>
            )}
            {showStopAllButton && (
              <button
                type="button"
                onClick={handleStopAllTap}
                disabled={unstoppedPersonnel.length === 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Stop all
              </button>
            )}
            {showFlipButton && (
              <button type="button" onClick={handleFlipTap} className="btn-primary">
                Flip
              </button>
            )}
            {showDiscardButton && (
              <button
                type="button"
                onClick={handleDiscardTap}
                disabled={selectedInPanel.length === 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard
              </button>
            )}
            {/* The Shuffle button (#680) sits inside the panel, next to the cards, not on the
                backdrop — a tap on the backdrop still closes the panel, and a tap here does not.
                It shares this row with the other controls (#880), so the row takes the height of
                one line from the card grid. It has the `btn-primary` look of Stop (#966), and is
                never disabled: it acts on the whole pile, not on the selection. */}
            {onShuffle && (
              <button
                type="button"
                onClick={onShuffle}
                className="btn-primary shrink-0 flex items-center justify-center gap-1"
              >
                <ShuffleIcon />
                Shuffle
              </button>
            )}
          </div>
        )}
        {/* #894: a panel with a host puts the grid and the host side by side in one row. The row
            is the child of the panel that shrinks (`min-h-0`), and the grid stretches to its
            height and scrolls, so the host beside it keeps its own size. `min-w-0` lets the grid
            wrap its cards into the width the host leaves it. */}
        {host ? (
          <div className={`min-h-0 max-w-full flex flex-row gap-2 ${location === 'crew' ? 'flex-1' : ''}`}>
            {gridElement}
            <PanelHost
              host={host}
              testId={location === 'crew' ? 'card-list-panel-crew-ship' : `card-list-panel-${location}-host`}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              showPlacedOn={location === 'crew'}
            />
          </div>
        ) : (
          gridElement
        )}
      </div>
      </div>
      <BoxSelectRect box={boxSelect.box} />
    </div>
  );
}

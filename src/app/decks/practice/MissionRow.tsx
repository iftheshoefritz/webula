'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for its controls, so the column layout
// does not shift as a mission's piles fill up:
//   - A badge strip below the mission card: personnel/event pile badges (#602), dilemma stack
//     badge (#605), moved there from above the mission card by #641 to make room for the
//     dilemmas placed under the mission (below), which now poke out above the mission card
//     instead.
//   - Dilemmas placed under the mission (#606) render face up, stacked behind the mission card
//     in z-order, with a small sliver of each poking out above the mission card's top edge
//     (#641). They are absolutely positioned, so an empty pile reserves no space at all.
//
// The mission card and its ship row (#599) are both drop targets: dropping a ship on either one
// puts it in that mission's ship row, face up. A ship row shows up to 2 ships side by side; a
// third or later ship overlaps the others rather than growing the row, reusing the same
// overlap-offset calculation as the hand (`overlapOffset.ts`, originally #596).
//
// Each ship already sitting in a ship row is itself a drop target too (#600): a personnel or
// equipment card dropped on it goes aboard as crew, leaving the table (see `ShipCard` below).
// The ship stays draggable at the same time; a `useDroppable` wrapper around the already
// draggable `TableCard`, the same nesting pattern used for the mission card's own drop target,
// keeps the two roles apart as two different DOM nodes. A non-empty crew shows a badge in that
// wrapper: the same `PersonnelIcon`-and-count pill a mission's personnel pile shows (`PileBadge`
// below), not the plain `CountBadge` circle the draw and discard piles use. A tap anywhere on the
// ship (`onShipClick`, #678) opens both the ship's own preview and, if it has crew, every crew
// card in a panel (`PilePanel`, zone `'crew'`, wired up in `page.tsx`) — the two open and close
// together, so the badge itself is no longer a tap target of its own (it was, in #664): it is now
// a plain, non-interactive `<span>` with `pointer-events-none`, so a tap that lands on it falls
// through to the ship's own `TableCard` button beneath.
//
// A row of 2 or fewer ships fits every ship side by side within the mission column's own width
// with no overlap (see `ShipRow`'s `shipMaxOffset` below); a third ship (or later) overlaps the
// earlier ones almost completely, since the row's width stays bounded and `offsetFor` shrinks the
// per-card offset as the count grows past what fits without overlap (#713). Once a row is in that
// overlapping
// state, every ship's tap opens a panel listing every ship on that row individually instead
// (`PilePanel`, zone `'shipRow'`, the same list-view pattern the core, the brig, and a ship's
// crew already use) rather than going straight to `onShipClick` — the ship underneath an
// overlapping one is otherwise unreachable for both a tap and a drag. A tap on a ship inside that
// panel opens only that ship's own preview, the same as a tap inside the core/brig/crew panels —
// not its crew panel too — and the row panel itself stays open underneath, unlike `onShipClick`.
//
// Dropping a personnel, equipment, event, mission, or interrupt card on the mission card or its
// ship row (#602) files it into one of that mission's piles, chosen by card type: personnel and
// equipment go to the personnel pile face down; event, mission, and interrupt go to the event
// pile face up. A dilemma dropped there from the open dilemma hand instead builds a face-down
// stack in a third pile (#605), in drop order — the first dilemma dropped is the first revealed.
// A dilemma dropped on a mission from anywhere else — including that mission's own dilemma
// stack — goes under the mission instead (#606), face up, permanently out of the stack. Each
// non-empty personnel/event/dilemma pile shows a small badge on the badge strip, below (and as a
// sibling of, not nested inside) the mission card's own `<button>` — nesting a badge button
// inside it would be invalid HTML and would let the mission's own tap handler fire first, the
// same conflict already avoided for the ship's own drop target. A badge is a drop target of its
// own: dropping a card of any type directly on a badge overrides the type-based routing above and
// puts it in that pile regardless. A badge sits geometrically on top of the mission card's larger
// drop target, so `collisionDetection` (`page.tsx`), which ranks every zone the dragged card
// overlaps by area, smallest first, already picks the smaller, nested badge over the mission
// card beneath it, the same reasoning that lets a ship's crew zone win over its enclosing ship
// row (#645). A tap on a badge opens that pile's panel
// (`PilePanel`); a tap on the mission card elsewhere still opens the mission's own preview. The
// under-the-mission pile has no badge of its own — its control is the tap target layered over its
// stack of slivers (`UnderMissionStack` below), not a drop target, since the drop happens on the
// mission card's own drop target like every other pile that has no badge under the pointer.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionPileName, MissionSlot } from './tableReducer';
import TableCard, { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';

// Issue #717: every pixel size below is tuned against a scale of 1, the 568x320 viewport
// `BADGE_STRIP_HEIGHT_BASE`'s comment describes. `page.tsx` passes down a `scale`, computed by
// `useTableScale` (`tableScale.ts`) from the live size of the game layer, that grows past 1 once
// there's more room than that — e.g. once scrolling up hides the browser's own toolbar. `scaled`
// rounds every derived pixel value the same way, so two elements whose base sizes matched still
// match once scaled.
const scaled = (px: number, scale: number): number => Math.round(px * scale);

// A ship row card is smaller than a mission's table card, so 2 ships fit side by side within
// the same TABLE_CARD_WIDTH column the mission card above them occupies. Exported at their base
// (scale-1) size: the ship preview's crew row (#600) sizes its own crew cards to match, and the
// core's/the brig's own row (`FlatCardRow.tsx`) sizes its cards to match too — that row, unlike
// the mission's own ship row, does not grow with `scale` (#717).
export const SHIP_CARD_WIDTH = 34; // px
export const SHIP_CARD_ART_HEIGHT = 32; // px, scaled down from TABLE_CARD_ART_HEIGHT to match
const SHIP_MAX_OFFSET_BASE = SHIP_CARD_WIDTH + 2; // 2 ships sit edge to edge with a small gap

export const missionDropId = (missionIndex: number): string => `mission-${missionIndex}`;
export const shipRowDropId = (missionIndex: number): string => `ship-row-${missionIndex}`;
export const crewDropId = (shipId: string): string => `crew-${shipId}`;

// A mission pile's badge is its own drop target (#602), distinct from `missionDropId` so a drop
// on the badge itself can bypass the card-type routing and always target that specific pile.
export const missionPileDropId = (missionIndex: number, pile: MissionPileName): string =>
  `mission-pile-${pile}-${missionIndex}`;

export function missionPileFromDropId(id: string): { missionIndex: number; pile: MissionPileName } | null {
  const match = /^mission-pile-(personnel|event|dilemma)-(\d+)$/.exec(id);
  return match ? { pile: match[1] as MissionPileName, missionIndex: Number(match[2]) } : null;
}

// Both a drop on the mission card and a drop on its ship row resolve to the same mission index
// (#599's plan); this parses either droppable id back to that index.
export function missionIndexFromDropId(id: string): number | null {
  const match = /^(?:mission|ship-row)-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

// Parses a ship's own crew droppable id back to that ship's instance id (#600's plan).
export function shipIdFromCrewDropId(id: string): string | null {
  const match = /^crew-(.+)$/.exec(id);
  return match ? match[1] : null;
}

function ShipCard({
  ship,
  onShipClick,
  width,
  artHeight,
  badgeHeight,
}: {
  ship: CardInstance;
  onShipClick: (id: string) => void;
  width: number;
  artHeight: number;
  badgeHeight: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: crewDropId(ship.id) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('crew', draggedType, isOver);
  const crewCount = ship.crew?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-zone={crewDropId(ship.id)}
      data-highlight={highlight}
      className={`relative rounded ${highlightClassName(highlight)}`}
    >
      <TableCard instance={ship} onClick={() => onShipClick(ship.id)} width={width} artHeight={artHeight} draggable />
      <ShipCrewBadge shipName={ship.card.name} count={crewCount} height={badgeHeight} />
    </div>
  );
}

// The badge strip's fixed (scale-1) height (#602): tall enough to fit an icon+count badge,
// reserved on every mission column regardless of how many badges that mission actually shows, so
// a mission with 0, 1, or 2 badges keeps the same column layout as its neighbours. Two badges sit
// side by side within a scale-1 TABLE_CARD_WIDTH; at 568x320 (the acceptance check's viewport,
// scale 1) they still leave the mission's own title, below the art, fully visible. Grows with
// `scale` (#717) along with the mission column's other chrome.
const BADGE_STRIP_HEIGHT_BASE = 14; // px

// Small inline icons (not react-icons) so the three badges are visually distinct at this size.
function PersonnelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
    </svg>
  );
}

function EventIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 11-14h-7z" />
    </svg>
  );
}

// A stack of face-down cards, for the dilemma stack badge (#605).
function DilemmaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <rect x="3" y="9" width="14" height="10" rx="1.5" />
      <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h12A1.5 1.5 0 0 1 22 5.5v10a1.5 1.5 0 0 1-1.5 1.5H19V7.5A1.5 1.5 0 0 0 17.5 6H7z" />
    </svg>
  );
}

// Stacked bars, for the under-the-mission pile. Unused by `BadgeStrip` — that pile's control is
// the sliver stack behind the mission card, not a top badge — but required to satisfy
// `PILE_ICON`'s `Record<MissionPileName, ...>` type (#606).
function UnderMissionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2 h-2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  );
}

const PILE_ICON: Record<MissionPileName, () => JSX.Element> = {
  personnel: PersonnelIcon,
  event: EventIcon,
  dilemma: DilemmaIcon,
  underMission: UnderMissionIcon,
};

const PILE_LABEL: Record<MissionPileName, string> = {
  personnel: 'Personnel',
  event: 'Event',
  dilemma: 'Dilemma',
  underMission: 'Under the mission',
};

// A mission pile's badge (#602): shown only when the pile is non-empty, it is a drop target of
// its own (dropping any card type directly on it puts the card in that pile, overriding the
// type-based routing on the mission card itself) and a tap opens that pile's panel.
function PileBadge({
  missionIndex,
  pile,
  count,
  onOpen,
  height,
}: {
  missionIndex: number;
  pile: MissionPileName;
  count: number;
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
  height: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: missionPileDropId(missionIndex, pile) });
  if (count === 0) return null;
  const Icon = PILE_ICON[pile];

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-zone={missionPileDropId(missionIndex, pile)}
      onClick={() => onOpen(missionIndex, pile)}
      aria-label={`${PILE_LABEL[pile]} pile, ${count} card${count === 1 ? '' : 's'}, tap to open`}
      className={`flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none ${
        isOver ? 'ring-2 ring-accent' : ''
      }`}
      style={{ height: height - 2 }}
    >
      <Icon />
      <span className="text-[8px] font-bold">{count}</span>
    </button>
  );
}

// A ship's crew badge: the same `PersonnelIcon`-and-count pill style `PileBadge` uses for a
// mission's personnel pile, so the same kind of thing — personnel in a pile — always gets the
// same badge. It sits as a sibling of the ship's own `TableCard` button, inside `ShipCard`'s
// `crewDropId` wrapper, since a `<button>` cannot nest inside another `<button>` (the ship's own
// tap-to-preview button) — the same reasoning `PileBadge` documents above for the mission's own
// badges. Since #678, a tap on the ship opens both its own preview and its crew panel together
// (`onShipClick`), so the badge itself is purely informational: a non-interactive `<span>` with
// `pointer-events-none`, so a tap that lands on it falls through to the ship's `TableCard` button
// underneath rather than being swallowed here.
function ShipCrewBadge({ shipName, count, height }: { shipName: string; count: number; height: number }) {
  if (count === 0) return null;

  return (
    <span
      aria-label={`${shipName} crew, ${count} card${count === 1 ? '' : 's'}`}
      className="absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none"
      style={{ height: height - 2 }}
    >
      <PersonnelIcon />
      <span className="text-[8px] font-bold">{count}</span>
    </span>
  );
}

function BadgeStrip({
  missionIndex,
  personnelCount,
  eventCount,
  dilemmaCount,
  onOpenPile,
  height,
}: {
  missionIndex: number;
  personnelCount: number;
  eventCount: number;
  dilemmaCount: number;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  height: number;
}) {
  return (
    <div className="w-full flex items-center justify-center gap-1" style={{ height }}>
      <PileBadge missionIndex={missionIndex} pile="personnel" count={personnelCount} onOpen={onOpenPile} height={height} />
      <PileBadge missionIndex={missionIndex} pile="event" count={eventCount} onOpen={onOpenPile} height={height} />
      <PileBadge missionIndex={missionIndex} pile="dilemma" count={dilemmaCount} onOpen={onOpenPile} height={height} />
    </div>
  );
}

// The dilemma sliver stack's total (scale-1) height budget (#641): the space the badge strip
// freed up by moving below the mission card, so poking the slivers out above it does not grow
// the column's total height relative to before. Grows with `scale` (#717) along with the badge
// strip it matches.
const UNDER_MISSION_STACK_HEIGHT_BASE = BADGE_STRIP_HEIGHT_BASE; // px
// A pile can grow arbitrarily large; this caps how many cards actually render in the stack (the
// old strip capped visible edges the same way), while the tap target's aria-label keeps the true
// count.
const UNDER_MISSION_MAX_VISIBLE = 6;
// The vertical gap between stacked slivers, shrinking as more cards share the fixed height
// budget above — the same idea `overlapOffset.ts` already applies horizontally to the ship row.
const UNDER_MISSION_MAX_OFFSET_BASE = 4; // px
const UNDER_MISSION_MIN_SLIVER_BASE = 2; // px, the smallest sliver a single card pokes out

// The dilemmas placed under the mission (#606), rendered face up and stacked directly behind the
// mission card in z-order, each poking a small sliver out above the mission card's top edge
// (#641) rather than as a strip of plain edges below it. Absolutely positioned within the
// mission's own relatively positioned drop target (`MissionColumn` below), so an empty pile
// renders nothing and reserves no space — no dashed placeholder box. A single tap target, sized
// to the sliver band, opens that pile's panel (`PilePanel`), the same callback `PileBadge`
// already uses; it is not a drop target of its own — the drop happens on the mission card's own
// drop target (`missionDropId`). The individual card images underneath have no click handling of
// their own (`pointer-events-none`) so only the tap target responds, and the sliver band sits
// entirely above the mission card's own drop target, so the two never overlap.
function UnderMissionStack({
  missionIndex,
  cards,
  onOpen,
  cardWidth,
  cardArtHeight,
  scale,
}: {
  missionIndex: number;
  cards: CardInstance[];
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
  cardWidth: number;
  cardArtHeight: number;
  scale: number;
}) {
  if (cards.length === 0) return null;
  const stackHeightBudget = scaled(UNDER_MISSION_STACK_HEIGHT_BASE, scale);
  const maxOffset = scaled(UNDER_MISSION_MAX_OFFSET_BASE, scale);
  const minSliver = scaled(UNDER_MISSION_MIN_SLIVER_BASE, scale);
  const shown = cards.slice(-UNDER_MISSION_MAX_VISIBLE);
  const offset = offsetFor(shown.length, minSliver, stackHeightBudget, maxOffset);
  const stackHeight = minSliver + offset * (shown.length - 1);

  return (
    <div className="absolute inset-x-0" style={{ top: -stackHeight, height: stackHeight }}>
      {shown.map((card, i) => (
        <div
          key={card.id}
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
          style={{ top: i * offset, zIndex: i + 1 }}
        >
          <TableCard instance={card} onClick={() => {}} width={cardWidth} artHeight={cardArtHeight} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onOpen(missionIndex, 'underMission')}
        aria-label={`${PILE_LABEL.underMission} pile, ${cards.length} card${
          cards.length === 1 ? '' : 's'
        }, tap to open`}
        className="absolute inset-0"
        style={{ zIndex: shown.length + 1 }}
      >
        <span className="absolute bottom-0 right-1 text-[8px] font-bold leading-none text-text-primary">
          {cards.length}
        </span>
      </button>
    </div>
  );
}

function ShipRow({
  missionIndex,
  ships,
  onShipClick,
  onOpenShipRow,
  columnWidth,
  scale,
}: {
  missionIndex: number;
  ships: CardInstance[];
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  columnWidth: number;
  scale: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shipRowDropId(missionIndex) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('shipRow', draggedType, isOver);
  const shipCardWidth = scaled(SHIP_CARD_WIDTH, scale);
  const shipCardArtHeight = scaled(SHIP_CARD_ART_HEIGHT, scale);
  const shipRowHeight = shipCardArtHeight; // no title line below the art (#634)
  const shipMaxOffset = scaled(SHIP_MAX_OFFSET_BASE, scale);
  const shipRowMaxWidth = columnWidth; // bounds the row to the column's own (scaled) width
  const offset = offsetFor(ships.length, shipCardWidth, shipRowMaxWidth, shipMaxOffset);
  const rowWidth = ships.length === 0 ? shipRowMaxWidth : shipCardWidth + offset * (ships.length - 1);
  // True once the row holds more ships than fit without overlap (#713): the same condition
  // `offset` already encodes for layout — 2 ships fit at `shipMaxOffset` with a gap and no
  // overlap, 3 or more shrink the offset below that. `ships.length > 1` excludes the trivial
  // single-ship row, where `offsetFor` returns 0 (unused) with nothing behind it to overlap.
  const overlapping = ships.length > 1 && offset < shipMaxOffset;
  const handleShipTap = overlapping ? () => onOpenShipRow(missionIndex) : onShipClick;
  const badgeHeight = scaled(BADGE_STRIP_HEIGHT_BASE, scale);

  return (
    <div
      ref={setNodeRef}
      data-zone={shipRowDropId(missionIndex)}
      data-highlight={highlight}
      className={`relative w-full flex items-center justify-center rounded ${highlightClassName(highlight)}`}
      style={{ height: shipRowHeight }}
    >
      {ships.length === 0 ? (
        <div className="w-full h-full rounded border border-dashed border-white/15" />
      ) : (
        <div className="relative" style={{ width: rowWidth, height: shipRowHeight }}>
          {ships.map((ship, idx) => (
            <div key={ship.id} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
              <ShipCard
                ship={ship}
                onShipClick={handleShipTap}
                width={shipCardWidth}
                artHeight={shipCardArtHeight}
                badgeHeight={badgeHeight}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissionColumn({
  missionIndex,
  slot,
  onCardClick,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  scale,
}: {
  missionIndex: number;
  slot: MissionSlot;
  onCardClick: (id: string) => void;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  scale: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: missionDropId(missionIndex) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('mission', draggedType, isOver);
  const { mission, ships, personnel, event, dilemma, underMission } = slot;
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardArtHeight = scaled(TABLE_CARD_ART_HEIGHT, scale);
  const badgeHeight = scaled(BADGE_STRIP_HEIGHT_BASE, scale);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: cardWidth }}>
      <div
        ref={setNodeRef}
        data-zone={missionDropId(missionIndex)}
        data-highlight={highlight}
        className={`relative w-full flex items-center justify-center rounded ${highlightClassName(highlight)}`}
      >
        {/* Dilemmas under the mission (#606), stacked behind it and poking out above (#641) */}
        <UnderMissionStack
          missionIndex={missionIndex}
          cards={underMission}
          onOpen={onOpenPile}
          cardWidth={cardWidth}
          cardArtHeight={cardArtHeight}
          scale={scale}
        />

        <div className="relative z-10 w-full flex items-center justify-center">
          {mission ? (
            <TableCard instance={mission} onClick={() => onCardClick(mission.id)} width={cardWidth} artHeight={cardArtHeight} />
          ) : (
            <div
              className="w-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[9px]"
              style={{ height: cardArtHeight }}
            >
              Mission
            </div>
          )}
        </div>
      </div>

      {/* Badge strip: personnel/event pile badges (#602), dilemma stack badge (#605). */}
      <BadgeStrip
        missionIndex={missionIndex}
        personnelCount={personnel.length}
        eventCount={event.length}
        dilemmaCount={dilemma.length}
        onOpenPile={onOpenPile}
        height={badgeHeight}
      />

      <ShipRow
        missionIndex={missionIndex}
        ships={ships}
        onShipClick={onShipClick}
        onOpenShipRow={onOpenShipRow}
        columnWidth={cardWidth}
        scale={scale}
      />
    </div>
  );
}

export default function MissionRow({
  missions,
  onCardClick,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  scale = 1,
}: {
  missions: MissionSlot[];
  onCardClick: (id: string) => void;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  // Issue #717: grows the mission cards, the ship cards, and the under-mission pile stack past
  // their base pixel size, computed by `useTableScale` (`tableScale.ts`) from the live size of
  // the game layer. Defaults to 1 (today's fixed sizes) for callers — including this
  // component's own tests — that don't care about the grown state.
  scale?: number;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center">
      {missions.map((slot, idx) => (
        <MissionColumn
          key={idx}
          missionIndex={idx}
          scale={scale}
          slot={slot}
          onCardClick={onCardClick}
          onOpenPile={onOpenPile}
          onShipClick={onShipClick}
          onOpenShipRow={onOpenShipRow}
        />
      ))}
    </div>
  );
}

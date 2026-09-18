'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for parts later slices fill in, all shown
// for now only as empty, non-interactive outlines so the column layout does not shift once they
// gain real content:
//   - A badge strip along the top edge: personnel/event pile badges (#602), dilemma stack badge
//     (#605).
//   - A card-edge strip below the bottom edge (dilemmas placed under the mission, #606).
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
// keeps the two roles apart as two different DOM nodes.
//
// Dropping a personnel, equipment, event, mission, or interrupt card on the mission card or its
// ship row (#602) files it into one of that mission's two piles, chosen by card type: personnel
// and equipment go to the personnel pile face down; event, mission, and interrupt go to the
// event pile face up. Each non-empty pile shows a small badge on the badge strip, above (and as
// a sibling of, not nested inside) the mission card's own `<button>` — nesting a badge button
// inside it would be invalid HTML and would let the mission's own tap handler fire first, the
// same conflict already avoided for the ship's own drop target. A badge is a drop target of its
// own: dropping a card of any type directly on a badge overrides the type-based routing above
// and puts it in that pile regardless. A badge sits geometrically on top of the mission card's
// larger drop target, so `pointerWithin` collision detection (`page.tsx`) already picks the
// smaller, nested badge over the mission card beneath it, the same reasoning that already lets a
// ship's crew zone win over its enclosing ship row. A tap on a badge opens that pile's panel
// (`PilePanel`); a tap on the mission card elsewhere still opens the mission's own preview.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionPileName, MissionSlot } from './tableReducer';
import TableCard, { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';
import { offsetFor } from './overlapOffset';

const MISSION_SLOT_HEIGHT = TABLE_CARD_ART_HEIGHT + 14; // art + the title line below it

// A ship row card is smaller than a mission's table card, so 2 ships fit side by side within
// the same TABLE_CARD_WIDTH column the mission card above them occupies. Exported so the ship
// preview's crew row (#600) can size its own crew cards to match.
export const SHIP_CARD_WIDTH = 34; // px
export const SHIP_CARD_ART_HEIGHT = 26; // px, scaled down from TABLE_CARD_ART_HEIGHT to match
const SHIP_ROW_HEIGHT = SHIP_CARD_ART_HEIGHT + 12; // art + the title line below it
const SHIP_MAX_OFFSET = SHIP_CARD_WIDTH + 2; // 2 ships sit edge to edge with a small gap
const SHIP_ROW_MAX_WIDTH = TABLE_CARD_WIDTH; // bounds the row to the column's width

export const missionDropId = (missionIndex: number): string => `mission-${missionIndex}`;
export const shipRowDropId = (missionIndex: number): string => `ship-row-${missionIndex}`;
export const crewDropId = (shipId: string): string => `crew-${shipId}`;

// A mission pile's badge is its own drop target (#602), distinct from `missionDropId` so a drop
// on the badge itself can bypass the card-type routing and always target that specific pile.
export const missionPileDropId = (missionIndex: number, pile: MissionPileName): string =>
  `mission-pile-${pile}-${missionIndex}`;

export function missionPileFromDropId(id: string): { missionIndex: number; pile: MissionPileName } | null {
  const match = /^mission-pile-(personnel|event)-(\d+)$/.exec(id);
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
  onCardClick,
}: {
  ship: CardInstance;
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: crewDropId(ship.id) });

  return (
    <div ref={setNodeRef} data-zone={crewDropId(ship.id)} className={`rounded ${isOver ? 'ring-2 ring-accent' : ''}`}>
      <TableCard
        instance={ship}
        onClick={() => onCardClick(ship.id)}
        width={SHIP_CARD_WIDTH}
        artHeight={SHIP_CARD_ART_HEIGHT}
        draggable
        badge={ship.crew?.length}
      />
    </div>
  );
}

function ReservedStrip({ height }: { height: number }) {
  return <div className="w-full rounded border border-dashed border-white/15" style={{ height }} />;
}

// The badge strip's fixed height (#602): tall enough to fit an icon+count badge, reserved on
// every mission column regardless of how many badges that mission actually shows, so a mission
// with 0, 1, or 2 badges keeps the same column layout as its neighbours. Two badges sit side by
// side within TABLE_CARD_WIDTH; at 568x320 (the acceptance check's viewport) they still leave
// the mission's own title, below the art, fully visible.
const BADGE_STRIP_HEIGHT = 14; // px

// Small inline icons (not react-icons) so the two badges are visually distinct at this size.
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

const PILE_LABEL: Record<MissionPileName, string> = { personnel: 'Personnel', event: 'Event' };

// A mission pile's badge (#602): shown only when the pile is non-empty, it is a drop target of
// its own (dropping any card type directly on it puts the card in that pile, overriding the
// type-based routing on the mission card itself) and a tap opens that pile's panel.
function PileBadge({
  missionIndex,
  pile,
  count,
  onOpen,
}: {
  missionIndex: number;
  pile: MissionPileName;
  count: number;
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: missionPileDropId(missionIndex, pile) });
  if (count === 0) return null;

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
      style={{ height: BADGE_STRIP_HEIGHT - 2 }}
    >
      {pile === 'personnel' ? <PersonnelIcon /> : <EventIcon />}
      <span className="text-[8px] font-bold">{count}</span>
    </button>
  );
}

function BadgeStrip({
  missionIndex,
  personnelCount,
  eventCount,
  onOpenPile,
}: {
  missionIndex: number;
  personnelCount: number;
  eventCount: number;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
}) {
  return (
    <div className="w-full flex items-center justify-center gap-1" style={{ height: BADGE_STRIP_HEIGHT }}>
      <PileBadge missionIndex={missionIndex} pile="personnel" count={personnelCount} onOpen={onOpenPile} />
      <PileBadge missionIndex={missionIndex} pile="event" count={eventCount} onOpen={onOpenPile} />
    </div>
  );
}

function ShipRow({
  missionIndex,
  ships,
  onCardClick,
}: {
  missionIndex: number;
  ships: CardInstance[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shipRowDropId(missionIndex) });
  const offset = offsetFor(ships.length, SHIP_CARD_WIDTH, SHIP_ROW_MAX_WIDTH, SHIP_MAX_OFFSET);
  const rowWidth = ships.length === 0 ? SHIP_ROW_MAX_WIDTH : SHIP_CARD_WIDTH + offset * (ships.length - 1);

  return (
    <div
      ref={setNodeRef}
      data-zone={shipRowDropId(missionIndex)}
      className={`relative w-full flex items-center justify-center rounded ${isOver ? 'ring-2 ring-accent' : ''}`}
      style={{ height: SHIP_ROW_HEIGHT }}
    >
      {ships.length === 0 ? (
        <div className="w-full h-full rounded border border-dashed border-white/15" />
      ) : (
        <div className="relative" style={{ width: rowWidth, height: SHIP_ROW_HEIGHT }}>
          {ships.map((ship, idx) => (
            <div key={ship.id} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
              <ShipCard ship={ship} onCardClick={onCardClick} />
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
}: {
  missionIndex: number;
  slot: MissionSlot;
  onCardClick: (id: string) => void;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: missionDropId(missionIndex) });
  const { mission, ships, personnel, event } = slot;

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: TABLE_CARD_WIDTH }}>
      {/* Badge strip: personnel/event pile badges (#602). Dilemma stack badge (#605) still to come. */}
      <BadgeStrip
        missionIndex={missionIndex}
        personnelCount={personnel.length}
        eventCount={event.length}
        onOpenPile={onOpenPile}
      />

      <div
        ref={setNodeRef}
        data-zone={missionDropId(missionIndex)}
        className={`w-full flex items-center justify-center rounded ${isOver ? 'ring-2 ring-accent' : ''}`}
      >
        {mission ? (
          <TableCard instance={mission} onClick={() => onCardClick(mission.id)} />
        ) : (
          <div
            className="w-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[9px]"
            style={{ height: MISSION_SLOT_HEIGHT }}
          >
            Mission
          </div>
        )}
      </div>

      {/* Card-edge strip: dilemmas placed under the mission (#606) */}
      <ReservedStrip height={6} />

      <ShipRow missionIndex={missionIndex} ships={ships} onCardClick={onCardClick} />
    </div>
  );
}

export default function MissionRow({
  missions,
  onCardClick,
  onOpenPile,
}: {
  missions: MissionSlot[];
  onCardClick: (id: string) => void;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center">
      {missions.map((slot, idx) => (
        <MissionColumn key={idx} missionIndex={idx} slot={slot} onCardClick={onCardClick} onOpenPile={onOpenPile} />
      ))}
    </div>
  );
}

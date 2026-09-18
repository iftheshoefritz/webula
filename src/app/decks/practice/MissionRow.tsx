'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for parts later slices fill in, all shown
// for now only as empty, non-interactive outlines so the column layout does not shift once they
// gain real content:
//   - A badge strip along the top edge (personnel/event pile badges, #602; dilemma stack badge, #605).
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

import { useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionSlot } from './tableReducer';
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
}: {
  missionIndex: number;
  slot: MissionSlot;
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: missionDropId(missionIndex) });
  const { mission, ships } = slot;

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: TABLE_CARD_WIDTH }}>
      {/* Badge strip: personnel/event pile badges (#602), dilemma stack badge (#605) */}
      <ReservedStrip height={8} />

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
}: {
  missions: MissionSlot[];
  onCardClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center">
      {missions.map((slot, idx) => (
        <MissionColumn key={idx} missionIndex={idx} slot={slot} onCardClick={onCardClick} />
      ))}
    </div>
  );
}

'use client';

// Spike for #1182: the opponent's mission row, drawn whole. Option C puts it on the zoomable
// table above the player's row (`ZoomTable.tsx`).
//
// The opponent's cards are read only. It draws the opponent's missions in mirrored order, as across a
// real table, at the size of the player's own row. The opponent's ships draw as ship cards with a
// rose ring, and the player's own ships there with a blue ring; the player's personnel there show
// as the player's part of the two-part badge.
//
// Each mission's column is a drop target, `their-mission-<index>`, that takes one of the player's
// ships (option C): the ship moves there with its crew. Every other card is refused, and stays
// where it was.

import { useDroppable } from '@dnd-kit/core';
import { MISSION_SLOTS } from './tableReducer';
import type { CardInstance } from './tableReducer';
import { TABLE_CARD_WIDTH, TableCardImage } from './TableCard';
import {
  ContestedMark,
  OPPONENT_TINT_CLASS,
  OpponentSideBadge,
  badgeStripHeight,
  missionCardHeight,
  shipCardWidth,
  shipRowLineHeight,
} from './MissionRow';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { sideIsEmpty, sidePersonnelCount } from './opponent';
import type { LocationSide, OpponentHalf } from './opponent';

const scaled = (px: number, scale: number): number => Math.round(px * scale);
const COLUMN_GAP = 4; // px, as `MissionRow`'s columns

export const theirMissionDropId = (index: number): string => `their-mission-${index}`;
export function theirMissionIndexFromDropId(id: string): number | null {
  const match = /^their-mission-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

// The order the opponent's row draws its slots in: mirrored, so their slot 0 is on the right.
export const mirroredSlots = (): number[] => Array.from({ length: MISSION_SLOTS }, (_, i) => MISSION_SLOTS - 1 - i);

function YourSideBadge({ count, height }: { count: number; height: number }) {
  return (
    <span
      aria-label={`You here: ${count} personnel`}
      className={`flex items-center gap-px rounded-full px-1 leading-none bg-sky-800/90 text-sky-50 text-[8px] font-bold ${
        count === 0 ? 'opacity-50' : ''
      }`}
      style={{ height: height - 2 }}
    >
      You {count}
    </span>
  );
}

function OpponentShip({
  ship,
  width,
  height,
  yours = false,
}: {
  ship: CardInstance;
  width: number;
  height: number;
  // One of the player's own ships at the opponent's mission.
  yours?: boolean;
}) {
  return (
    <div
      data-testid={yours ? `your-ship-at-theirs-${ship.id}` : undefined}
      className={`relative ring-1 rounded-md ${yours ? 'ring-sky-500' : 'ring-rose-600'}`}
      style={{ width }}
    >
      <TableCardImage instance={ship} width={width} height={height} />
      <span
        className={`absolute -top-1 -right-1 rounded-full px-1 text-[8px] font-bold leading-none ${
          yours ? 'bg-sky-800/90 text-sky-50' : OPPONENT_TINT_CLASS
        }`}
      >
        {ship.crew?.length ?? 0}
      </span>
    </div>
  );
}

export function OpponentMissionRow({
  half,
  scale,
  slotWidth,
  onOpenLocation,
}: {
  half: OpponentHalf;
  scale: number;
  slotWidth: number;
  onOpenLocation: (index: number) => void;
}) {
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardHeight = missionCardHeight(scale, false);
  const badgeHeight = badgeStripHeight(scale);
  const shipWidth = shipCardWidth(scale);
  const shipHeight = shipRowLineHeight(scale, false);
  return (
    <div data-testid="opponent-mission-row" className="flex flex-row gap-2 justify-center">
      {mirroredSlots().map((index) => (
        <OpponentMissionColumn
          key={index}
          index={index}
          half={half}
          slotWidth={slotWidth}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          badgeHeight={badgeHeight}
          shipWidth={shipWidth}
          shipHeight={shipHeight}
          onOpenLocation={onOpenLocation}
        />
      ))}
    </div>
  );
}

function OpponentMissionColumn({
  index,
  half,
  slotWidth,
  cardWidth,
  cardHeight,
  badgeHeight,
  shipWidth,
  shipHeight,
  onOpenLocation,
}: {
  index: number;
  half: OpponentHalf;
  slotWidth: number;
  cardWidth: number;
  cardHeight: number;
  badgeHeight: number;
  shipWidth: number;
  shipHeight: number;
  onOpenLocation: (index: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: theirMissionDropId(index) });
  // Only a ship shows a ring, as the player's own ship rows do.
  const highlight = highlightState('shipRow', useDraggedCardType(), isOver);
  const mission = half.missions[index];
  const theirs = half.sidesAtTheirs[index];
  const yours = half.yourSidesAtTheirs[index];
  const contested = !sideIsEmpty(theirs) && !sideIsEmpty(yours);
  return (
    <div
      ref={setNodeRef}
      data-testid={`opponent-mission-${index}`}
      data-zone={theirMissionDropId(index)}
      data-highlight={highlight}
      className={`flex flex-col items-center rounded ${highlightClassName(highlight)}`}
      style={{ width: slotWidth, gap: COLUMN_GAP }}
    >
      <button
        type="button"
        onClick={() => onOpenLocation(index)}
        className="relative rounded-md ring-2 ring-rose-700 touch-manipulation"
        style={{ width: cardWidth }}
        aria-label={`Opponent's mission ${mission ? mission.card.name : index + 1}, tap to see who is there`}
      >
        {mission && <TableCardImage instance={mission} width={cardWidth} height={cardHeight} />}
        {contested && <ContestedMark testId={`opponent-contested-${index}`} size={Math.round(badgeHeight * 0.7)} />}
      </button>
      <div className="w-full flex items-center justify-center gap-px" style={{ height: badgeHeight }}>
        <YourSideBadge count={sidePersonnelCount(yours)} height={badgeHeight} />
        <OpponentSideBadge
          testId={`opponent-row-side-${index}`}
          personnel={sidePersonnelCount(theirs)}
          ships={theirs.ships.length}
          onOpen={() => onOpenLocation(index)}
          height={badgeHeight}
        />
      </div>
      <div className="flex flex-row justify-center gap-1" style={{ minHeight: shipHeight }}>
        {theirs.ships.map((ship) => (
          <OpponentShip key={ship.id} ship={ship} width={shipWidth} height={shipHeight} />
        ))}
        {yours.ships.map((ship) => (
          <OpponentShip key={ship.id} ship={ship} width={shipWidth} height={shipHeight} yours />
        ))}
      </div>
    </div>
  );
}

export type Presence = 'none' | 'you' | 'opponent' | 'contested';

export function presence(yours: LocationSide, theirs: LocationSide): Presence {
  const you = !sideIsEmpty(yours);
  const them = !sideIsEmpty(theirs);
  return you && them ? 'contested' : you ? 'you' : them ? 'opponent' : 'none';
}

export const PRESENCE_STYLE: Record<Presence, string> = {
  none: 'rgb(255 255 255 / 0.12)',
  you: 'rgb(14 165 233)',
  opponent: 'rgb(225 29 72)',
  contested: 'linear-gradient(135deg, rgb(14 165 233) 50%, rgb(225 29 72) 50%)',
};

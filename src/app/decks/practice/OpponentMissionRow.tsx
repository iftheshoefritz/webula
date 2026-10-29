'use client';

// Spike for #1182: the opponent's mission row, drawn whole. Option C puts it on the zoomable
// table above the player's row (`ZoomTable.tsx`).
//
// The opponent's row is read only. It draws the opponent's missions in mirrored order, as across a
// real table, at the size of the player's own row, so the switch moves nothing else on the table.
// The opponent's ships draw as ship cards there, since that row is their side; the player's own
// cards at an opponent's mission show as the player's part of the two-part badge.

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
import { sideIsEmpty, sidePersonnelCount } from './opponent';
import type { LocationSide, OpponentHalf } from './opponent';

const scaled = (px: number, scale: number): number => Math.round(px * scale);
const COLUMN_GAP = 4; // px, as `MissionRow`'s columns

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

function OpponentShip({ ship, width, height }: { ship: CardInstance; width: number; height: number }) {
  return (
    <div className="relative ring-1 ring-rose-600 rounded-md" style={{ width }}>
      <TableCardImage instance={ship} width={width} height={height} />
      <span
        className={`absolute -top-1 -right-1 rounded-full px-1 text-[8px] font-bold leading-none ${OPPONENT_TINT_CLASS}`}
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
      {mirroredSlots().map((index) => {
        const mission = half.missions[index];
        const theirs = half.sidesAtTheirs[index];
        const yours = half.yourSidesAtTheirs[index];
        const contested = !sideIsEmpty(theirs) && !sideIsEmpty(yours);
        return (
          <div
            key={index}
            data-testid={`opponent-mission-${index}`}
            className="flex flex-col items-center"
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
            </div>
          </div>
        );
      })}
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

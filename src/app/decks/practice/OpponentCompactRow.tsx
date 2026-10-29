'use client';

// Spike for #1182, option B: both mission rows at once. The opponent's 5 missions sit in a compact
// row between the opponent strip and the player's own mission row, as across a real table: the
// opponent's row on the far side, mirrored, each tile above the player's column of the same slot.
//
// A tile is only the mission's title band, the top of the art crop, so the row costs about
// `COMPACT_TILE_HEIGHT` and the player's missions shrink by that much through
// `computeTouchMissionScale`, which measures from the top of the player's row. The tile carries the
// two-part badge of the location (the player's cards there | the opponent's) and the contested mark.
// The opponent's ships there are a count in their part of the badge, not cards. A tap on a tile
// opens the read-only panel of the location, where the cards show in full.

import { MISSION_SLOTS } from './tableReducer';
import { TableCardImage } from './TableCard';
import { ContestedMark, OpponentSideBadge } from './MissionRow';
import { sideIsEmpty, sidePersonnelCount } from './opponent';
import type { OpponentHalf } from './opponent';

// The title band of a mission at the art crop's top, at the minimum screen.
export const COMPACT_TILE_HEIGHT = 24; // px
const BADGE_HEIGHT = 14; // px
// Room below the row for the dilemmas under a mission of the player's row, which poke up.
const SLIVER_ROOM = 18; // px

export const mirroredSlots = (): number[] => Array.from({ length: MISSION_SLOTS }, (_, i) => MISSION_SLOTS - 1 - i);

export function OpponentCompactRow({
  half,
  slotWidth,
  cardWidth,
  onOpenLocation,
}: {
  half: OpponentHalf;
  // The width of a column of the player's row, so each tile sits over a column.
  slotWidth: number;
  cardWidth: number;
  onOpenLocation: (index: number) => void;
}) {
  return (
    <div
      data-testid="opponent-compact-row"
      className="flex flex-row gap-2 justify-center shrink-0"
      style={{ marginBottom: SLIVER_ROOM }}
    >
      {mirroredSlots().map((index) => {
        const mission = half.missions[index];
        const theirs = half.sidesAtTheirs[index];
        const yours = half.yourSidesAtTheirs[index];
        const contested = !sideIsEmpty(theirs) && !sideIsEmpty(yours);
        const yourCount = sidePersonnelCount(yours);
        return (
          <div key={index} className="flex justify-center" style={{ width: slotWidth }}>
            {/* A div, not a button: the badge inside it is a button. */}
            <div
              role="button"
              tabIndex={0}
              data-testid={`opponent-tile-${index}`}
              onClick={() => onOpenLocation(index)}
              className="relative rounded-md ring-2 ring-rose-700 touch-manipulation"
              style={{ width: cardWidth, height: COMPACT_TILE_HEIGHT }}
              aria-label={`Opponent's mission ${mission ? mission.card.name : index + 1}, tap to see who is there`}
            >
              {mission && (
                <TableCardImage instance={mission} width={cardWidth} height={COMPACT_TILE_HEIGHT} className="rounded-md opacity-80" />
              )}
              {contested && <ContestedMark testId={`opponent-contested-${index}`} size={10} />}
              <span className="absolute -bottom-1.5 right-0 flex items-center gap-px">
                {yourCount > 0 && (
                  <span
                    className="flex items-center rounded-full bg-sky-800/90 px-1 text-[8px] font-bold leading-none text-sky-50"
                    style={{ height: BADGE_HEIGHT - 2 }}
                  >
                    You {yourCount}
                  </span>
                )}
                {!sideIsEmpty(theirs) && (
                  <OpponentSideBadge
                    testId={`opponent-tile-side-${index}`}
                    personnel={sidePersonnelCount(theirs)}
                    ships={theirs.ships.length}
                    height={BADGE_HEIGHT}
                  />
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

// Spike for #1182, option A: one mission row at a time. The mission row shows the player's 5
// missions or the opponent's 5, and two tabs in the opponent strip switch between them. A small
// overview of all 10 locations sits beside the tabs: it labels the row on screen, and tells the
// player which row needs a look.
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
import type { LocationSide, OpponentHalf, Player } from './opponent';

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

type Presence = 'none' | 'you' | 'opponent' | 'contested';

function presence(yours: LocationSide, theirs: LocationSide): Presence {
  const you = !sideIsEmpty(yours);
  const them = !sideIsEmpty(theirs);
  return you && them ? 'contested' : you ? 'you' : them ? 'opponent' : 'none';
}

const PRESENCE_STYLE: Record<Presence, string> = {
  none: 'rgb(255 255 255 / 0.12)',
  you: 'rgb(14 165 233)',
  opponent: 'rgb(225 29 72)',
  contested: 'linear-gradient(135deg, rgb(14 165 233) 50%, rgb(225 29 72) 50%)',
};

// The tabs and the overview of the 10 locations, in the opponent strip. The overview has two rows
// of 5 cells, the opponent's missions on top (mirrored, as across a table) and the player's below,
// each cell coloured by who is there. The row on screen has an outline, and a tap on a row of the
// overview shows that row.
export function RowSwitch({
  showing,
  onShow,
  yourSides,
  half,
}: {
  showing: Player;
  onShow: (row: Player) => void;
  // The player's side of each of the player's own 5 locations.
  yourSides: LocationSide[];
  half: OpponentHalf;
}) {
  const rows: { row: Player; cells: Presence[] }[] = [
    {
      row: 'opponent',
      cells: mirroredSlots().map((i) => presence(half.yourSidesAtTheirs[i], half.sidesAtTheirs[i])),
    },
    {
      row: 'you',
      cells: yourSides.map((side, i) => presence(side, half.sidesAtYours[i])),
    },
  ];
  return (
    <span className="ml-auto flex items-center gap-2">
      <span role="tablist" className="flex h-full rounded-full bg-black/50 p-0.5 text-text-primary">
        {(['you', 'opponent'] as const).map((row) => (
          <button
            key={row}
            type="button"
            role="tab"
            aria-selected={showing === row}
            data-testid={`row-tab-${row}`}
            onClick={() => onShow(row)}
            className={`rounded-full px-2 py-0.5 ${showing === row ? (row === 'you' ? 'bg-sky-700' : 'bg-rose-700') : ''}`}
          >
            {row === 'you' ? 'Your missions' : 'Their missions'}
          </button>
        ))}
      </span>
      <span data-testid="location-overview" className="flex flex-col gap-px" aria-label="All 10 locations">
        {rows.map(({ row, cells }) => (
          <button
            key={row}
            type="button"
            data-testid={`overview-row-${row}`}
            data-showing={showing === row || undefined}
            onClick={() => onShow(row)}
            aria-label={row === 'you' ? 'Show your missions' : "Show the opponent's missions"}
            className={`flex gap-px rounded-sm p-px ${showing === row ? 'outline outline-1 outline-white' : ''}`}
          >
            {cells.map((cell, i) => (
              <span
                key={i}
                data-presence={cell}
                className="block rounded-[1px]"
                style={{ width: 9, height: 6, background: PRESENCE_STYLE[cell] }}
              />
            ))}
          </button>
        ))}
      </span>
    </span>
  );
}

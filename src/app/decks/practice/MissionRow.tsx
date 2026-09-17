'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for three parts later slices fill in, all
// shown for now only as empty, non-interactive outlines so the column layout does not shift once
// they gain real content:
//   - A badge strip along the top edge (personnel/event pile badges, #602; dilemma stack badge, #605).
//   - A card-edge strip below the bottom edge (dilemmas placed under the mission, #606).
//   - One ship row below that (ships on the mission, #599).

import { CardInstance } from './tableReducer';
import TableCard, { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';

const MISSION_SLOT_HEIGHT = TABLE_CARD_ART_HEIGHT + 14; // art + the title line below it

function ReservedStrip({ height }: { height: number }) {
  return <div className="w-full rounded border border-dashed border-white/15" style={{ height }} />;
}

function MissionColumn({
  zone,
  instance,
  onCardClick,
}: {
  zone: string;
  instance: CardInstance | null;
  onCardClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: TABLE_CARD_WIDTH }}>
      {/* Badge strip: personnel/event pile badges (#602), dilemma stack badge (#605) */}
      <ReservedStrip height={8} />

      <div data-zone={zone} className="w-full flex items-center justify-center">
        {instance ? (
          <TableCard instance={instance} onClick={() => onCardClick(instance.id)} />
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

      {/* Ship row: ships on the mission (#599) */}
      <ReservedStrip height={20} />
    </div>
  );
}

export default function MissionRow({
  missions,
  onCardClick,
}: {
  missions: (CardInstance | null)[];
  onCardClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-row gap-2 justify-center">
      {missions.map((instance, idx) => (
        <MissionColumn key={idx} zone={`mission-${idx}`} instance={instance} onCardClick={onCardClick} />
      ))}
    </div>
  );
}

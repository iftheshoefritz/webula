'use client';

// Spike for #1182: the read-only parts of the opponent's half that every layout option shares. The
// opponent strip along the top edge, and the read-only panel a tap on the opponent's part of a badge
// opens. The opponent's cards here carry no `data-zone`, no `data-card-id` and no drag: the player
// cannot act on them until hotseat play (#1183).

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cardDisplayName } from '../../../lib/cardCount';
import type { CardInstance } from './tableReducer';
import { TableCardImage } from './TableCard';
import { artCropHeight } from './viewerCardSize';
import { DilemmaIcon, OPPONENT_TINT_CLASS, ShipIcon } from './MissionRow';
import type { LocationSide, OpponentHalf } from './opponent';

// The strip is as tall as a badge of the badge strip at the minimum screen, and a little more.
export const OPPONENT_STRIP_HEIGHT = 20; // px
// The game menu and fullscreen buttons sit in the top left corner (`left-2`, 24 px wide). The
// strip starts right of them, as the attempt strip does.
const STRIP_LEFT_GUTTER = 20; // px past the content padding
// The dilemmas under a mission poke up into the content padding above the mission row
// (`underMissionHeadroom`), so the strip keeps that much room below it.
const STRIP_SLIVER_ROOM = 12; // px

function StripCount({ label, icon, count, testId }: { label: string; icon: ReactNode; count: number; testId: string }) {
  return (
    <span data-testid={testId} aria-label={`Opponent's ${label}: ${count}`} className="flex items-center gap-0.5">
      {icon}
      <span className="font-bold">{count}</span>
    </span>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5" aria-hidden="true">
      <rect x="2" y="6" width="9" height="13" rx="1.5" transform="rotate(-12 6 12)" />
      <rect x="8" y="4" width="9" height="13" rx="1.5" />
      <rect x="13" y="6" width="9" height="13" rx="1.5" transform="rotate(12 18 12)" />
    </svg>
  );
}

function DeckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
    </svg>
  );
}

// The opponent strip: always on screen, along the top edge. Counts only for the hand, the draw
// deck and the dilemma pile; the core and the brig are count buttons that open a read-only panel.
// `children` is the part each layout option adds to the strip, such as the switch between the two
// mission rows.
export function OpponentStrip({
  half,
  onOpenCore,
  onOpenBrig,
  children,
}: {
  half: OpponentHalf;
  onOpenCore: () => void;
  onOpenBrig: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="opponent-strip"
      className="flex items-center gap-2 text-[10px] leading-none text-rose-50 shrink-0"
      style={{ height: OPPONENT_STRIP_HEIGHT, marginLeft: STRIP_LEFT_GUTTER, marginRight: STRIP_LEFT_GUTTER, marginBottom: STRIP_SLIVER_ROOM }}
    >
      <span className={`flex items-center gap-2 rounded-full px-2 h-full ${OPPONENT_TINT_CLASS}`}>
        <span className="font-semibold uppercase tracking-wide text-[9px]">Opponent</span>
        <StripCount testId="opponent-hand" label="hand" icon={<HandIcon />} count={half.handCount} />
        <StripCount testId="opponent-draw-deck" label="draw deck" icon={<DeckIcon />} count={half.drawDeckCount} />
        <StripCount
          testId="opponent-dilemma-pile"
          label="dilemma pile"
          icon={<DilemmaIcon className="w-2.5 h-2.5" />}
          count={half.dilemmaPileCount}
        />
        <span data-testid="opponent-score" aria-label={`Opponent's score: ${half.score}`} className="font-bold">
          {half.score} pts
        </span>
        <button
          type="button"
          data-testid="opponent-core"
          onClick={onOpenCore}
          className="rounded-full bg-black/30 px-1.5 py-0.5"
          aria-label={`Opponent's core, ${half.core.length} cards, tap to see them`}
        >
          Core {half.core.length}
        </button>
        <button
          type="button"
          data-testid="opponent-brig"
          onClick={onOpenBrig}
          className="rounded-full bg-black/30 px-1.5 py-0.5"
          aria-label={`Opponent's brig, ${half.brig.length} cards, tap to see them`}
        >
          Brig {half.brig.length}
        </button>
      </span>
      {children}
    </div>
  );
}

// A side's cards in the order a panel lists them: the away team, then each ship followed by its crew.
export function sideCards(side: LocationSide): CardInstance[] {
  return [...side.awayTeam, ...side.ships.flatMap((ship) => [ship, ...(ship.crew ?? [])])];
}

export type PanelOwner = 'yours' | 'theirs';

export interface OpponentPanelContent {
  title: string;
  theirs: CardInstance[];
  // Absent for a panel with no "Yours" half, such as the opponent's core.
  yours?: CardInstance[];
  show: PanelOwner;
}

// The read-only panel (#1182 spike): the cards of one side of a location, or the opponent's core or
// brig, with a "Yours" · "Theirs" switch where the location has both. Each card is the cropped table
// card at the panel's card size, as in the player's own card list panels, with the personnel
// attributes the crop cuts off. The opponent's cards show on a rose surface with a rose ring, so
// they do not look like cards the player can drag. A real build
// would add the switch to `CardListPanel` instead of a second kind of popup; the spike keeps it apart
// so the drag code of `CardListPanel` stays untouched.
export function OpponentPanel({
  content,
  onSwitch,
  onClose,
  cardWidth,
}: {
  content: OpponentPanelContent;
  onSwitch: (show: PanelOwner) => void;
  onClose: () => void;
  cardWidth: number;
}) {
  const cards = content.show === 'theirs' ? content.theirs : content.yours ?? [];
  const theirs = content.show === 'theirs';
  return createPortal(
    <div
      data-testid="opponent-panel-backdrop"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        data-testid="opponent-panel"
        data-show={content.show}
        className={`max-w-[95vw] max-h-[85vh] flex flex-col rounded-lg p-2 shadow-xl ${
          theirs ? 'bg-rose-950/95 ring-2 ring-rose-700' : 'bg-bg-secondary ring-2 ring-sky-600'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 pb-2 text-xs text-text-primary">
          <span className="font-semibold">{content.title}</span>
          {content.yours && (
            <span role="tablist" className="flex rounded-full bg-black/40 p-0.5">
              {(['yours', 'theirs'] as const).map((owner) => (
                <button
                  key={owner}
                  type="button"
                  role="tab"
                  aria-selected={content.show === owner}
                  data-testid={`opponent-panel-${owner}`}
                  onClick={() => onSwitch(owner)}
                  className={`rounded-full px-2 py-0.5 ${
                    content.show === owner ? (owner === 'theirs' ? 'bg-rose-700' : 'bg-sky-700') : ''
                  }`}
                >
                  {owner === 'yours' ? `Yours ${content.yours?.length ?? 0}` : `Theirs ${content.theirs.length}`}
                </button>
              ))}
            </span>
          )}
          {theirs && <span className="text-[10px] text-rose-200">Read only</span>}
          <button type="button" onClick={onClose} className="ml-auto px-2" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex flex-wrap gap-1.5">
          {cards.length === 0 && <span className="p-4 text-xs text-text-muted">No cards here.</span>}
          {cards.map((instance) => (
            <div
              key={instance.id}
              data-testid={`opponent-panel-card-${instance.id}`}
              aria-label={cardDisplayName(instance.card)}
              className={`rounded-md ${instance.card.type === 'ship' ? 'ring-2 ring-amber-400' : ''} ${
                theirs ? 'opacity-90 saturate-75' : ''
              }`}
              style={{ width: cardWidth }}
            >
              <TableCardImage instance={instance} width={cardWidth} height={artCropHeight(cardWidth)} />
            </div>
          ))}
        </div>
        {theirs && cards.some((instance) => instance.card.type === 'ship') && (
          <p className="pt-1 text-[10px] text-rose-200">
            <ShipIcon className="inline w-2.5 h-2.5" /> A ship is followed by its crew.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

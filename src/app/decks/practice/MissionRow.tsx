'use client';

// The mission row (see the parent design in issue #130 and the plan for #597): 5 positional
// slots dealt face up from the deck's missions on a new game and on reset. A deck with fewer
// than 5 missions (a valid deck never has more) shows an empty placeholder outline for the rest.
//
// Every column, filled or empty, reserves fixed space for its controls, so the column layout
// does not shift as a mission's piles fill up:
//   - A badge strip below the mission card: the away team badge (#602), moved there from
//     above the mission card by #641 to make room for the dilemmas placed under the mission
//     (below), which now poke out above the mission card instead.
//   - Dilemmas placed under the mission (#606) render face up, stacked behind the mission card
//     in z-order, with a small sliver of each poking out above the mission card's top edge
//     (#641). They are absolutely positioned, so an empty pile reserves no space at all.
//
// The mission card and its ship row (#599) are both drop targets: dropping a ship on either one
// puts it in that mission's ship row, face up. A ship row shows up to 2 ships side by side; a
// third or later ship overlaps the others rather than growing the row, reusing the same
// overlap-offset calculation as the hand (`overlapOffset.ts`, originally #596).
//
// Each ship already sitting in a ship row is itself a drop target too, and takes a placed card (#812): a card
// dropped on its art is placed on the ship (see `ShipCard` below), the same as a card dropped on a
// card in the core or the brig (#810). The ship stays draggable at the same time; a `useDroppable`
// wrapper around the already draggable `TableCard`, the same nesting pattern used for the mission
// card's own drop target, keeps the two roles apart as two different DOM nodes. The ship's crew
// badge (#811) is the only way to board a card by a drag: the same `PersonnelIcon`-and-count pill
// a mission's away team shows (`PileBadge` below), not the plain `CountBadge` circle the draw
// and discard piles use, and shown even with no crew, so the first crew card has somewhere to
// land. A tap anywhere on the ship (`onShipClick`) opens a panel with the ship in its own section
// and every crew card below it (#832; `CardListPanel`, zone `'crew'`, wired up in `page.tsx`), so the badge itself is not a tap
// target of its own: it is a plain, non-interactive `<span>` with `pointer-events-none`, so a tap
// that lands on it falls through to the ship's own `TableCard` button beneath. A ship with cards on
// it shows a second counter, at the other corner, and that one is a button: a tap on it opens the
// cards on the ship (`onOpenPlacedOn`), apart from the ship's own tap.
//
// A row of 2 or fewer ships fits every ship side by side within the mission column's own width
// with no overlap (see `ShipRow`'s `shipMaxOffset` below); a third ship (or later) overlaps the
// earlier ones almost completely, since the row's width stays bounded and `offsetFor` shrinks the
// per-card offset as the count grows past what fits without overlap (#713). Once a row is in that
// overlapping
// state, every ship's tap opens a panel listing every ship on that row individually instead
// (`CardListPanel`, zone `'shipRow'`, the same list-view pattern the core, the brig, and a ship's
// crew already use) rather than going straight to `onShipClick` — the ship underneath an
// overlapping one is otherwise unreachable for both a tap and a drag. A tap on a ship inside that
// panel selects it, the same as a tap inside any other panel, and does not open its crew panel.
//
// Dropping a card on the mission card routes it by card type. The ship row takes only a ship
// (#886): any other card dropped on the bare row stays where it was. A personnel
// or an equipment joins that mission's away team face down (#870). An event, a mission, or an
// interrupt is placed on the mission card, face up, behind its count pill (#813,
// `PlacedOnCounter`). A dilemma dropped on a mission, from anywhere, goes under the mission
// instead (#606, #733), face up, permanently, unless it lands on the bottom half of the mission card,
// which places it on the mission card (#871, `missionHalfDropId`). The top half, where the cards
// under the mission poke out, puts it under the mission (#917). The away team badge sits on
// the badge strip, below (and as a sibling of, not nested inside) the mission card's own
// `<button>` — nesting a badge button inside it would be invalid HTML and would let the mission's
// own tap handler fire first, the same conflict already avoided for the ship's own drop target. The
// badge is a drop target of its own: dropping a card of any type directly on it overrides the
// type-based routing above and files the card into the away team regardless. The badge sits
// geometrically on top of the mission card's larger drop target, so `collisionDetection`
// (`page.tsx`), which ranks every zone the dragged card overlaps by area, smallest first, already
// picks the smaller, nested badge over the mission card beneath it, the same reasoning that lets
// a ship's own drop targets win over its enclosing ship row (#645), which would refuse any card
// but a ship (#886). A tap on the badge opens the away
// team's panel (`CardListPanel`). A tap on the top half of the mission card opens the
// under-the-mission pile's panel (#917), and does nothing when no dilemma is under the mission; a
// tap on the bottom half does nothing, and a hold on either half previews the mission. The
// under-the-mission pile has no badge and no visible tap target of its own (`UnderMissionStack`
// below), since the drop happens on the mission card's own drop target.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance, MissionPileName, MissionSlot } from './tableReducer';
import TableCard, {
  SMALL_CARD_ART_HEIGHT,
  SMALL_CARD_WIDTH,
  TABLE_CARD_ART_HEIGHT,
  TABLE_CARD_WIDTH,
} from './TableCard';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, landedBumpClassName, useLandedNonce } from './LandedZoneContext';

// Issue #717: every pixel size below is tuned against a scale of 1, the 568x320 viewport
// `BADGE_STRIP_HEIGHT_BASE`'s comment describes. `page.tsx` passes down a `scale`, computed by
// `useTableScale` (`tableScale.ts`) from the live size of the game layer, that grows past 1 once
// there's more room than that — e.g. once scrolling up hides the browser's own toolbar. `scaled`
// rounds every derived pixel value the same way, so two elements whose base sizes matched still
// match once scaled.
const scaled = (px: number, scale: number): number => Math.round(px * scale);

// A ship row card takes the small card size (`SMALL_CARD_WIDTH`/`SMALL_CARD_ART_HEIGHT` in
// `TableCard.tsx`), so 2 ships fit side by side within the same TABLE_CARD_WIDTH column the mission
// card above them occupies. The mission's own ship row grows it with `scale`.
const SMALL_CARD_MAX_OFFSET_BASE = SMALL_CARD_WIDTH + 2; // 2 ships sit edge to edge with a small gap

// The mission card has two drop halves (#871), each the full width and half the height of the
// card. They differ only for a dilemma: the top half puts it under the mission (#917), the bottom
// half places it on the mission card. Every other type routes the same way from either half.
export type MissionHalf = 'on' | 'under';
export const missionHalfDropId = (missionIndex: number, half: MissionHalf): string =>
  `mission-${half}-${missionIndex}`;
export const underMissionStackTestId = (missionIndex: number): string =>
  `${missionHalfDropId(missionIndex, 'under')}-stack`;
export const shipRowDropId = (missionIndex: number): string => `ship-row-${missionIndex}`;
// A ship's own droppable, over its art. A personnel or an equipment dropped here boards the crew
// (#600, #893); any other card is placed on the ship (#812).
export const crewDropId = (shipId: string): string => `crew-${shipId}`;

// A mission pile's badge is its own drop target (#602), distinct from `missionHalfDropId`, since a drop
// on the mission card places the card on it (#813). Only the away team has a badge: the
// under-mission pile's stack sits inside the mission card's drop target, and a dilemma dropped
// there goes under the mission.
export const missionPileDropId = (missionIndex: number, pile: MissionPileName): string =>
  `mission-pile-${pile}-${missionIndex}`;

export function missionPileFromDropId(id: string): { missionIndex: number; pile: MissionPileName } | null {
  const match = /^mission-pile-awayTeam-(\d+)$/.exec(id);
  return match ? { pile: 'awayTeam', missionIndex: Number(match[1]) } : null;
}

// Both a drop on the mission card and a drop on its ship row resolve to the same mission index
// (#599's plan); this parses either droppable id back to that index.
export function missionIndexFromDropId(id: string): number | null {
  const match = /^(?:mission-on|mission-under|ship-row)-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

// The half of the mission card a drop landed on (#871), or null for a ship row, which has none.
export function missionHalfFromDropId(id: string): MissionHalf | null {
  const match = /^mission-(on|under)-\d+$/.exec(id);
  return match ? (match[1] as MissionHalf) : null;
}

// Parses a ship's own droppable id back to that ship's instance id (#600's plan).
export function shipIdFromCrewDropId(id: string): string | null {
  const match = /^crew-(.+)$/.exec(id);
  return match ? match[1] : null;
}

function ShipCard({
  ship,
  onShipClick,
  onOpenPlacedOn,
  width,
  artHeight,
  badgeHeight,
}: {
  ship: CardInstance;
  onShipClick: (id: string) => void;
  onOpenPlacedOn: (targetId: string) => void;
  width: number;
  artHeight: number;
  badgeHeight: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: crewDropId(ship.id) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('ship', draggedType, isOver);
  // A move into the crew and a move onto the ship each have their own landed key
  // (`landedZoneKey.ts`), and both play their cue on this ship.
  const crewLandedNonce = useLandedNonce(crewDropId(ship.id));
  const onLandedNonce = useLandedNonce(`on-${ship.id}`);
  const landedNonce = onLandedNonce ?? crewLandedNonce;
  const crewCount = ship.crew?.length ?? 0;
  const onCount = ship.placedOn?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-zone={crewDropId(ship.id)}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative rounded ${highlightClassName(highlight)}`}
    >
      <TableCard instance={ship} onClick={() => onShipClick(ship.id)} width={width} artHeight={artHeight} draggable />
      <ShipCrewBadge
        shipName={ship.card.name}
        count={crewCount}
        height={badgeHeight}
        landedNonce={crewLandedNonce}
      />
      {onCount > 0 && (
        <PlacedOnCounter
          name={ship.card.name}
          count={onCount}
          height={badgeHeight}
          landedNonce={onLandedNonce}
          onOpen={() => onOpenPlacedOn(ship.id)}
        />
      )}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

// The count of the cards on a ship (#812) or a mission card (#813), the same plain count pill as a
// card in the core or the brig (`PlacedOnBadge`, `FlatCardRow.tsx`), at the corner opposite a ship's
// crew badge. Unlike the crew badge it is a tap target of its own: a sibling `<button>` of the
// card's own button, so a tap here opens the cards placed on that card and a tap on a ship still
// opens its crew. It is not a droppable, so a drop on it lands on that card's own droppable beneath.
function PlacedOnCounter({
  name,
  count,
  height,
  landedNonce,
  onOpen,
}: {
  name: string;
  count: number;
  height: number;
  landedNonce: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}, ${count} card${count === 1 ? '' : 's'} on it`}
      className="absolute -top-1 -left-1 z-10 flex items-center rounded-full bg-black/50 px-1 text-text-primary leading-none"
      style={{ height: height - 2 }}
    >
      <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
        {count}
      </span>
    </button>
  );
}

// The Flip button of a double-sided mission (#765), at the top-right corner of the mission card,
// the corner opposite `PlacedOnCounter`. Like the counter it is a sibling `<button>` of the card's
// own button, not a droppable, so a drop on it lands on the mission card's drop half beneath. It
// shows only for a mission with a `backimagefile`.
function MissionFlipButton({
  mission,
  height,
  onFlip,
}: {
  mission: CardInstance;
  height: number;
  onFlip: (missionId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onFlip(mission.id)}
      aria-label={`Flip ${mission.card.name} to its ${mission.flipped ? 'front' : 'back'}`}
      className="absolute -top-1 -right-1 z-10 flex items-center rounded-full bg-black/50 px-1 text-text-primary leading-none"
      style={{ height: height - 2 }}
    >
      <span className="text-[8px] font-bold">Flip</span>
    </button>
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

// A stack of face-down cards. Unused in this file since the dilemma stack moved out of the
// mission slots (#733); exported for #630, which uses it for the new stack's own badge.
export function DilemmaIcon() {
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
  awayTeam: PersonnelIcon,
  underMission: UnderMissionIcon,
};

// The badge's own noun. An away team is not a pile, so its label carries no such word; the
// under-mission pile is one, so its label keeps it.
const PILE_NOUN: Record<MissionPileName, string> = {
  awayTeam: 'Away team',
  underMission: 'Under the mission pile',
};

// A mission pile's badge (#602): a drop target of its own (dropping any card type directly on it
// puts the card in that pile) and a tap opens that pile's panel. Since a drop on the mission card
// places the card on it (#813), the badge is the only way to file a card into the pile by a drag,
// so it shows with an empty pile too, the same as a ship's crew badge (#811): the icon alone, with
// no count, and nothing to open.
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
  // A badge the drop itself creates (count 0 -> 1) reads the landed zones on its first render,
  // so the cue plays as it mounts (#778).
  const landedNonce = useLandedNonce(missionPileDropId(missionIndex, pile));
  const Icon = PILE_ICON[pile];

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-zone={missionPileDropId(missionIndex, pile)}
      data-landed={landedNonce !== null || undefined}
      onClick={count > 0 ? () => onOpen(missionIndex, pile) : undefined}
      aria-label={`${PILE_NOUN[pile]}, ${count} card${count === 1 ? '' : 's'}${count > 0 ? ', tap to open' : ''}`}
      className={`relative flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none ${
        count === 0 ? 'opacity-60' : ''
      } ${isOver ? 'ring-2 ring-accent' : ''}`}
      style={{ height: height - 2 }}
    >
      <Icon />
      {count > 0 && (
        <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
          {count}
        </span>
      )}
      <LandedRing nonce={landedNonce} />
    </button>
  );
}

// A ship's crew badge: the same `PersonnelIcon`-and-count pill style `PileBadge` uses for a
// mission's away team, so the same kind of thing — personnel in a pile — always gets the
// same badge. It sits as a sibling of the ship's own `TableCard` button, inside `ShipCard`'s
// `crewDropId` wrapper, since a `<button>` cannot nest inside another `<button>` (the ship's own
// button) — the same reasoning `PileBadge` documents above for the mission's own badges. A tap
// on the ship opens its crew panel (`onShipClick`), so the badge itself is not a tap target: a non-interactive `<span>` with
// `pointer-events-none`, so a tap that lands on it falls through to the ship's `TableCard` button
// underneath rather than being swallowed here. It is not a drop target (#923): a drop anywhere on
// the ship lands on the ship's own `crewDropId`, which boards a personnel or an equipment (#893).
// It shows with an empty crew too: the icon alone, with no count.
function ShipCrewBadge({
  shipName,
  count,
  height,
  landedNonce,
}: {
  shipName: string;
  count: number;
  height: number;
  landedNonce: number | null;
}) {
  return (
    <span
      aria-label={`${shipName} crew, ${count} card${count === 1 ? '' : 's'}`}
      className={`absolute -top-1 -right-1 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none ${
        count === 0 ? 'opacity-60' : ''
      }`}
      style={{ height: height - 2 }}
    >
      <PersonnelIcon />
      {count > 0 && (
        <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
          {count}
        </span>
      )}
    </span>
  );
}

function BadgeStrip({
  missionIndex,
  awayTeamCount,
  onOpenPile,
  height,
}: {
  missionIndex: number;
  awayTeamCount: number;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  height: number;
}) {
  return (
    <div className="w-full flex items-center justify-center gap-1" style={{ height }}>
      <PileBadge missionIndex={missionIndex} pile="awayTeam" count={awayTeamCount} onOpen={onOpenPile} height={height} />
    </div>
  );
}

// The under-the-mission stack shows at most two slivers (#917); the count on the stack, and the
// hidden button's aria-label, keep the true number.
const UNDER_MISSION_MAX_VISIBLE = 2;
// Each sliver pokes out by about 5% of the card height (#917).
const UNDER_MISSION_SLIVER_FRACTION = 0.05;

// The dilemmas placed under the mission (#606), rendered face up and stacked directly behind the
// mission card in z-order, each poking a small sliver out above the mission card's top edge
// (#641). Absolutely positioned within the mission's own relatively positioned drop target
// (`MissionColumn` below), so an empty pile renders nothing and reserves no space. The sliver
// band has no tap target of its own (#917): a tap on the top half of the mission card opens the
// pile's panel (`CardListPanel`). A visually hidden button keeps the pile's name and count for a
// screen reader and a keyboard, and `practice_drag.sh` reads its aria-label. The card images have
// no click handling of their own (`pointer-events-none`). The stack is not a drop target (#861), so
// it has no `data-zone`; its `data-testid`, `mission-under-<index>-stack` (#920), names the
// mission, and `practice_drag.sh` strips the `-stack` to print the drop target's own name.
function UnderMissionStack({
  missionIndex,
  cards,
  onOpen,
  cardWidth,
  cardArtHeight,
}: {
  missionIndex: number;
  cards: CardInstance[];
  onOpen: (missionIndex: number, pile: MissionPileName) => void;
  cardWidth: number;
  cardArtHeight: number;
}) {
  const landedNonce = useLandedNonce(missionPileDropId(missionIndex, 'underMission'));
  if (cards.length === 0) return null;
  const sliver = Math.max(1, Math.round(cardArtHeight * UNDER_MISSION_SLIVER_FRACTION));
  const shown = cards.slice(-UNDER_MISSION_MAX_VISIBLE);
  const stackHeight = sliver * shown.length;

  return (
    <div
      data-testid={underMissionStackTestId(missionIndex)}
      className="absolute inset-x-0"
      style={{ top: -stackHeight, height: stackHeight }}
      data-landed={landedNonce !== null || undefined}
    >
      {shown.map((card, i) => (
        <div
          key={card.id}
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
          style={{ top: i * sliver, zIndex: i + 1 }}
        >
          <TableCard instance={card} onClick={() => {}} width={cardWidth} artHeight={cardArtHeight} holdable={false} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onOpen(missionIndex, 'underMission')}
        aria-label={`${PILE_NOUN.underMission}, ${cards.length} card${
          cards.length === 1 ? '' : 's'
        }, tap to open`}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 right-1 z-20 pointer-events-none text-[8px] font-bold leading-none text-text-primary"
      >
        <span key={landedNonce ?? undefined} className={landedBumpClassName(landedNonce)}>
          {cards.length}
        </span>
      </span>
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

function ShipRow({
  missionIndex,
  ships,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  columnWidth,
  scale,
}: {
  missionIndex: number;
  ships: CardInstance[];
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  onOpenPlacedOn: (targetId: string) => void;
  columnWidth: number;
  scale: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: shipRowDropId(missionIndex) });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('shipRow', draggedType, isOver);
  const landedNonce = useLandedNonce(shipRowDropId(missionIndex));
  const shipCardWidth = scaled(SMALL_CARD_WIDTH, scale);
  const shipCardArtHeight = scaled(SMALL_CARD_ART_HEIGHT, scale);
  const shipRowHeight = shipCardArtHeight; // no title line below the art (#634)
  const shipMaxOffset = scaled(SMALL_CARD_MAX_OFFSET_BASE, scale);
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
      data-landed={landedNonce !== null || undefined}
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
                onOpenPlacedOn={onOpenPlacedOn}
                width={shipCardWidth}
                artHeight={shipCardArtHeight}
                badgeHeight={badgeHeight}
              />
            </div>
          ))}
        </div>
      )}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

// True when a tap on the mission card lands on its top half (#917), where the cards under the
// mission poke out. A tap there opens the under-the-mission panel.
function isTopHalfTap(event: React.MouseEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2;
}

// One of the mission card's two drop halves (#871), laid over the card like a `PileHalf`
// (`page.tsx`), but with `pointer-events-none`: dnd-kit measures the rect, so a drop still lands,
// while the hold preview on the mission's `TableCard` and the tap on `PlacedOnCounter` still work.
// During a dilemma drag each half shows its own highlight and, under the pointer, its label; for
// any other type both halves report the whole card's state and the card itself shows the ring.
function MissionHalfTarget({
  droppable,
  dropId,
  half,
  label,
  split,
  draggedType,
  eitherOver,
}: {
  droppable: ReturnType<typeof useDroppable>;
  dropId: string;
  half: MissionHalf;
  label: string;
  split: boolean;
  draggedType: string | null;
  eitherOver: boolean;
}) {
  const highlight = highlightState('mission', draggedType, split ? droppable.isOver : eitherOver);
  return (
    <div
      ref={droppable.setNodeRef}
      data-zone={dropId}
      data-highlight={highlight}
      className={`absolute inset-x-0 h-1/2 pointer-events-none ${half === 'under' ? 'top-0 rounded-t-lg' : 'bottom-0 rounded-b-lg'} ${
        split ? highlightClassName(highlight) : ''
      }`}
    >
      {split && droppable.isOver && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/60 rounded">
          {label}
        </span>
      )}
    </div>
  );
}

function MissionColumn({
  missionIndex,
  slot,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  onFlipMission,
  scale,
}: {
  missionIndex: number;
  slot: MissionSlot;
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  onOpenPlacedOn: (targetId: string) => void;
  onFlipMission: (missionId: string) => void;
  scale: number;
}) {
  const onDrop = useDroppable({ id: missionHalfDropId(missionIndex, 'on') });
  const underDrop = useDroppable({ id: missionHalfDropId(missionIndex, 'under') });
  const draggedType = useDraggedCardType();
  // Only a dilemma tells the two halves apart (#871), so only a dilemma drag shows them apart.
  // For any other type the whole card highlights while the pointer is over either half.
  const split = draggedType === 'dilemma';
  const eitherOver = onDrop.isOver || underDrop.isOver;
  const highlight = highlightState('mission', draggedType, eitherOver);
  const { mission, ships, awayTeam, underMission } = slot;
  // The cards placed on the mission card (#813), such as the events at the mission.
  const onLandedNonce = useLandedNonce(mission ? `on-${mission.id}` : '');
  const onCount = mission?.placedOn?.length ?? 0;
  const cardWidth = scaled(TABLE_CARD_WIDTH, scale);
  const cardArtHeight = scaled(TABLE_CARD_ART_HEIGHT, scale);
  const badgeHeight = scaled(BADGE_STRIP_HEIGHT_BASE, scale);

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: cardWidth }}>
      <div
        data-landed={onLandedNonce !== null || undefined}
        className={`relative w-full flex items-center justify-center rounded ${
          split ? '' : highlightClassName(highlight)
        }`}
      >
        {/* Dilemmas under the mission (#606), stacked behind it and poking out above (#641) */}
        <UnderMissionStack
          missionIndex={missionIndex}
          cards={underMission}
          onOpen={onOpenPile}
          cardWidth={cardWidth}
          cardArtHeight={cardArtHeight}
        />

        <div className="relative z-10 w-full flex items-center justify-center">
          {mission ? (
            <>
              <TableCard
                instance={mission}
                width={cardWidth}
                artHeight={cardArtHeight}
                onClick={(event) => {
                  if (underMission.length > 0 && isTopHalfTap(event)) onOpenPile(missionIndex, 'underMission');
                }}
              />
              <MissionHalfTarget
                droppable={onDrop}
                dropId={missionHalfDropId(missionIndex, 'on')}
                half="on"
                label="On"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
              />
              <MissionHalfTarget
                droppable={underDrop}
                dropId={missionHalfDropId(missionIndex, 'under')}
                half="under"
                label="Under"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
              />
              {onCount > 0 && (
                <PlacedOnCounter
                  name={mission.card.name}
                  count={onCount}
                  height={badgeHeight}
                  landedNonce={onLandedNonce}
                  onOpen={() => onOpenPlacedOn(mission.id)}
                />
              )}
              {mission.card.backimagefile && (
                <MissionFlipButton mission={mission} height={badgeHeight} onFlip={onFlipMission} />
              )}
            </>
          ) : (
            <div
              className="relative w-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[9px]"
              style={{ height: cardArtHeight }}
            >
              Mission
              {/* With no mission card to place on, a dilemma goes under the mission from either half. */}
              <MissionHalfTarget
                droppable={onDrop}
                dropId={missionHalfDropId(missionIndex, 'on')}
                half="on"
                label="Under"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
              />
              <MissionHalfTarget
                droppable={underDrop}
                dropId={missionHalfDropId(missionIndex, 'under')}
                half="under"
                label="Under"
                split={split}
                draggedType={draggedType}
                eitherOver={eitherOver}
              />
            </div>
          )}
        </div>
        <LandedRing nonce={onLandedNonce} />
      </div>

      {/* Badge strip: the away team badge (#602). */}
      <BadgeStrip
        missionIndex={missionIndex}
        awayTeamCount={awayTeam.length}
        onOpenPile={onOpenPile}
        height={badgeHeight}
      />

      <ShipRow
        missionIndex={missionIndex}
        ships={ships}
        onShipClick={onShipClick}
        onOpenShipRow={onOpenShipRow}
        onOpenPlacedOn={onOpenPlacedOn}
        columnWidth={cardWidth}
        scale={scale}
      />
    </div>
  );
}

export default function MissionRow({
  missions,
  onOpenPile,
  onShipClick,
  onOpenShipRow,
  onOpenPlacedOn,
  onFlipMission = () => {},
  scale = 1,
}: {
  missions: MissionSlot[];
  onOpenPile: (missionIndex: number, pile: MissionPileName) => void;
  onShipClick: (shipId: string) => void;
  onOpenShipRow: (missionIndex: number) => void;
  // A tap on the counter of the cards on a ship (#812) opens them.
  onOpenPlacedOn: (targetId: string) => void;
  // A tap on the Flip button of a double-sided mission (#765) turns it over.
  onFlipMission?: (missionId: string) => void;
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
          onOpenPile={onOpenPile}
          onShipClick={onShipClick}
          onOpenShipRow={onOpenShipRow}
          onOpenPlacedOn={onOpenPlacedOn}
          onFlipMission={onFlipMission}
        />
      ))}
    </div>
  );
}

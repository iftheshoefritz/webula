// The 3D look of a pile (part of the 3D table, `table3d.ts`): a pile of cards on the table draws the cards under its top card, each a
// little lower and a little askew, as many as the pile is thick, so it looks like a real pile of
// cards and a draw deck of 40 stands visibly taller than a discard pile of 3. The table is seen
// from the player's side, so the cards below show under the top card and a little to the right,
// where the light from the top left throws the pile's shadow.
//
// The layers are elements behind the top card with no pointer events (`PileDepth` in
// `PracticeTable.tsx`), never a change of the card's own box: the top card keeps its place and
// its size, so the drop halves, the drag and the layout math (`flatRowWidths.ts`,
// `tableScale.ts`) see the table they saw before. A transform takes no layout.
// The thickness of one card at bottom-row scale 1, in px. A real card is about 0.3 mm thick and
// 88 mm tall, about 0.27 px at 80 px tall. A little less keeps a 60-card deck from crowding the row.
export const PILE_DEPTH_PER_CARD = 0.2;
// The tallest pile, at scale 1, in px: about 50 cards. Every pile above it looks the same height.
export const PILE_DEPTH_MAX = 10;
// The pile leans right by this share of its height, as the view is from a little to the left.
const PILE_DEPTH_LEAN = 0.3;
// At most this many cards draw under the top card. A thicker pile spaces them further apart.
export const PILE_MAX_LAYERS = 10;
// How far a card of the pile sits off square, at most: so many px sideways, so many degrees.
const JITTER_PX = 2;
const JITTER_DEG = 2.5;

// The height of the pile of `count` cards under its top card, in px, at the bottom-row scale
// `rowScale`. The top card is the face the player sees, so a pile of one card has no height.
export function pileDepth(count: number, rowScale = 1): number {
  if (count <= 1) return 0;
  const depth = Math.min((count - 1) * PILE_DEPTH_PER_CARD, PILE_DEPTH_MAX);
  return round(depth * rowScale);
}

export interface PileLayer {
  // The offset of the card from the top card, in px, and its turn, in degrees.
  x: number;
  y: number;
  rotate: number;
  // How much of the light reaches it: the lower the card, the darker.
  brightness: number;
}

// The cards drawn under the top card of a pile of `count`, from the top down. Each sits a step
// lower and further right than the one above it, the bottom one at the pile's full height, and
// each is a little askew, the same way on every render (`jitter` of its place in the pile), so the
// pile looks the same from one render to the next and shows the edges of separate cards.
export function pileLayers(count: number, rowScale = 1): PileLayer[] {
  const depth = pileDepth(count, rowScale);
  if (depth === 0) return [];
  const n = Math.min(PILE_MAX_LAYERS, count - 1, Math.max(1, Math.ceil(depth / (0.8 * rowScale))));
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    const y = (depth * i) / n;
    return {
      x: round(y * PILE_DEPTH_LEAN + jitter(i, 1) * JITTER_PX * rowScale),
      y: round(y),
      rotate: round(jitter(i, 2) * JITTER_DEG),
      brightness: round(1 - (0.3 * i) / n),
    };
  });
}

// The cut edge of one card under the top card: a black-bordered card back on a dark table shows
// no edge of its own, so a pale line of card stock under each card tells the cards apart.
export const PILE_CARD_EDGE = '0 1px 0 rgba(205, 205, 215, 0.55), 1px 0 0 rgba(205, 205, 215, 0.3)';

// The shadow the pile casts on the table, from its bottom card: longer and softer the taller the pile.
export function pileCastShadow(count: number, rowScale = 1): string {
  const d = pileDepth(count, rowScale);
  return `${round(1 + d * 0.5)}px ${round(2 + d * 0.6)}px ${round(4 + d)}px rgba(0, 0, 0, 0.6)`;
}

// A fixed number from -1 to 1 for the card at `index`, one per `salt`.
function jitter(index: number, salt: number): number {
  const s = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

const round = (n: number): number => Math.round(n * 100) / 100;

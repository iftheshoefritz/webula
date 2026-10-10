// Every action of the practice table, for touch and for a mouse (#1088). The Controls panel of
// the game menu shows these rows, and the clip recorder of #1089 reads them too, so the `id` of a
// row is stable: the clip files take their names from it.
//
// When the gesture is the same for touch and for a mouse, `touch` and `mouse` hold the same
// string, and the panel shows it once. The words follow `docs/ubiquitous-language.md`.

export const CONTROL_SECTIONS = ['Basics', 'Missions and ships', 'Piles and panels', 'More than one card', 'Buttons'] as const;

export type ControlSection = (typeof CONTROL_SECTIONS)[number];

export type ControlRow = {
  id: string;
  section: ControlSection;
  action: string;
  touch: string;
  mouse: string;
  // Which clips exist for the row (#1089); `clipFiles` gives their paths.
  clip?: { touch?: boolean; mouse?: boolean };
};

// The same text for touch and for a mouse.
const both = (text: string) => ({ touch: text, mouse: text });

export const CONTROL_ROWS: ControlRow[] = [
  // Basics
  {
    id: 'draw-card',
    section: 'Basics',
    action: 'Draw a card',
    ...both('Tap the draw deck. A tap on the dilemma pile draws into the dilemma hand.'),
  },
  {
    id: 'open-hand',
    section: 'Basics',
    action: 'Open and close the hand',
    ...both('Tap the hand to open it. Tap outside the fan to close it.'),
  },
  {
    id: 'card-preview',
    section: 'Basics',
    action: 'See a card large',
    touch: 'Press and hold the card.',
    mouse: 'Hover over the card.',
  },
  {
    id: 'move-card',
    section: 'Basics',
    action: 'Move a card',
    ...both('Drag it to where it goes. A release near the point where the drag started cancels the drag.'),
  },
  {
    id: 'no-rules',
    section: 'Basics',
    action: 'The rules',
    ...both('The table does not enforce the rules: a card lands almost anywhere you drop it.'),
  },

  // Missions and ships
  {
    id: 'mission-drop-halves',
    section: 'Missions and ships',
    action: 'Drop on a mission',
    ...both(
      'The top half puts a dilemma under the mission. The bottom half places it on the mission card. ' +
        'A personnel or an equipment joins the away team, and a ship goes to the ship row.'
    ),
  },
  {
    id: 'ship-drop',
    section: 'Missions and ships',
    action: 'Drop on a ship',
    ...both('A personnel or an equipment boards the crew, and any other card is placed on the ship.'),
  },
  {
    id: 'open-crew',
    section: 'Missions and ships',
    action: 'Open the crew',
    touch: 'Tap the ship.',
    mouse: 'Click the ship.',
  },
  {
    id: 'complete-mission',
    section: 'Missions and ships',
    action: 'Complete a mission',
    touch: 'Double-tap the mission card. Completing scores nothing, so change the score by hand.',
    mouse:
      'Double-click the mission card, or Tab to it and press Enter. Completing scores nothing, so change the score by hand.',
  },
  {
    id: 'flip-mission',
    section: 'Missions and ships',
    action: 'Flip a double-sided mission',
    ...both('The Flip button on the mission. This is not the Flip of a selection, which turns cards face down.'),
  },

  // Piles and panels
  {
    id: 'open-panel',
    section: 'Piles and panels',
    action: 'Open a panel',
    touch:
      'Tap the away team badge, the slivers above a mission, the event or dilemma badge, a card in the core or the brig, or the dilemma stack.',
    mouse:
      'Click the away team badge, the slivers above a mission, the event or dilemma badge, a card in the core or the brig, or the dilemma stack.',
  },
  {
    id: 'drag-out-of-panel',
    section: 'Piles and panels',
    action: 'Move a card out of a panel',
    touch: 'Drag it onto the table. A first move up or down scrolls the panel, and a first move sideways drags the card.',
    mouse: 'Drag it onto the table.',
  },
  {
    id: 'download',
    section: 'Piles and panels',
    action: 'Download',
    ...both(
      'The Download button of the draw deck or the dilemma pile, select cards, then Download. They go into the hand, and the pile shuffles.'
    ),
  },
  {
    id: 'reveal-pile',
    section: 'Piles and panels',
    action: 'Look at the top or bottom of a pile',
    ...both('The eye button, then Reveal top or Reveal bottom. Nothing moves.'),
  },
  {
    id: 'order-dilemma-stack',
    section: 'Piles and panels',
    action: 'Order the dilemma stack',
    ...both('Open it and drag the dilemmas. The first card is revealed first.'),
  },

  // More than one card
  {
    id: 'select',
    section: 'More than one card',
    action: 'Select',
    touch: 'Tap the cards in a panel or in the open hand.',
    mouse:
      'Click the cards in a panel or in the open hand, or drag a box on the empty space. Shift, Ctrl or Cmd adds to the selection.',
  },
  {
    id: 'move-selection',
    section: 'More than one card',
    action: 'Move a selection',
    ...both('Drag any selected card.'),
  },
  {
    id: 'stop-personnel',
    section: 'More than one card',
    action: 'Stop personnel',
    ...both('Select, then Stop. A crew panel or an away team panel also has Stop all.'),
  },
  {
    id: 'place-on-card',
    section: 'More than one card',
    action: 'Place a card on a card in the core or the brig',
    ...both('Drag it over the card and hold until the ring shows, then release.'),
  },

  // Buttons
  { id: 'next-turn', section: 'Buttons', action: 'Next turn', ...both('Unstops every personnel.') },
  { id: 'score', section: 'Buttons', action: 'Score − / +', ...both('Changes the score by hand.') },
  {
    id: 'shuffle',
    section: 'Buttons',
    action: 'Shuffle',
    ...both('On the draw deck, the dilemma pile, and in a panel.'),
  },
  {
    id: 'reveal-top-dilemma',
    section: 'Buttons',
    action: 'Reveal top dilemma',
    ...both('The button on the dilemma stack turns its top card over.'),
  },
  {
    id: 'selection-buttons',
    section: 'Buttons',
    action: 'Discard, Flip, Top, Bottom',
    ...both('Act on the selection in a panel or the open hand.'),
  },
  {
    id: 'fullscreen',
    section: 'Buttons',
    action: 'Fullscreen',
    ...both('The button under the menu button. It is missing where the browser cannot go fullscreen, such as on iPhone Safari.'),
  },
  {
    id: 'game-menu',
    section: 'Buttons',
    action: 'The game menu',
    ...both(
      'Continue, Decklist, Game log, Load deck, Offline, Controls and Reset. ' +
        'The game saves itself and comes back on the next load, and Reset deals a new game.'
    ),
  },
];

// The rows of each section, in the order of `CONTROL_SECTIONS`.
export function controlsBySection(rows: ControlRow[] = CONTROL_ROWS): { section: ControlSection; rows: ControlRow[] }[] {
  return CONTROL_SECTIONS.map((section) => ({ section, rows: rows.filter((row) => row.section === section) }));
}

export type ControlColumn = 'touch' | 'mouse';

// The folder of the clips under `public/` (#1089). The service worker does not precache it
// (`next.config.mjs`), so the offline install stays small.
export const CONTROL_CLIPS_PATH = '/controls/';

export type ClipFiles = { webm: string; mp4: string; poster: string };

// The files of a row's clip for one column, or null when the row has no clip for it (#1090). The
// panel plays them, and the recorder of #1091 and its file test use the same paths.
export function clipFiles(row: ControlRow, column: ControlColumn): ClipFiles | null {
  if (!row.clip?.[column]) return null;
  const base = `${CONTROL_CLIPS_PATH}${row.id}-${column}`;
  return { webm: `${base}.webm`, mp4: `${base}.mp4`, poster: `${base}.webp` };
}

// The layer order of the practice table (#897): one z-index for each overlay, lowest first. Each
// value is a whole Tailwind class, so Tailwind finds it in this file. Put a new overlay here, in
// its place in the order, rather than a bare `z-[...]` in its component.
//
// | Layer                                  | Class     | Where                  |
// |----------------------------------------|-----------|------------------------|
// | Game menu + fullscreen button, closed  | `z-50`    | `PracticeTable.tsx`    |
// | Pile count badge                       | `z-[140]` | `CountBadge.tsx`       |
// | Closed hand fan (#1489)                | `z-[142]` | `CardHand.tsx`         |
// | Open hand backdrop                     | `z-[145]` | `CardHand.tsx`         |
// | Open hand card fan                     | `z-[146]` | `CardHand.tsx`         |
// | Card list panel                        | `z-[150]` | `CardListPanel.tsx`    |
// | Game menu splash                       | `z-[160]` | `PracticeTable.tsx`    |
// | Game menu + fullscreen button, open    | `z-[170]` | `PracticeTable.tsx`    |
// | Load deck's missing-cards warning      | `z-[175]` | `PracticeTable.tsx`    |
// | Modal backdrop (decklist, Drive picker)| `z-[180]` | `DecklistPanel.tsx`, `drivePicker/DriveModalShell.tsx` (`DrivePickerModal.tsx`, `PracticeDeckPicker.tsx`, `OfflineDeckPicker.tsx`) |
// | Modal dialog (decklist, Drive move)    | `z-[190]` | `DecklistPanel.tsx`, `DrivePickerModal.tsx` (its Move dialog) |
// | Card preview (table, decklist image)   | `z-[200]` | `CardPreview.tsx`, `DecklistPanel.tsx` |
//
// Every pile count badge shares one stacking context with the table's overlays, so each overlay
// that must hide the badges sits above `z-[140]`. The game menu closes before it opens a modal, so
// a modal only has to clear the badges, but it sits above the splash and the menu button as well.
// The card preview stays on top of everything.
export const LAYER_MENU_BUTTON = 'z-50';
export const LAYER_COUNT_BADGE = 'z-[140]';
// The closed hand is a small fan on top of the bottom row (#1489), portalled into the game layer as
// the open fan is, since the bottom row has a transform that traps `fixed`. It sits above the bottom
// row's badges and below the backdrop of an open hand.
export const LAYER_CLOSED_HAND = 'z-[142]';
export const LAYER_HAND_BACKDROP = 'z-[145]';
export const LAYER_HAND_FAN = 'z-[146]';
export const LAYER_CARD_LIST_PANEL = 'z-[150]';
export const LAYER_MENU_SPLASH = 'z-[160]';
export const LAYER_MENU_BUTTON_OPEN = 'z-[170]';
// The warning of a Load deck that dropped cards (#1616): above the menu, below a modal.
export const LAYER_LOAD_WARNING = 'z-[175]';
export const LAYER_MODAL_BACKDROP = 'z-[180]';
export const LAYER_MODAL = 'z-[190]';
export const LAYER_CARD_PREVIEW = 'z-[200]';

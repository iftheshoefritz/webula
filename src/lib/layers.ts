// The layer order of the practice table (#897): one z-index for each overlay, lowest first. Each
// value is a whole Tailwind class, so Tailwind finds it in this file. Put a new overlay here, in
// its place in the order, rather than a bare `z-[...]` in its component.
//
// | Layer                                  | Class     | Where                  |
// |----------------------------------------|-----------|------------------------|
// | Game menu + fullscreen button, closed  | `z-50`    | `PracticeTable.tsx`    |
// | Pile count badge                       | `z-[140]` | `CountBadge.tsx`       |
// | Resolving event's small card (#1728)   | `z-[141]` | `ResolvingPanel.tsx`   |
// | Closed hand fan (#1489)                | `z-[142]` | `CardHand.tsx`         |
// | Play target (#1729)                    | `z-[143]` | `PlayTarget.tsx`       |
// | Open hand backdrop                     | `z-[145]` | `CardHand.tsx`         |
// | Open hand card fan                     | `z-[146]` | `CardHand.tsx`         |
// | Resolving panel (#1728)                | `z-[147]` | `ResolvingPanel.tsx`   |
// | Resolve prompt, its row and small card (#1870) | `z-[147]` | `ResolvePrompt.tsx`, `ResolvingPanel.tsx` |
// | Charge chip (#1607)                    | `z-[148]` | `TurnCounters.tsx`     |
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
// The small card of a resolving event under View table (#1728): above the table and its badges.
export const LAYER_RESOLVING_MINI = 'z-[141]';
export const LAYER_CLOSED_HAND = 'z-[142]';
// The Play target (#1729), during a drag only: over the table above the bottom row and its badges.
export const LAYER_PLAY_TARGET = 'z-[143]';
export const LAYER_HAND_BACKDROP = 'z-[145]';
export const LAYER_HAND_FAN = 'z-[146]';
// The resolving panel (#1728), with its backdrop: over the hand, below the charge chip, so the play's
// choices stay reachable, and below the splash.
export const LAYER_RESOLVING_PANEL = 'z-[147]';
// The prompt of a resolving event (#1870), its row of candidates and its small card: over the open hand's
// backdrop and arc, so each stays reachable while the arc is open, below the charge chip. It never shows with
// the resolving panel, so the two share a value.
export const LAYER_RESOLVE_PROMPT = 'z-[147]';
// The trigger offers (#1904), below the charge chip as the prompt is: over the open hand, below a card list
// panel. They never show with the prompt or the resolving panel, since the offers wait for them.
export const LAYER_TRIGGER_OFFERS = 'z-[147]';
// The brief chip of a charge (#1607), at the top of the screen: above the table and the open hand,
// below a card list panel.
export const LAYER_CHARGE_CHIP = 'z-[148]';
export const LAYER_CARD_LIST_PANEL = 'z-[150]';
export const LAYER_MENU_SPLASH = 'z-[160]';
export const LAYER_MENU_BUTTON_OPEN = 'z-[170]';
// The warning of a Load deck that dropped cards (#1616): above the menu, below a modal.
export const LAYER_LOAD_WARNING = 'z-[175]';
export const LAYER_MODAL_BACKDROP = 'z-[180]';
export const LAYER_MODAL = 'z-[190]';
export const LAYER_CARD_PREVIEW = 'z-[200]';

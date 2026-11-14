'use client';

import React, {
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  useDndContext,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { collisionDetection } from './collisionDetection';
import { useEscapeLayer } from './useEscapeLayer';
import { FaLayerGroup, FaMobileAlt, FaForward, FaTimes } from 'react-icons/fa';
import {
  cardPileFor,
  deckFromTsv,
  extractDrawDeck,
  extractDilemmas,
  extractMissions,
  isDeckEmpty,
  mergeDeckPiles,
  missingCardsMessage,
  missingCardsOf,
  missingInPiles,
  shuffleArray,
  withBackImageFiles,
} from '../deckBuilderUtils';
import { DeckList } from '../../../types';
import useDataFetching from '../../../hooks/useDataFetching';
import { usePlaytestCards, useWithPlaytestCards } from '../../../hooks/usePlaytestCards';
import PlaytestSignInHint from '../../../components/PlaytestSignInHint';
import { useCompleteData } from './useCompleteData';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import {
  PRACTICE_ATTRIBUTES_CORE,
  PRACTICE_ATTRIBUTES_TSV,
  PRACTICE_COSTS_CREW,
  PRACTICE_COSTS_TSV,
  PRACTICE_DECK_TSV,
} from '../../../lib/practiceDeck';
import { chulaPileDeck } from '../../../lib/dilemmaBot/chulaPile';
import { CHULA_BOT_PILE_ID, CHULA_BOT_PILE_NAME, botPileDeckOf } from '../../../lib/dilemmaBot/botPiles';
import type { BotPileChoice, BotPileInfo } from '../../../lib/dilemmaBot/botPiles';
import { useBotPiles } from './useBotPiles';
import { collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { cardDisplayName } from '../../../lib/cardCount';
import { LAYER_LOAD_WARNING, LAYER_MENU_BUTTON, LAYER_MENU_BUTTON_OPEN, LAYER_MENU_SPLASH } from '../../../lib/layers';
import { PracticeDeckPicker } from './PracticeDeckPicker';
import type { MissionsAndDrawSource } from './PracticeDeckPicker';
import { usePracticeDrive } from './usePracticeDrive';
import { editDeckDestination, navigateTo } from './editCurrentDeck';
import { EDIT_DECK_HANDOFF_KEY } from '../../../hooks/useDriveSync';
import { useOfflineDecks } from './offlineDecks';
import { OfflineMenuView, offlineItemLabel, settingsItemLabel } from './OfflineMenuView';
import { OfflineDeckList, OfflineDeckPicker } from './OfflineDeckPicker';
import { isBrowserOnline, useOnline } from './useOnline';
import type { OfflineDeck } from './offlineDecks';
import {
  AttemptPhase,
  nextSegmentOf,
  TurnSegment,
  CardInstance,
  MissionPileName,
  MoveTarget,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  ReorderZone,
  TableAction,
  TableState,
  TableZone,
  Zone,
  createCardInstances,
  findInstanceAnywhere,
  initialTableState,
  seedInstanceIds,
  tableReducer,
} from './tableReducer';
import { fromSavedGame, toSavedGame, toSavedHistory } from './savedGame';
import { savedHistoryKey, writeSavedHistory } from './gameHistory';
import CardHand from './CardHand';
import MissionRow, {
  DilemmaIcon,
  SHIP_ROW_GAP,
  missionIndexFromDropId,
  missionColumnHeight,
  missionHalfFromDropId,
  PlacedOnGroup,
  placedOnGroupOf,
  shipIdFromCrewDropId,
  shipRowLineHeight,
  shipsPerRow,
  underMissionHeadroom,
} from './MissionRow';
import CardPreview from './CardPreview';
import DecklistPanel from './DecklistPanel';
import GameLogPanel from './GameLogPanel';
import { CHARGE_CHIP_MS, ChargeChip, TurnCounterButton, TurnCountersList } from './TurnCounters';
import useLocalStorage from '../../../hooks/useLocalStorage';
import { AttemptDialog } from './AttemptPanel';
import { useBotAttemptStart } from './useBotAttemptStart';
import AttemptLayout, { VIEW_FULL_TABLE_HOLD_ID } from './AttemptLayout';
import { missionIndexFromAttemptAwayTeamDropId, shipIdFromAttemptCrewDropId, type BotRowMarks } from './AttemptPersonnelRow';
import {
  AttemptMoveDestination,
  AttemptPanel,
  attemptDefaults,
  attemptMoveDestinations,
  attemptViewKey,
  canAttempt,
  fixtureAttempt,
  fixtureAttemptPlacedOn,
  fixtureAttemptStack,
  fixtureBotLabelAttempt,
  BOT_REVEAL_FIXTURES,
  attemptModifiersText,
  attemptDonePrompt,
  botLabelOf,
  botResolveOf,
} from './attempt';
import ControlsPanel from './ControlsPanel';
import HomeScreenHelp from './HomeScreenHelp';
import {
  actionCharged,
  ChargeTarget,
  entryCharges,
  GameAction,
  gameReducer,
  initialGameState,
  logEntryText,
  pendingDiscountsOf,
  tableLimitGrants,
  turnCharges,
  turnCounters,
  TurnCounters,
  withShuffleOrders,
} from './gameLog';
import {
  CardHoldProvider,
  NO_CALLOUT_STYLE,
  PLACE_ON_HOLD_MS,
  PreviewSide,
  previewCardSelector,
  swallowClickOf,
  useCardHold,
} from './useCardHold';
import { NO_PLACE_ON_HOLD, PlaceOnHold, PlaceOnHoldProvider } from './PlaceOnHoldContext';
import { flatRowMaxOffset, flatRowWidths, pileCardSize, useElementHeight, useElementWidth } from './flatRowWidths';
import { useTableSensors } from './panelScrollSensor';
import CountBadge from './CountBadge';
import CardListPanel, { PanelLocation, RevealIcon, ShuffleIcon } from './CardListPanel';
import FlatCardRow, { targetIdFromOnDropId } from './FlatCardRow';
import { PILE_CARD_BORDER_STYLE, RemovedFromGameLabel, STOPPED_IMAGE_CLASSNAME, cardBorderStyle, SMALL_CARD_WIDTH, TableCardImage } from './TableCard';
import {
  DESKTOP_RESERVED_SHIP_ROWS,
  TOUCH_RESERVED_SHIP_ROWS,
  ATTEMPT_STACK_LABEL_HEIGHT,
  DESKTOP_FULL_TABLE_RESERVE,
  MENU_BUTTON_GUTTER,
  TOUCH_CONTROLS_COLUMN,
  computeBottomRowScale,
  desktopMissionSlotBudget,
  useAttemptLayout,
  useMissionScale,
  useShipRowCount,
  useTableScale,
  turnScoreColumnCompact,
} from './tableScale';
import { usePanelBottomInset } from './panelBottomInset';
import { useToolbarScrollRoom } from './toolbarScrollRoom';
import { viewerCardSize } from './viewerCardSize';
import { useFinePointer } from './useFinePointer';
import { SAFE_INSET_CSS, type SafeAreaInsets, safeAreaMargins, useSafeAreaInsets } from './useSafeAreaInsets';
import { offsetFor } from './overlapOffset';
import { DraggedCardTypeProvider, useDraggedCardType } from './DraggedCardTypeContext';
import { RangeUsedProvider } from './RangeUsedContext';
import { shipRangesOnTable } from './shipRange';
import { attributesOnTableOf } from './attributesOnTable';
import { LANDED_CUE_MS, LandedRing, LandedZoneProvider, LandedZones, useLandedNonce } from './LandedZoneContext';
import { landedZoneKey } from './landedZoneKey';
import { highlightClassName, highlightState, ZoneKind } from './zoneAccepts';
import { isReleaseInCancelRadius, PressGeometry, pressGeometryFrom } from './releaseCancel';
import { cardIdOfDraggable } from './panelDragId';
import {
  DILEMMA_STACK_CHOICE_END_LABELS,
  DILEMMA_STACK_ROW_END,
  dilemmaStackRowInsertPoint,
  dilemmaStackRowSlotId,
  dilemmaStackRowTarget,
} from './dilemmaStackInsert';
import { createCenterOnPointerModifier } from './centerOnPointer';
import { useFullscreen } from './useFullscreen';
import { TapDebugOverlay, useDebugTaps } from './TapDebugOverlay';
import { useServiceWorker, type ServiceWorkerUpdate } from './useServiceWorker';
import { cardImageUrl, showCardMissing } from '../../../lib/cardImageUrl';

// A plain inline hamburger icon (#722), not react-icons: see `DownloadIcon`'s comment below for
// why a react-icons import here would need every test mock of `react-icons/fa` in this file's own
// tests, and every other test that renders this page, updated too.
function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// The four corners of a frame: pointing out to go into fullscreen, pointing in to leave it (#921).
function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      {exit ? (
        <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
      ) : (
        <path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" />
      )}
    </svg>
  );
}

// A curved arrow back to the left: the undo button (#1194).
function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

// The undo arrow, mirrored: the redo button (#1403).
function RedoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

// A page with a folded corner and lines of text: the game log button (#1399, #1448). An inline
// SVG, not react-icons, for the reason in `DownloadIcon`'s comment below.
function GameLogIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
      data-testid="game-log-icon"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

// A home for the controls that act on the whole game rather than one zone (#722): Reset, and
// Load deck (#780), which opens the Drive picker. Reset throws away the current game, so it
// confirms first via `window.confirm`, the same confirm-before-destroy pattern
// the deck builder's Drive picker (`DrivePickerModal`) already uses for a delete elsewhere in the app, rather than a custom dialog
// built just for this one destructive action. Settings & help (#1437) opens a sub-view of the
// splash in place of the item list, with Controls and Offline, and Offline (#1052, #1087) opens a
// sub-view of its own, `OfflineMenuView`. Escape and Back each go up one level: Offline, then
// Settings & help, then the item list, and Escape in the item list closes the splash.
//
// The rule for a new item (#1437): the top level holds Continue, the items a player uses during or
// between games (the deck and the game itself), and one entry, Settings & help, for everything
// else. A new item goes into Settings & help unless the player needs it in most sessions. In
// landscape the top level is a grid of two columns (#1087), so the menu fits the about 320-340 px
// a phone's browser bars leave, and every row of it is full: Continue and Settings & help span
// both columns, and the other items come in pairs, with the items that throw the game away last
// (Edit current deck and Reset). In portrait the one column keeps the same order. A sub-view opens
// in place of the item list and ends with Back. The bot game line and the update prompt show on
// the top level only.
//
// The menu opens on every load of the table (#781), so a new player sees it. It is a splash
// screen over the whole page (#896): it covers the table, so a press on the table no longer
// closes it. Continue (or Escape) closes it and shows the table. The menu button stays above the
// splash, so the player can open the splash again during a game.
//
// The splash sits above everything the table draws: the pile count badges, the open hand and the
// card list panel. At `z-40` the badges drew over the splash and took presses through it. The menu
// button rises above the splash only while it is open, so a closed menu's button stays under a
// card list panel as before. `src/lib/layers.ts` holds the order of every layer (#897).
//
// The fullscreen button (#921) sits under the menu button, in the same corner, so it adds no width
// to the bottom row. It puts the game layer into fullscreen, so every overlay above, which portals
// into the game layer, still shows. Where the browser has no Fullscreen API for a `<div>`, such as
// iPhone Safari, it shows how to add the app to the home screen instead (#1127), and it is hidden
// in an app already added to the home screen that has no Fullscreen API either.
//
// The undo button (#1194) sits under those two. It takes back the player action of the last log
// entry, and its label names that entry. It is disabled while the log is empty.
//
// The game log button (#1399) sits under the undo button, in a row of its own. It opens the game
// log, and closes the splash first if the splash is open. It was an item of the splash before.
//
// In fullscreen on an iPad the browser draws its own close X and shrink button over the top-left
// corner, so the column moves down below them, all four buttons together (#1207). Everywhere else
// it stays at `top-2`, in and out of fullscreen.
const SPLASH_ITEM_CLASS =
  'block w-full rounded-md border border-white/10 bg-bg-secondary px-6 py-2.5 text-center text-base text-text-secondary hover:bg-white/[0.1] hover:text-text-primary';

function GameMenu({
  open,
  onToggle,
  onClose,
  onReset,
  onLoadDeck,
  onEditDeck,
  editDeckDisabled,
  onDecklist,
  onGameLog,
  onControls,
  onHomeScreenHelp,
  fullscreen,
  deck,
  deckName,
  offline,
  update,
  undoLabel,
  onUndo,
  redoLabel,
  onRedo,
  undoRedoRow,
  turnScoreColumn,
  turnCounters,
  onToggleTurnCounters,
  cardText,
  onToggleCardText,
  botGame,
  botPileName,
  touch,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReset: () => void;
  onLoadDeck: () => void;
  onEditDeck: () => void;
  // Offline the deck builder does not load, so Edit current deck is disabled (#1407).
  editDeckDisabled: boolean;
  onDecklist: () => void;
  onGameLog: () => void;
  onControls: () => void;
  onHomeScreenHelp: () => void;
  fullscreen: ReturnType<typeof useFullscreen>;
  deck: DeckList;
  deckName: string;
  offline: ReturnType<typeof useOfflineDecks>;
  update: ServiceWorkerUpdate;
  // "Undo: <the last entry>", or null while the log is empty.
  undoLabel: string | null;
  onUndo: () => void;
  // "Redo: <the entry it does again>", or null while nothing is undone (#1403).
  redoLabel: string | null;
  onRedo: () => void;
  // Redo beside undo, in one row, on the full touch table, so the turn and score column below keeps
  // its place (#1403). Elsewhere redo sits under undo: the attempt layout keeps only
  // `MENU_BUTTON_GUTTER` left of the table, where a row of two would cover the first mission, and the
  // desktop keeps the look of #1403, with the turn and score column below five buttons (#1451).
  undoRedoRow: boolean;
  // The turn and score column shows below the corner buttons, on the full table of either device
  // (#1451): the corner column then takes its width, so both share one centre line (#1447).
  turnScoreColumn: boolean;
  // The counter of the turn's counters (#1607), a setting of the device, off by default.
  turnCounters: boolean;
  onToggleTurnCounters: () => void;
  // "Apply card text to attributes" (#1668), a setting of the device, off by default: the range and
  // span models of the moves.
  cardText: boolean;
  onToggleCardText: () => void;
  // A game against the dilemma bot (#1289), and the name of the bot's pile (#1520).
  botGame: boolean;
  botPileName: string;
  // The touch layout, whose corner buttons take the round look of the iPadOS close button (#1394).
  touch: boolean;
}) {
  const [view, setView] = useState<'items' | 'settings' | 'offline'>('items');
  // On the desktop full table every corner button takes the size of the next-turn button below it,
  // the full width of the column and `h-7` (#1497), so the column has one width; `controlsColumnTop`
  // counts them at `DESKTOP_CORNER_BUTTON`. Touch keeps the round 24 px buttons, and the attempt
  // layout, with only `MENU_BUTTON_GUTTER` left of the attempt body, the small icons.
  const wideButtons = !touch && turnScoreColumn;
  const cornerButton = touch
    ? 'btn-system w-6 h-6 text-xs'
    : wideButtons
      ? 'btn-icon w-full h-7'
      : 'btn-icon btn-icon-sm';
  // The splash opens on the item list every time: the view goes back to the list when it closes,
  // adjusted during render on the change of `open`.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setView('items');
  }

  useEscapeLayer(() => {
    if (view === 'offline') setView('settings');
    else if (view === 'settings') setView('items');
    else onClose();
  }, open);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game menu"
          data-testid="game-menu-splash"
          className={`fixed inset-0 ${LAYER_MENU_SPLASH} flex flex-col items-center justify-center bg-[#131713]/95 px-8`}
          // Clear of the safe-area insets (#1384): the backdrop stays full-bleed, the items move in.
          style={{
            paddingTop: SAFE_INSET_CSS.top,
            paddingRight: `calc(2rem + ${SAFE_INSET_CSS.right})`,
            paddingBottom: SAFE_INSET_CSS.bottom,
            paddingLeft: `calc(2rem + ${SAFE_INSET_CSS.left})`,
          }}
        >
          {view === 'offline' ? (
            <div className="flex max-h-full w-full max-w-[16rem] flex-col gap-2 overflow-y-auto landscape:max-w-[24rem]">
              <OfflineMenuView
                deck={deck}
                deckName={deckName}
                offline={offline}
                itemClassName={SPLASH_ITEM_CLASS}
                onBack={() => setView('settings')}
              />
            </div>
          ) : view === 'settings' ? (
            <div
              data-testid="game-menu-settings"
              className="flex max-h-full w-full max-w-[16rem] flex-col gap-2 overflow-y-auto"
            >
              <button type="button" onClick={onControls} className={SPLASH_ITEM_CLASS}>
                Controls
              </button>
              <button
                type="button"
                onClick={onToggleTurnCounters}
                aria-pressed={turnCounters}
                data-testid="game-menu-turn-counters"
                className={SPLASH_ITEM_CLASS}
              >
                Counters: {turnCounters ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={onToggleCardText}
                aria-pressed={cardText}
                data-testid="game-menu-card-text-attributes"
                className={SPLASH_ITEM_CLASS}
              >
                Apply card text to attributes: {cardText ? 'On' : 'Off'}
              </button>
              <button type="button" onClick={() => setView('offline')} className={SPLASH_ITEM_CLASS}>
                {offlineItemLabel(offline.progress)}
              </button>
              <button type="button" onClick={() => setView('items')} className={SPLASH_ITEM_CLASS}>
                Back
              </button>
            </div>
          ) : (
            <div className="grid w-full max-w-[16rem] grid-cols-1 gap-2 landscape:max-w-[28rem] landscape:grid-cols-2">
              {botGame && (
                <p data-testid="game-menu-bot-game" className="text-center text-sm text-text-secondary landscape:col-span-2">
                  {deckName} vs the bot ({botPileName})
                </p>
              )}
              {update.updateReady && (
                <div
                  role="status"
                  data-testid="update-prompt"
                  className="flex items-center gap-2 rounded-md border border-accent/50 bg-bg-secondary px-3 py-2 text-sm text-text-primary landscape:col-span-2"
                >
                  <span className="flex-1">A new version of Webula is available</span>
                  <button
                    type="button"
                    onClick={update.reload}
                    disabled={update.reloading}
                    className="btn-primary inline-flex items-center gap-1.5 disabled:cursor-wait disabled:opacity-70"
                  >
                    {update.reloading ? (
                      <>
                        <span
                          aria-hidden="true"
                          data-testid="update-reload-spinner"
                          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                        Reloading…
                      </>
                    ) : (
                      'Reload'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={update.dismiss}
                    disabled={update.reloading}
                    className="rounded-md px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:cursor-wait disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {/* A playtester's device, signed out (#1660). */}
              <PlaytestSignInHint className="justify-center rounded-md border border-amber-700 bg-amber-900/60 px-3 py-2 text-center text-sm text-amber-100 landscape:col-span-2" />
              <button type="button" onClick={onClose} className={`${SPLASH_ITEM_CLASS} landscape:col-span-2`}>
                Continue
              </button>
              <button type="button" onClick={onDecklist} className={SPLASH_ITEM_CLASS}>
                Decklist
              </button>
              <button type="button" onClick={onLoadDeck} className={SPLASH_ITEM_CLASS}>
                Load deck
              </button>
              <button
                type="button"
                onClick={onEditDeck}
                disabled={editDeckDisabled}
                data-testid="game-menu-edit-deck"
                className={`${SPLASH_ITEM_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                Edit current deck
              </button>
              <button type="button" onClick={onReset} className={SPLASH_ITEM_CLASS}>
                Reset
              </button>
              <button
                type="button"
                onClick={() => setView('settings')}
                data-testid="game-menu-settings-item"
                className={`${SPLASH_ITEM_CLASS} landscape:col-span-2`}
              >
                {settingsItemLabel(offline.progress)}
              </button>
            </div>
          )}
        </div>
      )}
      <div
        data-testid="corner-buttons"
        className={`absolute ${
          fullscreen.isFullscreen && fullscreen.systemControlsInset ? 'top-14' : 'top-2'
        } left-2 flex flex-col items-center gap-1 ${
          turnScoreColumn ? 'pointer-events-none *:pointer-events-auto' : ''
        } ${open ? LAYER_MENU_BUTTON_OPEN : LAYER_MENU_BUTTON}`}
        // On the full table the column is as wide as the turn and score column below it, and
        // `items-center` centres every button and the undo and redo row on the centre line of that
        // column (#1447, #1451); its empty sides take no taps. On a desktop the buttons fill that
        // width, as the next-turn button does (#1497). In the attempt layout it is as wide as its
        // widest child.
        // Below the top safe-area inset and right of the left one (#1384), on top of `top-14`.
        style={{
          ...(turnScoreColumn ? { width: CONTROLS_COLUMN_WIDTH } : {}),
          ...safeAreaMargins('top', 'left'),
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Game menu"
          aria-expanded={open}
          aria-describedby={update.updateReady ? 'update-dot' : undefined}
          className={`${cornerButton} relative`}
        >
          <MenuIcon />
          {/* A new build has taken control (#1104): the prompt waits in the menu, so it never covers the table. */}
          {update.updateReady && (
            <span
              id="update-dot"
              data-testid="update-dot"
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent-light ring-2 ring-[#131713]"
            >
              <span className="sr-only">A new version is available</span>
            </span>
          )}
        </button>
        {/* In fullscreen on iPadOS the system's close X exits, so the table shows no second control (#1394). */}
        {fullscreen.mode !== 'none' && !fullscreen.systemExitControl && (
          <button
            type="button"
            onClick={fullscreen.mode === 'fullscreen' ? fullscreen.toggle : onHomeScreenHelp}
            aria-label={
              fullscreen.mode === 'homeScreen'
                ? 'How to add to the home screen'
                : fullscreen.isFullscreen
                  ? 'Exit fullscreen'
                  : 'Enter fullscreen'
            }
            aria-pressed={fullscreen.mode === 'fullscreen' ? fullscreen.isFullscreen : undefined}
            data-testid="fullscreen-button"
            className={cornerButton}
          >
            <FullscreenIcon exit={fullscreen.isFullscreen} />
          </button>
        )}
        <div
          data-testid="undo-redo"
          className={`flex gap-1 ${undoRedoRow ? 'flex-row' : 'flex-col'} ${wideButtons ? 'self-stretch' : ''}`}
        >
          <button
            type="button"
            onClick={onUndo}
            disabled={!undoLabel}
            aria-label={undoLabel ?? 'Undo'}
            title={undoLabel ?? 'Nothing to undo'}
            data-testid="undo-button"
            className={`${cornerButton} disabled:cursor-default disabled:opacity-40`}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!redoLabel}
            aria-label={redoLabel ?? 'Redo'}
            title={redoLabel ?? 'Nothing to redo'}
            data-testid="redo-button"
            className={`${cornerButton} disabled:cursor-default disabled:opacity-40`}
          >
            <RedoIcon />
          </button>
        </div>
        <button
          type="button"
          onClick={onGameLog}
          aria-label="Game log"
          title="Game log"
          data-testid="game-log-button"
          className={cornerButton}
        >
          <GameLogIcon />
        </button>
      </div>
    </>
  );
}

// Issue #1337: the turn and score controls of the full table, in the column left of the mission row
// (`TOUCH_CONTROLS_COLUMN`), below the corner buttons: the turn over the next-turn button, then the
// score over minus and plus. A desktop shows the same column, in the look of its corner buttons
// (#1451). They are table content, not part of `corner-buttons`, so a card list
// panel and the hand arc cover them as they covered the counters of the bottom row. `compact`
// (`turnScoreColumnCompact`) hides the labels and draws smaller buttons.
// The content column's `p-4`, grown by the safe-area insets (#1383, #1384): only the sides with an
// inset get an inline padding, so the DOM is unchanged where every inset is 0.
function contentPadding(insets: SafeAreaInsets): React.CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (insets.top > 0) style.paddingTop = `calc(1rem + ${insets.top}px)`;
  if (insets.right > 0) style.paddingRight = `calc(1rem + ${insets.right}px)`;
  if (insets.bottom > 0) style.paddingBottom = `calc(1rem + ${insets.bottom}px)`;
  if (insets.left > 0) style.paddingLeft = `calc(1rem + ${insets.left}px)`;
  return Object.keys(style).length > 0 ? style : undefined;
}

// The left edge of the column, `left-2`, and its width, which stops 4 px short of the mission row.
const CONTROLS_COLUMN_LEFT = 8; // px
const CONTROLS_COLUMN_WIDTH = 16 + TOUCH_CONTROLS_COLUMN - CONTROLS_COLUMN_LEFT - 4; // px
// Below the corner buttons (24 px each, 4 px apart) at `top-2`, or at `top-14` with the inset, and
// 8 px clear of them. The column counts four buttons (#1399), or three in fullscreen on iPadOS, where the
// system's close X stands in for the fullscreen button (#1394). A desktop stacks redo under undo, so it
// counts five (#1451), each as tall as the next-turn button, 28 px (`h-7`, #1497). A column with no fullscreen button
// still counts four, so the turn and score do not jump when the button shows after hydration. Like the corner buttons, the column moves in by the top and the left safe-area insets (#1384).
const CORNER_BUTTON = 24; // px, `w-6 h-6` on touch
const DESKTOP_CORNER_BUTTON = 28; // px, `h-7` on the desktop full table
const CORNER_BUTTON_GAP = 4; // px
function controlsColumnTop(cornerButtons: number, systemControlsInset: boolean, desktop: boolean): number {
  const height = desktop ? DESKTOP_CORNER_BUTTON : CORNER_BUTTON;
  const buttons = cornerButtons * height + (cornerButtons - 1) * CORNER_BUTTON_GAP;
  return (systemControlsInset ? 56 : 8) + buttons + 8;
}

// The short names of the segments of a turn in the column (#1605), and what a tap of the next-turn
// button does from each.
const TURN_SEGMENT_NAMES: Record<TurnSegment, string> = { playAndDraw: 'Play', orders: 'Orders', discard: 'Discard' };
const ADVANCE_LABELS: Record<ReturnType<typeof nextSegmentOf>, string> = {
  playAndDraw: 'Next turn',
  orders: 'Go to orders',
  discard: 'Go to discard',
  nextTurn: 'Next turn',
};

function TurnScoreColumn({
  turn,
  segment,
  next,
  score,
  onNextTurn,
  onAdjustScore,
  compact,
  top,
  touch,
  counters,
  onOpenCounters,
}: {
  turn: number;
  segment: TurnSegment;
  // `nextSegmentOf` the table: what a tap of the next-turn button does.
  next: ReturnType<typeof nextSegmentOf>;
  score: number;
  onNextTurn: () => void;
  onAdjustScore: (delta: number) => void;
  // `turnScoreColumnCompact`.
  compact: boolean;
  // `controlsColumnTop`.
  top: number;
  // The round `btn-system` look of the touch corner buttons, or the desktop's `btn-icon` (#1451).
  touch: boolean;
  // The counters of the turn (#1607), or null while the game menu's setting is off.
  counters: TurnCounters | null;
  onOpenCounters: () => void;
}) {
  const label = compact ? 'sr-only' : 'block text-[10px] uppercase tracking-wide leading-3 text-text-muted';
  const number = compact ? 'text-sm leading-5 font-semibold' : 'text-lg leading-6 font-semibold';
  const look = touch ? 'btn-system' : 'btn-icon';
  const button = `${look} w-full ${compact ? 'h-6 text-xs' : 'h-7'} disabled:opacity-50 disabled:cursor-not-allowed`;
  return (
    <div
      data-testid="turn-score-column"
      className="absolute flex flex-col gap-2"
      style={{
        left: CONTROLS_COLUMN_LEFT,
        top,
        width: CONTROLS_COLUMN_WIDTH,
        ...safeAreaMargins('top', 'left'),
      }}
    >
      {/* One button shows the turn and advances it (#1449), through the segments of the turn (#1605).
          The visible label sits above it, and `turn-counter` keeps a screen-reader "Turn" of its own,
          so its text still reads "Turn N". The segment's name shows under it, in compact too. */}
      <div className="flex flex-col items-center gap-1">
        <span className={label} aria-hidden="true">
          Turn
        </span>
        {/* The counter of the turn shares the row of the next-turn button (#1607). */}
        <div className="flex w-full items-center gap-1">
          <button
            className={`${button} flex min-w-0 flex-1 items-center justify-center ${counters ? 'gap-0.5' : 'gap-1'}`}
            onClick={onNextTurn}
            aria-label={ADVANCE_LABELS[next]}
            title={ADVANCE_LABELS[next]}
          >
            <span data-testid="turn-counter" className="text-text-primary">
              <span className="sr-only">Turn </span>
              <span className={compact ? 'text-xs font-semibold' : 'text-sm font-semibold'}>{turn}</span>
            </span>
            <FaForward className={`shrink-0 ${counters ? 'text-[10px]' : ''}`} />
          </button>
          {counters && <TurnCounterButton counters={counters} segment={segment} className={button} onOpen={onOpenCounters} />}
        </div>
        <span data-testid="turn-segment" data-segment={segment} className="block text-[10px] leading-3 text-text-secondary">
          {TURN_SEGMENT_NAMES[segment]}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div data-testid="score-counter" className="text-center text-text-primary">
          <span className={label}>Score</span> <span className={number}>{score}</span>
        </div>
        <div className="flex w-full items-center gap-1">
          <button
            className={button}
            onClick={() => onAdjustScore(-SCORE_STEP)}
            disabled={score <= SCORE_MIN}
            aria-label="Decrease score"
          >
            -
          </button>
          <button
            className={button}
            onClick={() => onAdjustScore(SCORE_STEP)}
            disabled={score >= SCORE_MAX}
            aria-label="Increase score"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// The localStorage key of the counter's setting (#1607).
export const TURN_COUNTERS_KEY = 'practice-turn-counters';

// The localStorage key of the setting "Apply card text to attributes" (#1668).
export const CARD_TEXT_ATTRIBUTES_KEY = 'practice-card-text-attributes';

function RotateDeviceOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-[#131713] flex flex-col items-center justify-center gap-4 text-text-primary">
      <FaMobileAlt className="text-6xl text-text-muted" style={{ transform: 'rotate(90deg)' }} />
      <p className="text-xl font-display font-medium">Rotate your device</p>
      <p className="text-sm text-text-muted text-center px-8">
        Rotate your device to landscape to use Practice Draw
      </p>
    </div>
  );
}

const DISCARD_DROPPABLE_ID = 'discard';

// Flat, top-level drop zones (#603 adds the core and the brig alongside the discard pile; #644
// adds the hand and the dilemma hand): each one's `useDroppable` id is just its own zone name
// (`FlatCardRow`, `DiscardPile`, `CardHand`'s closed row), so a drop on any of them dispatches
// the same `move` straight to that zone, for any card type — the zone rules in `zoneAccepts.ts`
// are advisory highlights only, same as every other flat zone here. The dilemma pile is a flat
// zone too, but not one of these: it has two drop targets of its own, the top half and the
// bottom half of `DilemmaPileButton`, handled separately below (#607) — it replaces the single
// whole-card `dilemmaPile` droppable #605 added, which only ever appended to the bottom.
// #630: the dilemma stack joins this list too — a single whole-card droppable, appending to the
// bottom, the same as the other zones here, unlike the dilemma pile's own top/bottom halves.
// #1369: the dilemma stack is the one zone of this list whose rule is not advisory: like the ship
// row (#886), it takes only a dilemma, so its highlight and its routing agree.
const FLAT_DROP_ZONES: readonly Zone[] = [DISCARD_DROPPABLE_ID, 'core', 'brig', 'hand', 'dilemmaHand', 'dilemmaStack'];

// The dilemma pile's two drop targets (#607): a drop on the top half puts the card first in
// `dilemmaPile` (drawn next); a drop on the bottom half puts it last, matching the pile's older,
// single-droppable behaviour. Both ids follow the kebab-case pattern `missionHalfDropId`/
// `shipRowDropId` already use.
const DILEMMA_PILE_TOP_DROPPABLE_ID = 'dilemma-pile-top';
const DILEMMA_PILE_BOTTOM_DROPPABLE_ID = 'dilemma-pile-bottom';

// The draw deck's own two drop targets (#743), the same top/bottom split as the dilemma pile
// above: a drop on the top half puts the card first in `drawDeck` (drawn next), the bottom half
// puts it last. Unlike the dilemma pile, the draw deck accepts every card type, not only one.
const DRAW_PILE_TOP_DROPPABLE_ID = 'draw-pile-top';
const DRAW_PILE_BOTTOM_DROPPABLE_ID = 'draw-pile-bottom';

function dilemmaPileHalfFromDropId(id: string): 'top' | 'bottom' | null {
  if (id === DILEMMA_PILE_TOP_DROPPABLE_ID) return 'top';
  if (id === DILEMMA_PILE_BOTTOM_DROPPABLE_ID) return 'bottom';
  return null;
}

function drawPileHalfFromDropId(id: string): 'top' | 'bottom' | null {
  if (id === DRAW_PILE_TOP_DROPPABLE_ID) return 'top';
  if (id === DRAW_PILE_BOTTOM_DROPPABLE_ID) return 'bottom';
  return null;
}

// Resolves a single dropped card's destination, the same routing `handleDragEnd` always used,
// pulled out into its own function so a multi-card drag (#677) can run it once per card in the
// dragged group, each keyed off that card's own type rather than one shared "the dragged card" —
// a mixed-type group (say, a ship dropped on a mission alongside personnel) still sends the ship
// to the ship row and the personnel to the personnel pile, same as dragging each one on its own.
// Returns null for a card the drop target does not accept (matching the old early-return-less
// fallthrough): that card stays where it was.
function computeMoveTargetForInstance(
  over: DragEndEvent['over'],
  instance: CardInstance,
  table: TableState,
  armedTargetId: string | null = null
): MoveTarget | null {
  if (!over) return null;

  if (FLAT_DROP_ZONES.includes(String(over.id) as Zone)) {
    if (over.id === 'dilemmaStack' && instance.card.type !== 'dilemma') return null;
    return over.id as Zone;
  }

  if (dilemmaPileHalfFromDropId(String(over.id))) {
    return 'dilemmaPile';
  }

  if (drawPileHalfFromDropId(String(over.id))) {
    return 'drawDeck';
  }

  // A drop on a card in the core or the brig places the card on it (#810), once a hold over that
  // card has armed it (#1029). Any other drop on the card, and a drop of a card on its own
  // droppable, such as one the pointer barely moved, goes to the zone the card sits in, the same
  // as a drop on that zone off any card.
  const targetId = targetIdFromOnDropId(String(over.id));
  if (targetId) {
    if (targetId === instance.id || targetId !== armedTargetId) {
      const targetLocation = findInstanceAnywhere(table, targetId);
      return targetLocation && typeof targetLocation.zone === 'string' && targetLocation.zone !== 'missions'
        ? targetLocation.zone
        : null;
    }
    return { zone: 'on', targetId };
  }

  // A personnel or an equipment dropped on a ship boards its crew (#893): the rules have no place
  // "on a ship" for either. Any other card dropped on the ship is placed on it (#812), the same as
  // a drop on a card in the core or the brig (#810).
  // The rows of the attempting personnel (#1165) route as the target each one stands for: the crew
  // row as the ship's art, the away team row as the mission's bottom half.
  const shipId = shipIdFromAttemptCrewDropId(String(over.id)) ?? shipIdFromCrewDropId(String(over.id));
  if (shipId) {
    if (instance.card.type === 'ship') {
      // A ship dropped on a ship is neither crew nor placed on it (#668): the ship already on the
      // row covers almost the whole row, so a second ship's drop lands here instead of on the row
      // itself. Route it to that same ship's own row, the row the drop was clearly aimed at,
      // instead of leaving the dragged ship stuck where it started.
      const shipLocation = findInstanceAnywhere(table, shipId);
      if (shipLocation && typeof shipLocation.zone === 'object' && shipLocation.zone.zone === 'shipRow') {
        return { zone: 'shipRow', missionIndex: shipLocation.zone.missionIndex };
      }
      return null;
    }
    if (instance.card.type === 'personnel' || instance.card.type === 'equipment') {
      return { zone: 'crew', shipId };
    }
    return { zone: 'on', targetId: shipId };
  }

  const awayTeamIndex = missionIndexFromAttemptAwayTeamDropId(String(over.id));
  const missionIndex = awayTeamIndex ?? missionIndexFromDropId(String(over.id));
  if (missionIndex !== null) {
    if (instance.card.type === 'ship') {
      return { zone: 'shipRow', missionIndex };
    }
    // The ship row holds ships (#886), the same rule `ZONE_ACCEPTS` highlights: any other card
    // dropped on the bare row, off any ship, stays where it was.
    const half = awayTeamIndex !== null ? 'on' : missionHalfFromDropId(String(over.id));
    if (!half) return null;
    if (instance.card.type === 'dilemma') {
      // A dilemma dropped on the top half of a mission card is placed on it (#871). Dropped on the
      // bottom half, or on a slot with no mission card, it lands under that mission (#606, #733),
      // whatever zone it came from.
      const mission = table.missions[missionIndex]?.mission;
      if (half === 'on' && mission) {
        return { zone: 'on', targetId: mission.id };
      }
      return { zone: 'missionPile', missionIndex, pile: 'underMission' };
    }
    // A personnel or an equipment dropped on the mission card (#870) files into the mission's
    // away team.
    if (instance.card.type === 'personnel' || instance.card.type === 'equipment') {
      return { zone: 'missionPile', missionIndex, pile: 'awayTeam' };
    }
    // Any other card dropped on the mission is placed on the mission card (#813): the cards on it
    // are the events at that mission, so a slot has no event pile.
    const mission = table.missions[missionIndex]?.mission;
    if (mission) return { zone: 'on', targetId: mission.id };
  }

  return null;
}

// The zones whose panel `openFlatLocation` tracks: the core and the brig (#640), the draw deck and the
// dilemma pile (#690), the dilemma stack (#733), and the discard pile (#782).
type FlatPanelLocation = 'core' | 'brig' | 'drawDeck' | 'dilemmaPile' | 'dilemmaStack' | 'discard';

// The two piles whose panel has a Download button (#827), each with the hand its cards go to.
// The same two piles are the ones the table's Shuffle buttons shuffle (`shufflePile`).
const DOWNLOAD_HAND = { drawDeck: 'hand', dilemmaPile: 'dilemmaHand' } as const;
type DownloadPile = keyof typeof DOWNLOAD_HAND;
// The deck each hand's "→ top" and "→ bottom" buttons send its selected cards to (#994).
const HAND_DECK = { hand: 'drawDeck', dilemmaHand: 'dilemmaPile' } as const;
const isDownloadPile = (location: FlatPanelLocation): location is DownloadPile => location in DOWNLOAD_HAND;

// The discard pile's top card, draggable off the pile (#606 review): a dilemma dragged from here
// onto a mission card lands under that mission, since its source is not the dilemma hand (see
// `handleDragEnd`'s dilemma routing below). A separate component, mounted only while a top card
// exists, keeps `useDraggable`'s hook call (and so its registration order, which the mock
// `@dnd-kit/core` in the test suite relies on) tied to the card's own presence, the same as
// `CardListPanelCard` and `CardHand`'s cards.
// A tap on it opens the discard pile's own panel (#782), which lists every card in the pile.
function DiscardPileCard({
  topCard,
  count,
  landedNonce,
  onOpen,
  rowScale,
}: {
  topCard: CardInstance;
  count: number;
  landedNonce: number | null;
  onOpen: () => void;
  rowScale: number;
}) {
  const cardWidth = pileCardSize(rowScale).width;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: topCard.id });

  return (
    <div
      ref={setNodeRef}
      data-card-id={topCard.id}
      className="relative touch-none"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <img
        src={cardImageUrl(topCard.card)}
        onError={showCardMissing}
        width={120}
        height={167}
        alt="Discard pile"
        className={`rounded-lg shadow-lg h-auto ${topCard.removedFromGame ? STOPPED_IMAGE_CLASSNAME : ''}`}
        style={{ ...cardBorderStyle(cardWidth), width: cardWidth }}
      />
      {/* A top card removed from the game (#1564) shows the look of the panel's card. */}
      {topCard.removedFromGame && <RemovedFromGameLabel />}
      <CountBadge count={count} landedNonce={landedNonce} />
    </div>
  );
}

function DiscardPile({
  topCard,
  count,
  onOpen,
  rowScale = 1,
}: {
  topCard: CardInstance | undefined;
  count: number;
  onOpen: () => void;
  // The bottom-row scale (`computeBottomRowScale`, #1465).
  rowScale?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DISCARD_DROPPABLE_ID });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('discard', draggedType, isOver);
  const landedNonce = useLandedNonce('discard');

  // A ring shows that the discard pile accepts the card under the pointer (`isOver`), or accepts
  // the dragged card's type generally (`valid`, #608).
  return (
    <div
      ref={setNodeRef}
      data-zone="discard"
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative flex flex-col items-center gap-1 rounded-lg ${highlightClassName(highlight)}`}
    >
      <LandedRing nonce={landedNonce} />
      {topCard ? (
        <DiscardPileCard topCard={topCard} count={count} landedNonce={landedNonce} onOpen={onOpen} rowScale={rowScale} />
      ) : (
        <div
          style={pileCardSize(rowScale)}
          className="rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1"
        >
          Discard
        </div>
      )}
    </div>
  );
}

// One half of a pile's two drop targets — the dilemma pile's (#607) or the draw deck's (#743):
// the top half puts a dropped card first in the pile (drawn next), the bottom half puts it last.
// Each half is its own `<button>`, the same sibling-not-nested pattern `PileBadge`
// (`MissionRow.tsx`) already uses to combine a tap control and a droppable without nesting one
// button inside another — here the two halves sit as absolutely positioned siblings over the
// shared, non-interactive card art in `DilemmaPileButton`/`DrawPileButton` below, each covering
// exactly half its height and the full width, so both halves together cover the whole card and
// neither changes the card's footprint. A tap on either half draws, same as tapping anywhere on
// the old single button; `disabled` here only stops the tap (`useDroppable`'s geometry, and so a
// drop, works on a disabled button same as an enabled one, #607 review). With no `onDraw` (the
// dilemma pile, #1223) a tap draws nothing, and the half is only a drop target.
function PileHalf({
  dropId,
  label,
  position,
  count,
  onDraw,
  showLabel,
  zoneKind,
  pileName,
}: {
  dropId: string;
  label: string;
  position: 'top' | 'bottom';
  count: number;
  onDraw?: () => void;
  showLabel: boolean;
  zoneKind: ZoneKind;
  pileName: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zoneKind, draggedType, isOver);

  return (
    <button
      ref={setNodeRef}
      data-zone={dropId}
      data-highlight={highlight}
      onClick={onDraw}
      disabled={count === 0}
      aria-label={onDraw ? `${pileName} ${position}, tap to draw` : `${pileName} ${position}`}
      className={`absolute inset-x-0 ${position === 'top' ? 'top-0' : 'bottom-0'} h-1/2 focus:outline-hidden disabled:cursor-not-allowed ${highlightClassName(
        highlight
      )} ${position === 'top' ? 'rounded-t-lg' : 'rounded-b-lg'}`}
    >
      {showLabel && isOver && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white bg-black/60 rounded">
          {label}
        </span>
      )}
    </button>
  );
}

// A plain inline magnifying-glass icon (#690), not react-icons: every test that renders this
// page mocks `react-icons/fa` with an explicit list of the icons this file imports, so a new
// react-icons import here would need every one of those mocks updated too — the same reasoning
// `CardListPanel.tsx`'s own `ShuffleIcon` documents.
// The glyph fills the same 2–22 box, centred on 12, as `ShuffleIcon`'s (#901): the two sit side
// by side above each pile, and a smaller, off-centre magnifier made the pair look unequal.
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15" y2="15" />
    </svg>
  );
}

// A download trigger for the draw pile or the dilemma pile (#690): opens that pile's own
// `CardListPanel` so the player can look through every card in it — face up, in its existing order —
// and drag one straight into hand, or select several and press the panel's Download button (#827),
// without drawing through the rest of the pile. Kept apart from
// the pile's own tap-to-draw click (`onClick` on the draw-pile button, `DilemmaPileButton`'s two
// drop/draw halves), rather than layered on top of the pile art, so it never steals a tap meant
// for drawing, or a drop meant for the dilemma pile's top/bottom halves — the same
// "control sits beside the card, not nested on top of it" reasoning `PileBadge`/`ShipCrewBadge`
// (`MissionRow.tsx`) already follow. Disabled, like the pile's own draw control, once the pile is
// empty: there is nothing left to download.
// The three buttons of `PileControls` overlap the pile's edge, so they are opaque (#1077): the
// tint of `.btn-icon` would let the card back show through. The hover colour is opaque too,
// because `.btn-icon:hover` would otherwise paint its own translucent tint over the rest colour.
const PILE_CONTROL_CLASS = 'btn-icon btn-icon-sm bg-bg-raised hover:bg-[#323832]';

function DownloadPileButton({ label, count, onOpen }: { label: string; count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={count === 0}
      aria-label={`Download from the ${label}`}
      className={`${PILE_CONTROL_CLASS} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <DownloadIcon />
    </button>
  );
}

// The three controls of the draw deck or the dilemma pile (#1070): Shuffle, Download and the eye
// that opens the reveal panel of the pile's top cards, from top to bottom. They stand in a column
// that overlaps the pile's left edge by a third of a button (`-mr-2`), rather than in a row
// above the pile: three buttons in a row do not fit above a pile at the narrowest phone width.
// The column is a sibling of the pile, not a child of its draggable or its drop halves, and
// `z-10` paints it above them, so a tap on a button never draws and never starts a drag (the
// same "control beside, not nested" rule `DownloadPileButton` follows). The buttons are opaque
// (`PILE_CONTROL_CLASS`, #1077), so the card back under the overlap does not show through them.
function PileControls({
  label,
  shuffleLabel,
  count,
  onShuffle,
  onDownload,
  onReveal,
}: {
  label: string;
  shuffleLabel: string;
  count: number;
  onShuffle: () => void;
  onDownload: () => void;
  onReveal: () => void;
}) {
  return (
    <div data-testid="pile-controls" className="relative z-10 -mr-2 flex flex-col gap-1">
      <button className={PILE_CONTROL_CLASS} onClick={onShuffle} aria-label={shuffleLabel}>
        <ShuffleIcon />
      </button>
      <DownloadPileButton label={label} count={count} onOpen={onDownload} />
      {/* A tap opens the reveal panel and draws nothing. Disabled, like Download, once the pile
          is empty. */}
      <button
        type="button"
        onClick={onReveal}
        disabled={count === 0}
        aria-label={`Reveal the ${label}`}
        className={`${PILE_CONTROL_CLASS} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <RevealIcon className="w-3 h-3" />
      </button>
    </div>
  );
}

// The face-down card art of the draw pile or the dilemma pile, animated when the pile's Shuffle
// button runs (#786): a shuffle changes nothing visible, so without it the player cannot tell
// the tap did anything. `shuffleCount` is the `key`, so each tap remounts the wrapper and
// restarts the animation rather than queueing one. The wrapper is absolutely positioned and
// animates only `transform` (or, under `prefers-reduced-motion`, a still ring), so the pile keeps
// its size and position, and `pointer-events-none` leaves every tap and drop to the `PileHalf`s.
function PileArt({ alt, shuffleCount, cardWidth }: { alt: string; shuffleCount: number; cardWidth: number }) {
  return (
    <div
      key={shuffleCount}
      data-testid="pile-art"
      data-shuffled={shuffleCount > 0 ? 'true' : undefined}
      className={`pointer-events-none absolute inset-0 rounded-lg ${
        shuffleCount > 0 ? 'motion-safe:animate-pile-shuffle motion-reduce:animate-pile-shuffle-ring' : ''
      }`}
    >
      <img
        src="/cardimages/cardback.jpg"
        width={120}
        height={167}
        alt={alt}
        className="rounded-lg shadow-lg group-hover:shadow-accent/30 transition-shadow w-full h-full object-cover"
        style={cardBorderStyle(cardWidth)}
      />
    </div>
  );
}

// A card of an away team is face down by default, so its preview shows no "Face down" badge (#964).
const isAwayTeamZone = (zone: TableZone): boolean =>
  typeof zone === 'object' && zone.zone === 'missionPile' && zone.pile === 'awayTeam';

// The top card of the draw pile or the dilemma pile, draggable off the pile art (#814), the same
// "mounted only while a top card exists" pattern `DiscardPileCard` above uses. The two `PileHalf`
// buttons cover the whole art, so this component wraps them rather than sitting under them: a
// press on either half bubbles up to the drag listeners here, while the half still gets its own
// tap (the `PointerSensor`'s 8 px activation constraint starts no drag for a tap) and its own drop
// (dnd-kit finds a droppable by its rect, not by a pointer event). The node takes no transform:
// the `DragOverlay` carries the pile's card back under the pointer instead (`showBack`), since
// the card is face down.
function PileTopCardDrag({ topCard, children }: { topCard: CardInstance; children: React.ReactNode }) {
  const { listeners, setNodeRef } = useDraggable({ id: topCard.id, data: { showBack: true } });

  return (
    <div ref={setNodeRef} data-card-id={topCard.id} className="absolute inset-0 touch-none" {...listeners}>
      {children}
    </div>
  );
}

// The dilemma pile (#604): a tap draws its top card into the dilemma hand. It is also a drop
// target: dropping any card on its top half puts it first in the pile (drawn next), dropping on
// its bottom half puts it last (#607, replacing #605's single whole-card droppable, which only
// ever appended to the bottom). Only a dragged dilemma shows the "Top"/"Bottom" label; a drop of
// any other card type is still accepted on either half (the same advisory-zone convention every
// other flat zone follows), with only the generic `isOver` ring.
// The wrapper's `data-pile-count` holds the pile's size even when it is 0 and the `CountBadge` is
// gone, so `scripts/practice_drag.sh` can tell a card dropped to the bottom of the pile, which
// leaves the DOM, from one that went nowhere (#1025). `DrawPileButton` does the same.
function DilemmaPileButton({
  count,
  topCard,
  showPositionLabel,
  shuffleCount,
  rowScale = 1,
}: {
  count: number;
  topCard: CardInstance | undefined;
  showPositionLabel: boolean;
  shuffleCount: number;
  // The bottom-row scale (`computeBottomRowScale`, #1465).
  rowScale?: number;
}) {
  const size = pileCardSize(rowScale);
  const landedNonce = useLandedNonce('dilemmaPile');
  const halves = (
    <>
      <PileHalf
        dropId={DILEMMA_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        showLabel={showPositionLabel}
        zoneKind="dilemmaPile"
        pileName="Dilemma pile"
      />
      <PileHalf
        dropId={DILEMMA_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        showLabel={showPositionLabel}
        zoneKind="dilemmaPile"
        pileName="Dilemma pile"
      />
    </>
  );
  return (
    <div
      className={`relative rounded-lg group ${count === 0 ? 'opacity-50' : ''}`}
      style={size} data-testid="dilemma-pile"
      data-pile-count={count}
      data-landed={landedNonce !== null || undefined}
    >
      <LandedRing nonce={landedNonce} />
      {count > 0 ? (
        <>
          <PileArt alt="Face-down dilemma pile" shuffleCount={shuffleCount} cardWidth={size.width} />
          <CountBadge count={count} landedNonce={landedNonce} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
          Dilemma
        </div>
      )}

      {topCard ? <PileTopCardDrag topCard={topCard}>{halves}</PileTopCardDrag> : halves}
    </div>
  );
}

// The draw pile (#743): the same top/bottom drop-half split the dilemma pile above uses, wired
// to the `pile` zone rather than `dilemmaPile`. Unlike the dilemma pile, the draw pile accepts
// every card type — so `showPositionLabel` gates only on whether any drag is in progress at all,
// not on the dragged card's type, and the halves' zone kind (`zoneAccepts.ts`) accepts every
// type too. A tap on either half still draws, same as the single button this replaces.
function DrawPileButton({
  count,
  topCard,
  onDraw,
  showPositionLabel,
  shuffleCount,
  rowScale = 1,
}: {
  count: number;
  topCard: CardInstance | undefined;
  onDraw: () => void;
  showPositionLabel: boolean;
  shuffleCount: number;
  // The bottom-row scale (`computeBottomRowScale`, #1465).
  rowScale?: number;
}) {
  const size = pileCardSize(rowScale);
  const landedNonce = useLandedNonce('drawDeck');
  const halves = (
    <>
      <PileHalf
        dropId={DRAW_PILE_TOP_DROPPABLE_ID}
        label="Top"
        position="top"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="drawDeck"
        pileName="Draw deck"
      />
      <PileHalf
        dropId={DRAW_PILE_BOTTOM_DROPPABLE_ID}
        label="Bottom"
        position="bottom"
        count={count}
        onDraw={onDraw}
        showLabel={showPositionLabel}
        zoneKind="drawDeck"
        pileName="Draw deck"
      />
    </>
  );
  return (
    <div
      className={`relative rounded-lg group ${count === 0 ? 'opacity-50' : ''}`}
      style={size}
      data-testid="draw-pile"
      data-pile-count={count}
      data-landed={landedNonce !== null || undefined}
    >
      <LandedRing nonce={landedNonce} />
      {count > 0 ? (
        <>
          <PileArt alt="Face-down draw deck" shuffleCount={shuffleCount} cardWidth={size.width} />
          <CountBadge count={count} landedNonce={landedNonce} />
        </>
      ) : (
        <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-xs">
          Empty
        </div>
      )}

      {topCard ? <PileTopCardDrag topCard={topCard}>{halves}</PileTopCardDrag> : halves}
    </div>
  );
}

// The dilemma stack's own top card, revealed one at a time (#751): once its own `flip` (the
// existing per-card action, unchanged) turns it face up, it shows its own art in place of the
// generic card back, right there on the table, and becomes draggable straight off the stack —
// the same "the pile's top card is a small component of its own, mounted only while a top card
// exists" pattern `DiscardPileCard` above already uses, so `useDraggable`'s own registration (and
// so the mock `@dnd-kit/core` the test suite relies on) only happens while a revealed card is
// actually there to drag. The button also keeps the zone's own tap-to-open working, the same
// `onClick` alongside `useDraggable`'s own listeners `CardListPanelCard` (`CardListPanel.tsx`) already
// combines on one element — a plain tap still opens the full stack panel; a drag pulls just this
// one card out.
function DilemmaStackTopCard({
  topCard,
  count,
  onOpen,
  zIndex,
  cardWidth,
  left = 0,
  cropHeight,
  wholeHeight,
}: {
  topCard: CardInstance;
  count: number;
  onOpen: () => void;
  zIndex: number;
  cardWidth: number;
  // The face-up stack of the dilemma choice (#1190) draws every card this way, side by side.
  left?: number;
  // The face-up stack of the dilemma choice draws each card as the art crop of a table card, this
  // tall (#1221), on touch. The fan's revealed top card, and the choice stack with a fine pointer
  // (#1498), leave it out and show the whole card.
  cropHeight?: number;
  // The whole card's height, where it must match another card exactly: the choice stack with a
  // fine pointer is the mission card's size (#1505). Left out, the image keeps its own ratio.
  wholeHeight?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: topCard.id });
  // A revealed card previews like any other face-up card on the table: a mouse hover or a press
  // and hold (#989).
  const holdListeners = useCardHold(topCard.id, listeners);

  return (
    <button
      type="button"
      ref={setNodeRef}
      data-card-id={topCard.id}
      onClick={onOpen}
      aria-label={dilemmaStackLabel(count)}
      style={{
        ...NO_CALLOUT_STYLE,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        bottom: 0,
        left,
        zIndex,
      }}
      {...attributes}
      {...holdListeners}
      className={`absolute ${cropHeight === undefined ? 'rounded-lg' : 'rounded-md'} focus:outline-hidden touch-none`}
    >
      {cropHeight === undefined ? (
        <img
          draggable={false}
          src={cardImageUrl(topCard.card)}
          onError={showCardMissing}
          width={120}
          height={167}
          alt={cardDisplayName(topCard.card)}
          className={`pointer-events-none rounded-lg shadow-lg ${wholeHeight === undefined ? 'h-auto' : 'object-cover'}`}
          style={{ ...NO_CALLOUT_STYLE, ...cardBorderStyle(cardWidth), width: cardWidth, height: wholeHeight }}
        />
      ) : (
        <div className="pointer-events-none shadow-lg rounded-md" style={{ width: cardWidth }}>
          <TableCardImage instance={topCard} width={cardWidth} height={cropHeight} />
        </div>
      )}
    </button>
  );
}

// The dilemma stack (#630): a single flat drop target — no top/bottom split, since a drop always
// appends at the bottom, and the first dilemma dropped (index 0) is the first revealed. Sits in
// its own reserved column to the right of the mission row (`computeTableScale`,
// `tableScale.ts`); a tap opens its own `CardListPanel`, listing the stack in that same order. Its
// `DilemmaIcon` badge (`MissionRow.tsx`, exported for exactly this once #733 took the stack out
// of the mission slots) marks it apart from the flat dilemma pile, which looks the same otherwise
// (a face-down cardback with a count).
//
// #751: a separate "reveal" control, a small corner overlay sibling of the tap-to-open button —
// the same "a control sits beside the card, not nested inside its own button" convention
// `CardListPanelCard`'s selection checkbox (`CardListPanel.tsx`) already follows for a corner overlay
// specifically — turns the top card face up in place via the existing `flip` action, one card at
// a time; the card below stays face down until revealed in its own turn. Only shown while there
// is a face-down top card to reveal; once revealed, `DilemmaStackTopCard` above takes over the
// zone's own art and becomes the drag source, and the button hides since there's nothing left for
// it to do until the next card needs revealing. Do not confuse this with the whole-stack
// `CardListPanel` open above: that already shows every card in the stack face up, unconditionally,
// for a reorder — this reveals only the current top card, on the table itself, unchanged from
// this issue's own scope.
//
// #742: hidden (kept in the DOM, `visibility: hidden`, so its width never moves the columns beside
// it) whenever it isn't useful — the stack is empty, the dilemma hand is closed, and no dilemma is
// being dragged — and shown again the moment any one of those stops being true, the same
// `visibility`/`pointerEvents` pattern the closed hand's own fan uses (`CardHand.tsx`).
// `visibility: hidden` alone already keeps it out of the accessibility tree, so no separate
// `aria-hidden` is needed.
//
// #1208: the stack of the facing phase draws as a row as wide as `computeAttemptLayout` gives it
// (`stackWidth`), as tall as the mission card. `dilemmaStack[0]`, the dilemma being faced, sits on
// the left and in front, a whole card; each later card sits face down to its right, one layer
// further back, overlapped to fit (`offsetFor`). The zone is the top card and at most a fifth of
// its width more (#1218), so the cards behind it show as slivers. It keeps the one
// `dilemmaStack` drop target: nothing reorders the stack in this phase, so it has no slots.
//
// #1190: this row is the stack of the facing phase only. In the dilemma choice every card is face
// up, and `DilemmaStackFaceUp` below draws the stack instead, with a drop target per card.

// The height of a mission column with the ship rows `useMissionScale` reserves, on a desktop (#992)
// and on a touch screen. Defined once at module level, so the hook's effect does not run again on
// every render.
const desktopMissionColumnHeight = (scale: number): number =>
  missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
const touchMissionColumnHeight = (scale: number): number =>
  missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);

// Measures every droppable again while the attempt layout is parked (#1342). The full table mounts
// mid-drag, and dnd-kit measures each droppable as it registers, before the mission scale and the
// bottom row size themselves, so it measures again on each change of the sizes, a frame after it
// commits.
function RemeasureDroppables({ sizes }: { sizes: unknown[] }) {
  const { measureDroppableContainers } = useDndContext();
  const key = JSON.stringify(sizes);
  useEffect(() => {
    const frame = requestAnimationFrame(() => measureDroppableContainers([]));
    return () => cancelAnimationFrame(frame);
  }, [key, measureDroppableContainers]);
  return null;
}

// The parts that make the dilemma stack a drop target, shared by the facing phase's fan and the
// face-up stack of the dilemma choice (#1190). Only one of the two is mounted at a time, so
// `dilemmaStack` stays one droppable.
function useDilemmaStackZone(overARowSlot = false) {
  const { setNodeRef, isOver } = useDroppable({ id: 'dilemmaStack' });
  const draggedType = useDraggedCardType();
  const highlight = highlightState('dilemmaStack', draggedType, isOver || overARowSlot);
  const landedNonce = useLandedNonce('dilemmaStack');
  return { setNodeRef, highlight, landedNonce };
}

// How far above the bottom edge of a dilemma the bot label sits: just above the text box (#1519).
const BOT_LABEL_BOTTOM = 0.45;

const dilemmaStackLabel = (count: number, choseNone = false) =>
  choseNone && count === 0
    ? 'Dilemma stack, no dilemmas chosen, tap to open'
    : `Dilemma stack, ${count} card${count === 1 ? '' : 's'}, tap to open`;

function DilemmaStackPile({
  stack,
  onOpen,
  onReveal,
  visible,
  width,
  height,
  cardWidth,
  botLabel = null,
  onDismissBotLabel,
  resolvePreview = null,
  resolved = false,
  resolvePending = false,
  onResolve,
  choseNone = false,
}: {
  stack: CardInstance[];
  onOpen: () => void;
  onReveal: () => void;
  visible: boolean;
  // The bot chose no dilemmas at Start (#1536): the empty outline reads "No dilemmas chosen".
  choseNone?: boolean;
  // The sizes of `computeAttemptLayout` (#1208): the zone, and one whole card.
  width: number;
  height: number;
  cardWidth: number;
  // The bot's choice for the revealed top card, in a bot game (#1519), or null for none.
  botLabel?: string | null;
  onDismissBotLabel?: () => void;
  // The preview of the bot's Resolve of the revealed top card (#1589), or null for no Resolve, and
  // whether it is done. The button reads "Resolved", disabled, until the next card is revealed.
  resolvePreview?: string | null;
  resolved?: boolean;
  // The player's choice is not made yet (#1593): the preview reads the task, and the button is disabled.
  resolvePending?: boolean;
  onResolve?: () => void;
}) {
  const { setNodeRef, highlight, landedNonce } = useDilemmaStackZone();
  const count = stack.length;
  const topCard = stack[0];
  const revealed = topCard?.face === 'up';
  const offset = offsetFor(count, cardWidth, width, cardWidth);
  // The bot label hides during a drag, so it never floats where the dragged top card was.
  const dragActive = useDraggedCardType() !== null;

  return (
    <div
      ref={setNodeRef}
      data-zone="dilemmaStack"
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      style={{ width, height, visibility: visible ? 'visible' : 'hidden', pointerEvents: visible ? 'auto' : 'none' }}
      className={`relative rounded-lg ${highlightClassName(highlight)}`}
    >
      <LandedRing nonce={landedNonce} />
      {/* Covers the whole box underneath the row (below), so a tap anywhere the row doesn't
          cover still opens the panel. Once the top card is revealed, `DilemmaStackTopCard`
          below carries the same label as the control the player actually sees and taps, so this
          one is hidden from the accessibility tree — it stays clickable for the row's own
          non-interactive back-card area, just not separately announced. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={dilemmaStackLabel(count, choseNone)}
        aria-hidden={revealed || undefined}
        tabIndex={revealed ? -1 : undefined}
        className="absolute inset-0 w-full h-full rounded-lg focus:outline-hidden"
      >
        {count === 0 && (
          <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
            {choseNone ? 'No dilemmas chosen' : 'Dilemma stack'}
          </div>
        )}
      </button>
      {stack.map((card, i) =>
        i === 0 && revealed ? (
          <DilemmaStackTopCard key={card.id} topCard={card} count={count} onOpen={onOpen} zIndex={count - i} cardWidth={cardWidth} />
        ) : (
          <img
            key={card.id}
            data-card-id={card.id}
            src="/cardimages/cardback.jpg"
            width={120}
            height={167}
            alt={i === 0 ? 'Face-down dilemma stack' : ''}
            className="pointer-events-none absolute bottom-0 rounded-lg shadow-lg h-auto"
            style={{ ...cardBorderStyle(cardWidth), width: cardWidth, left: i * offset, zIndex: count - i }}
          />
        )
      )}
      <span className="absolute -top-1 -right-1 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none" style={{ height: 14, zIndex: count + 1 }}>
        <DilemmaIcon />
        {count > 0 && <span className="text-[8px] font-bold">{count}</span>}
      </span>
      {/* #1519: the bot's choice for the dilemma faced, on the right of the card's art, above its
          text box. A sibling painted above the top card, so a tap dismisses it and never reaches
          the card: no panel, no drag, no preview. Hidden while the top card drags. */}
      {revealed && botLabel && !dragActive && (
        <button
          type="button"
          data-testid="dilemma-bot-label"
          onClick={onDismissBotLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={`Bot's choice: ${botLabel}, tap to dismiss`}
          title="Tap to dismiss"
          className="absolute rounded-md bg-black/90 ring-1 ring-white/70 shadow-md px-1 py-0.5 text-left text-[9px] font-semibold leading-tight text-text-primary focus:outline-hidden"
          style={{
            ...NO_CALLOUT_STYLE,
            right: Math.max(0, width - cardWidth) + 3,
            bottom: Math.round(cardWidth * 1.39 * BOT_LABEL_BOTTOM),
            maxWidth: Math.max(40, cardWidth * 0.8),
            zIndex: count + 2,
          }}
        >
          {botLabel}
        </button>
      )}
      {/* #1589: the Resolve's preview and its button, over the text box of the top card, below the bot
          label. Siblings painted above the top card, with the label's guards, so a tap never starts a
          drag or opens the panel. Hidden while the top card drags. */}
      {revealed && resolvePreview && !dragActive && (
        <div
          className="absolute flex flex-col items-start gap-0.5"
          style={{ left: 3, bottom: 3, maxWidth: Math.max(40, cardWidth - 6), zIndex: count + 2 }}
        >
          <span
            data-testid="dilemma-resolve-preview"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="rounded-md bg-black/90 ring-1 ring-white/40 px-1 py-0.5 text-[9px] leading-tight text-text-primary"
            style={NO_CALLOUT_STYLE}
          >
            {resolvePreview}
          </span>
          <button
            type="button"
            data-testid="dilemma-resolve"
            onClick={onResolve}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={resolved || resolvePending}
            aria-label={resolved ? 'Resolved' : `Resolve: ${resolvePreview}`}
            className="rounded-md bg-accent ring-1 ring-white/70 shadow-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-white disabled:bg-black/80 disabled:text-text-muted focus:outline-hidden"
            style={NO_CALLOUT_STYLE}
          >
            {resolved ? 'Resolved' : 'Resolve'}
          </button>
        </div>
      )}
      {/* #1080: 24 px, the size of the pile buttons, with an opaque fill and a solid ring so it
          reads against the card back. A sibling of the tap-to-open button, painted above it, so a
          tap here flips the top card and never opens the panel. */}
      {count > 0 && !revealed && (
        <button
          type="button"
          onClick={onReveal}
          aria-label="Reveal top dilemma"
          className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-black/90 border border-white shadow-md flex items-center justify-center text-text-primary focus:outline-hidden"
          style={{ zIndex: count + 1 }}
        >
          <RevealIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Issue #1190: the dilemma stack of the dilemma choice (`Attempt.phase === 'choose'`), in the
// middle of the attempt layout. Every card shows its own face as the art crop of a table card
// (#1221), the crop of the placed-on column, left to right in stack order, the
// first dilemma faced first, edge to edge while they fit the width and overlapped past that, a
// later card on top. Each card previews on a hold or a hover, opens the stack's panel on a tap, and
// drags off the stack, as the revealed top card of the fan does. The zone shows even when it is
// empty: `dilemmaStackVisible` (#742) applies only to the fan.
//
// #1204: a line above the cards labels the two ends, "First" and "Last", and each card
// is a drop target of its own (`DilemmaStackRowSlot`), so a drop puts a dilemma between two cards.
// A marker shows where, from the same rule the drop reads (`dilemmaStackRowInsertPoint`), as the
// marker of the stack's panel does (#956).
function DilemmaStackFaceUp({
  stack,
  onOpen,
  width,
  height,
  cardWidth,
  cardHeight,
  wholeCards,
}: {
  stack: CardInstance[];
  onOpen: () => void;
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  // With a fine pointer each card is the whole card, frame, cost and game text (#1498); on touch
  // the art crop of a table card (#1221).
  wholeCards: boolean;
}) {
  const { active, over } = useDndContext();
  const overId = over ? String(over.id) : null;
  const { setNodeRef, highlight, landedNonce } = useDilemmaStackZone(dilemmaStackRowTarget(overId) !== null);
  const draggedType = useDraggedCardType();
  const count = stack.length;
  const offset = offsetFor(count, cardWidth, width, cardWidth);
  const insert =
    draggedType === 'dilemma'
      ? dilemmaStackRowInsertPoint(
          stack.map((card) => card.id),
          active ? cardIdOfDraggable(active.id) : null,
          overId
        )
      : null;
  const markLeft = insert === null ? 0 : insert.boundary >= count ? (count - 1) * offset + cardWidth : insert.boundary * offset;

  return (
    <div
      ref={setNodeRef}
      data-zone="dilemmaStack"
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      style={{ width, height }}
      className={`relative rounded-lg ${highlightClassName(highlight)}`}
    >
      <LandedRing nonce={landedNonce} />
      {/* Covers the space the cards leave, so a tap there opens the panel too. Each card carries
          the same label, so this one is hidden from the accessibility tree once a card shows. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={dilemmaStackLabel(count)}
        aria-hidden={count > 0 || undefined}
        tabIndex={count > 0 ? -1 : undefined}
        className="absolute inset-0 w-full h-full rounded-lg focus:outline-hidden"
      >
        {count === 0 && (
          <div className="pointer-events-none w-full h-full rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1">
            Dilemma stack
          </div>
        )}
      </button>
      {count > 0 && (
        // The right label keeps clear of the count badge in the corner. With whole cards the line
        // sits above the zone, in the band above the body, so the cards fill the zone's height and
        // their top is level with the mission card's (#1505); on touch it sits inside the zone.
        <div
          data-testid="dilemma-stack-end-labels"
          className="absolute left-0 right-0 flex flex-row justify-between items-center pr-7 pointer-events-none text-[10px] font-bold uppercase tracking-wide text-text-secondary leading-none whitespace-nowrap"
          style={{ top: wholeCards ? -ATTEMPT_STACK_LABEL_HEIGHT : 0, height: ATTEMPT_STACK_LABEL_HEIGHT }}
        >
          <span>{DILEMMA_STACK_CHOICE_END_LABELS.first}</span>
          <span>{DILEMMA_STACK_CHOICE_END_LABELS.last}</span>
        </div>
      )}
      {stack.map((card, i) => (
        <DilemmaStackTopCard
          key={card.id}
          topCard={card}
          count={count}
          onOpen={onOpen}
          zIndex={i + 1}
          cardWidth={cardWidth}
          left={i * offset}
          cropHeight={wholeCards ? undefined : cardHeight}
          wholeHeight={wholeCards ? cardHeight : undefined}
        />
      ))}
      {/* The drop targets: the part of each card no later card covers, and the last card split in
          two halves, the right one the end of the stack. */}
      {stack.map((card, i) => (
        <DilemmaStackRowSlot
          key={card.id}
          id={dilemmaStackRowSlotId(card.id)}
          left={i * offset}
          width={i === count - 1 ? cardWidth / 2 : offset}
        />
      ))}
      {count > 0 && (
        <DilemmaStackRowSlot id={DILEMMA_STACK_ROW_END} left={(count - 1) * offset + cardWidth / 2} width={cardWidth / 2} />
      )}
      {insert && (
        <div
          data-testid="dilemma-stack-insert-indicator"
          data-slot={insert.slot}
          aria-hidden="true"
          className="absolute bottom-0 w-1 -translate-x-1/2 rounded-full bg-accent pointer-events-none"
          style={{ left: markLeft, height: cardHeight, zIndex: count + 2 }}
        />
      )}
      <span className="absolute -top-1 -right-1 flex items-center gap-0.5 rounded-full bg-black/50 px-1 text-text-primary leading-none pointer-events-none" style={{ height: 14, zIndex: count + 1 }}>
        <DilemmaIcon />
        {count > 0 && <span className="text-[8px] font-bold">{count}</span>}
      </span>
    </div>
  );
}

// One drop target of the face-up row (#1204). It takes no pointer events, so a press still
// reaches the card under it; dnd-kit finds it by its rect.
function DilemmaStackRowSlot({ id, left, width }: { id: string; left: number; width: number }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      aria-hidden="true"
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{ left, width }}
    />
  );
}

// The localStorage key of the saved practice game (#976). A fixture route keeps its game under
// its own key, so a fixture visit never overwrites the player's game.
const PRACTICE_GAME_KEY = 'practiceGame';
const practiceGameKey = (fixture: string | null) => (fixture ? `${PRACTICE_GAME_KEY}:fixture=${fixture}` : PRACTICE_GAME_KEY);

// Issue #1125: the open hand draws as an arc between the draw deck and the dilemma pile. The
// open dilemma hand draws as the same arc, in the same gap (#1150).
const HAND_ARC_BETWEEN = { left: '[data-testid="draw-pile"]', right: '[data-testid="dilemma-pile-group"]' };
// Issue #1489: each closed hand is a small fan on the box of the core and the brig, the dilemma hand
// at its right end, and the hand at its left end in the dilemma choice and in the middle of the
// screen elsewhere (#1496).
const CLOSED_FAN_ANCHOR = '[data-testid="flat-rows"]';
// The content column's `p-4`.
const CONTENT_PADDING = 16; // px

function PracticeDrawContent() {
  const searchParams = useSearchParams();
  const fixture = searchParams.get('fixture');
  // `?fixture=piles` (#802) deals the same fixture deck as `?fixture=1`, then places a big
  // away team and a crewed ship, for the card list panel checks.
  const isPilesFixture = fixture === 'piles';
  // `?fixture=costs` (#1654) deals the piles table with the cards of the cost models added: Borg
  // Nanoprobes, Goran and the cards of the later models in the hand, and a Borg in the ship's crew.
  const isCostsFixture = fixture === 'costs';
  // `?fixture=attributes` (#1666) deals the piles table with a [TN] personnel in the ship's crew and
  // Dark Dissension in the core, for the arrows of the attribute bands.
  const isAttributesFixture = fixture === 'attributes';
  // `?fixture=attempt` (#1169) deals the piles table, then starts an attempt at Bilana System.
  // It ends in the facing phase, with the dilemma stack. `?fixture=attempt-choose` (#1189) stops in
  // the dilemma choice, with no stack.
  const attemptFixturePhase: AttemptPhase | null =
    fixture === 'attempt' ? 'face' : fixture === 'attempt-choose' ? 'choose' : null;
  const isAttemptFixture = attemptFixturePhase !== null;
  // `?fixture=bot` (#1289) deals the piles table as a bot game, with the Chula pile in place of the
  // deck's dilemmas.
  // `?fixture=bot-label` (#1519) deals the same bot table with a Well-Prepared Defenses in the dilemma
  // pile, and starts a bot attempt whose facing stack has it on top, revealed, for the bot's label.
  // `?fixture=bot-resolve-noeffect` (#1589) does the same with a Conflict of Interests, for "No effect",
  // and `?fixture=bot-resolve-choice` (#1593) with a Covert Extraction, for the player's choice, and
  // `?fixture=bot-resolve-pattern` (#1594) with A Pattern of Lies, whose roll the reveal keeps, and
  // `?fixture=bot-resolve-becalmed` (#1628) with Becalmed, whose roll and check the preview names.
  const botRevealFixture = fixture && Object.hasOwn(BOT_REVEAL_FIXTURES, fixture) ? BOT_REVEAL_FIXTURES[fixture] : null;
  const isBotFixture = fixture === 'bot' || botRevealFixture !== null;
  const isFixture =
    fixture === '1' || isPilesFixture || isCostsFixture || isAttributesFixture || isAttemptFixture || isBotFixture;
  const gameKey = practiceGameKey(isFixture ? fixture : null);
  // `?reset=1` deals a new game instead of the saved one, and the new game replaces the save.
  // Browser checks use it with `?fixture=1` to start from the same table every time.
  const isReset = searchParams.get('reset') === '1';
  const debugTaps = useDebugTaps(searchParams.get('debugTaps'));
  const { data: publicData, loading } = useDataFetching();
  // A playtester's playtest cards join the public cards when they arrive (#1615). A deck resolved by
  // name awaits `completeData`, so it waits for them; the deal effect runs on `publicData` only.
  // The rows stay `any[]`, as `useDataFetching` gives them.
  const data: any[] = useWithPlaytestCards(publicData);
  const playtestSettled = usePlaytestCards().settled;
  const completeData = useCompleteData(data, !loading && playtestSettled);
  const serviceWorkerUpdate = useServiceWorker();
  // The table and its game log (#1065). `gameReducer` runs `tableReducer` and records one log
  // entry per player action, so a handler whose action moves several cards dispatches one `batch`.
  const [game, dispatchGame] = useReducer(gameReducer, initialTableState, initialGameState);
  const table = game.table;
  // Every shuffle result is chosen here, before the dispatch, and the action carries it (#1401), so
  // `tableReducer` calls no random function and a saved undo or redo step holds the same order.
  // The counter of the turn's counters (#1607) is a setting of the device, not of the saved game.
  const [turnCountersOn, setTurnCountersOn] = useLocalStorage<boolean>(TURN_COUNTERS_KEY, false);
  // "Apply card text to attributes" (#1668) is a setting of the device too. It joins each move in
  // `withShuffleOrders`, so the range a move used never changes with it.
  const [cardTextOn, setCardTextOn] = useLocalStorage<boolean>(CARD_TEXT_ATTRIBUTES_KEY, false);
  // The brief chip of the last charge: the index of its entry in the log. It is page state, so a
  // reload does not bring it back. A newer charge replaces it, undo and redo remove it, and it shows
  // only while its entry is of the current turn, so the next turn removes it too.
  const [chargeChip, setChargeChip] = useState<{ entry: number } | null>(null);
  const [countersListOpen, setCountersListOpen] = useState(false);
  const dispatch = (action: GameAction) => {
    const chosen = withShuffleOrders(table, action, game.log, cardTextOn);
    if (actionCharged(chosen)) setChargeChip({ entry: game.log.length });
    else if (['undo', 'redo', 'reset', 'resetWithPiles', 'restore'].includes(action.type)) setChargeChip(null);
    dispatchGame(chosen);
  };
  useEffect(() => {
    if (!chargeChip) return;
    const timer = setTimeout(() => setChargeChip(null), CHARGE_CHIP_MS);
    return () => clearTimeout(timer);
  }, [chargeChip]);
  const { drawDeck, hand, discard, core, brig, dilemmaPile, dilemmaHand, dilemmaStack, missions, turn, score } = table;
  const [deckEmpty, setDeckEmpty] = useState(true);
  // The card a press and hold shows in the preview, while the pointer stays down. The preview
  // exists only for a hold: a tap never opens it. A hold never touches `openCrewShipId`: a hold
  // on a ship does not open its crew panel, and a hold on a crew card leaves that panel open.
  const [heldCardId, setHeldCardId] = useState<string | null>(null);
  // The card a mouse rests on (#766), after `HOVER_DELAY_MS`. Kept apart from `heldCardId`, so
  // the release of a mouse hold on a hovered card leaves the preview up until the pointer leaves.
  // The preview shows the held card first, and the hovered card otherwise.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  // The edge each preview takes, away from the press or hover point (#879).
  const [heldSide, setHeldSide] = useState<PreviewSide>('right');
  const [hoveredSide, setHoveredSide] = useState<PreviewSide>('right');
  // Read by `startHover`, which is memoized: a hover never starts during a drag.
  const draggingRef = useRef(false);
  // The press point and the pressed card's rectangle, recorded at drag start (#774). Read only by
  // `handleDragEnd`, so a ref: it must not cause a render.
  const pressRef = useRef<PressGeometry | null>(null);
  // The last place the pointer was seen, for the check that a hovered card is still under it.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  // The range each ship used this turn and its Range on the table (#1635), for the pill of its card.
  // The attributes on the table that differ from the printed ones (#1666), for the arrows of the bands.
  const attributesOnTable = useMemo(
    () =>
      attributesOnTableOf(
        { missions: table.missions, core: table.core, hand: table.hand, discard: table.discard, score: table.score, rangeUsed: table.rangeUsed },
        cardTextOn
      ),
    [table.missions, table.core, table.hand, table.discard, table.score, table.rangeUsed, cardTextOn]
  );
  const rangeUsedInfo = useMemo(
    () => ({
      used: table.rangeUsed,
      ranges: shipRangesOnTable({ missions: table.missions, discard: table.discard }, table.rangeUsed, cardTextOn),
      attributes: attributesOnTable,
    }),
    [table.missions, table.discard, table.rangeUsed, cardTextOn, attributesOnTable]
  );
  const cardHold = useMemo(
    () => ({
      startHold: (id: string, side: PreviewSide) => {
        setHeldCardId(id);
        setHeldSide(side);
      },
      endHold: () => setHeldCardId(null),
      startHover: (id: string, side: PreviewSide) => {
        if (draggingRef.current) return;
        setHoveredCardId(id);
        setHoveredSide(side);
      },
      endHover: (id: string) => setHoveredCardId((current) => (current === id ? null : current)),
    }),
    []
  );
  // The server render, and a browser with no `matchMedia`, count as landscape.
  const isPortrait = useMediaQuery('(orientation: portrait)', false);
  // The game menu (#722): open on every load (#781), so a new player finds the game controls.
  // Nothing is stored; the first press outside the menu closes it. `menu=0` in the URL starts
  // it closed (#1028), so a browser check's first drag is not covered by the splash. It is read
  // in the initial state, not in an effect, so the splash never shows for one frame. `controls=1`
  // (#1088) starts it closed too, so the shared link shows the Controls panel over the table.
  const [gameMenuOpen, setGameMenuOpen] = useState(
    () => searchParams.get('menu') !== '0' && searchParams.get('controls') !== '1'
  );
  // Only one hand opens at a time (#604), so one value names the open hand rather than one
  // boolean per hand.
  const [openHand, setOpenHand] = useState<'hand' | 'dilemmaHand' | null>(null);
  // How many times each pile's Shuffle button has run, the `key` that restarts its animation (#786).
  const [shuffleCounts, setShuffleCounts] = useState({ drawDeck: 0, dilemmaPile: 0 });
  const bumpShuffleCount = (location: DownloadPile) =>
    setShuffleCounts((counts) => ({ ...counts, [location]: counts[location] + 1 }));
  const shufflePile = (location: DownloadPile) => {
    dispatch({ type: 'shuffle', location });
    bumpShuffleCount(location);
  };
  const [draggingInstance, setDraggingInstance] = useState<CardInstance | null>(null);
  // Whether the `DragOverlay` shows the card back rather than the card (#814).
  const [draggingShowsBack, setDraggingShowsBack] = useState(false);
  // The full set of cards this drag moves together (#677): normally just `draggingInstance`
  // itself, but the whole current selection, in the open panel's own order, when the touched
  // card is part of it. `draggingInstance` stays the single card the pointer actually touched —
  // used for the overlay's type context and the "hide the preview/panel during a drag" checks,
  // unchanged from before — while this array drives `handleDragEnd`'s per-card move dispatch and
  // the overlay's card count.
  const [draggingGroup, setDraggingGroup] = useState<CardInstance[]>([]);
  // The zones the last drop moved a card into (#778), each of which plays the landed cue until a
  // timer clears them. A newer drop replaces them at once, with a new nonce to restart the cue.
  const [landedZones, setLandedZones] = useState<LandedZones | null>(null);
  const landedNonceRef = useRef(0);
  const landedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The hold over one card in the core or the brig that places the dragged card on it (#1029).
  // `placeOnHoldRef` mirrors the state, so `handleDragOver` and `handleDragEnd` read the latest
  // value whichever render they were made in.
  const [placeOnHold, setPlaceOnHoldState] = useState<PlaceOnHold>(NO_PLACE_ON_HOLD);
  const placeOnHoldRef = useRef<PlaceOnHold>(NO_PLACE_ON_HOLD);
  const placeOnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameLayer, setGameLayer] = useState<HTMLDivElement | null>(null);
  // Issue #717: grows the mission cards, the ship cards, and every card-list-panel card grid past
  // their base pixel size once the game layer (which already tracks the browser's toolbar
  // showing/hiding, `fixed inset-0`) measures more room than the baseline they were tuned
  // against. `viewerCardWidth`/`viewerCardHeight` feed every `CardListPanel` and `CardHand` below; `MissionRow`
  // derives its own ship-row sizes from the same `scale`.
  // Issue #1383: the practice route draws under the home indicator (`viewport-fit=cover`), so the
  // bottom row rises by the bottom safe-area inset, and the table scale measures the safe height.
  // Every inset is 0 off an iPhone.
  const safeArea = useSafeAreaInsets();
  // Issue #1384: the content column pads itself by the side insets too, so every width the scale
  // math works with is the game layer's less both of them.
  const safeAreaSides = safeArea.left + safeArea.right;
  const scale = useTableScale(gameLayer, safeArea.bottom, safeAreaSides);
  const fullscreen = useFullscreen(gameLayer);
  // #1068: keeps room to scroll the browser's toolbar away again after it comes back. In an app
  // added to the home screen it pins the document's scroll at 0 instead (#1155).
  useToolbarScrollRoom(gameLayer, fullscreen.standalone);
  // Every viewer (a card list panel, the open fan) draws its card at 1.5x the table card (#802),
  // up to a fixed width on a desktop (#946).
  const finePointer = useFinePointer();
  const { width: viewerCardWidth, height: viewerCardHeight } = viewerCardSize(scale, finePointer);
  // Issue #828: every card list panel anchors its bottom just above the bottom row.
  const [bottomRow, setBottomRow] = useState<HTMLDivElement | null>(null);
  const panelBottom = usePanelBottomInset(gameLayer, bottomRow);
  // Issue #1029: the core and the brig grow into the free space of the bottom row.
  const [flatRows, setFlatRows] = useState<HTMLDivElement | null>(null);
  const flatRowsWidth = useElementWidth(flatRows);
  // Issue #930: the ship rows take a second and a third row of ships when the gap between the
  // mission rows and the bottom row has room for them.
  const [missionRows, setMissionRows] = useState<HTMLDivElement | null>(null);
  // Issue #992: on a desktop the missions and the ships show the whole card, and grow into a large
  // gap above the bottom row. A phone or a tablet keeps the art crop, and grows it into that gap
  // the same way, never below the table scale.
  const missionScale = useMissionScale(
    finePointer,
    scale,
    gameLayer,
    missionRows,
    bottomRow,
    desktopMissionColumnHeight,
    touchMissionColumnHeight,
    safeAreaSides,
  );
  // Issue #1060: every desktop mission slot reserves the width of a turned mission, as far as the
  // width of the table allows.
  const gameLayerWidth = useElementWidth(gameLayer);
  // Issue #1395: the room of the touch turn and score column, from the top of the game layer down
  // to the top of the bottom row.
  const gameLayerHeight = useElementHeight(gameLayer);
  // Issue #1465: the bottom row grows on a large screen, up to a cap. The full table and the attempt
  // layout share it, so View full table does not resize the row.
  const bottomRowScale = computeBottomRowScale({
    gameLayerWidth,
    gameLayerHeight,
    tableScale: scale,
    desktop: finePointer,
    columnHeight: finePointer ? desktopMissionColumnHeight : touchMissionColumnHeight,
    insetTop: safeArea.top,
    insetBottom: safeArea.bottom,
    insetSides: safeAreaSides,
  });
  const flatWidths = flatRowWidths(flatRowsWidth, core.length, brig.length, bottomRowScale);
  const turnScoreTop = controlsColumnTop(
    (fullscreen.systemExitControl ? 3 : 4) + (finePointer ? 1 : 0),
    fullscreen.isFullscreen && fullscreen.systemControlsInset,
    finePointer
  );
  const shipRows = useShipRowCount(
    missionRows,
    bottomRow,
    shipRowLineHeight(missionScale, finePointer),
    SHIP_ROW_GAP,
    Math.max(0, ...missions.map((slot) => slot.ships.length)),
    shipsPerRow(missionScale),
  );
  // Issue #1164: an attempt in progress shows the attempt layout in place of the mission row, until
  // View full table. Page state, not part of the save: the attempt the player chose the full table
  // for, by its identity (#1189), so a change of phase or a draw keeps the full table, and a new
  // attempt, a restored game, or a reload opens in the attempt layout.
  const attemptKey = attemptViewKey(table.attempt);
  const [fullTableFor, setFullTableFor] = useState<string | null>(null);
  // The choice is cleared when the attempt ends, so a new attempt at the same mission and ship opens
  // in the attempt layout. Adjusted during render on the change of `attemptKey`.
  // Issue #1519: the card ids whose bot label the player dismissed, for the rest of the attempt. Page
  // state, not part of the save, so a reload shows the labels again.
  const [dismissedBotLabels, setDismissedBotLabels] = useState<ReadonlySet<string>>(() => new Set());
  const [prevAttemptKey, setPrevAttemptKey] = useState(attemptKey);
  if (attemptKey !== prevAttemptKey) {
    setPrevAttemptKey(attemptKey);
    if (!attemptKey) setFullTableFor(null);
    setDismissedBotLabels(new Set());
  }
  // Issue #1519: in a bot game's facing phase, the revealed top card of the dilemma stack shows the
  // bot's choice for it. Worked out once per revealed top card, from the table as it stands when the
  // card is revealed, so a stop made while resolving it leaves the label alone.
  const botLabelCardId =
    table.attempt?.botDraw !== undefined && table.attempt.phase === 'face' && dilemmaStack[0]?.face === 'up'
      ? dilemmaStack[0].id
      : null;
  const [botLabel, setBotLabel] = useState<{ id: string; text: string | null } | null>(null);
  if ((botLabel?.id ?? null) !== botLabelCardId) {
    setBotLabel(
      botLabelCardId && table.attempt
        ? {
            id: botLabelCardId,
            text: botLabelOf(table),
          }
        : null,
    );
  }
  const botLabelText = botLabel && !dismissedBotLabels.has(botLabel.id) ? botLabel.text : null;
  const attemptLayoutShows = attemptKey !== null && fullTableFor !== attemptKey;
  // Issue #1342: a drag from the row of the attempting personnel that holds over View full table
  // switches to the full table mid-drag. The attempt layout then stays mounted, parked, until that
  // drag ends: hidden, with only the row, so the node the press started on stays in the document
  // (WebKit sends a touch's events to it, as `CardHand` explains) and no droppable mounts twice.
  const [parkedFor, setParkedFor] = useState<string | null>(null);
  const attemptLayoutParked = !attemptLayoutShows && parkedFor !== null && parkedFor === attemptKey;
  const viewFullTableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The dilemma hand shows only in the dilemma choice of the attempt layout (#1223): the full table
  // has no dilemma hand and no tap to draw a dilemma.
  const dilemmaHandShows = attemptLayoutShows && table.attempt?.phase === 'choose';
  // The dilemma hand closes for good when it stops showing, adjusted during render on the change.
  const [prevDilemmaHandShows, setPrevDilemmaHandShows] = useState(dilemmaHandShows);
  if (dilemmaHandShows !== prevDilemmaHandShows) {
    setPrevDilemmaHandShows(dilemmaHandShows);
    if (!dilemmaHandShows && openHand === 'dilemmaHand') setOpenHand(null);
  }
  // The cards of the row of the attempting personnel (#1165): the away team at a planet mission,
  // the crew of the attempting ship at a space mission. Null with no attempt, or no attempt layout.
  const attemptPersonnelCards: CardInstance[] | null = (() => {
    if (!attemptLayoutShows || !table.attempt) return null;
    const slot = missions[table.attempt.missionIndex];
    if (!slot) return null;
    if (table.attempt.shipId === undefined) return slot.awayTeam;
    return slot.ships.find((ship) => ship.id === table.attempt?.shipId)?.crew ?? [];
  })();
  const [attemptLayoutEl, setAttemptLayoutEl] = useState<HTMLDivElement | null>(null);
  const [attemptStrip, setAttemptStrip] = useState<HTMLDivElement | null>(null);
  const attemptSizes = useAttemptLayout(
    finePointer,
    scale,
    gameLayer,
    attemptLayoutShows ? attemptLayoutEl : null,
    attemptLayoutShows ? attemptStrip : null,
    bottomRow,
    table.attempt ? missions[table.attempt.missionIndex]?.ships.length ?? 0 : 0,
    attemptPersonnelCards ? { count: attemptPersonnelCards.length, space: table.attempt?.shipId !== undefined } : undefined,
    (table.attempt ? missions[table.attempt.missionIndex]?.mission?.placedOn?.length ?? 0 : 0) > 0,
    desktopMissionColumnHeight,
    touchMissionColumnHeight,
    safeAreaSides,
  );
  const [openPile, setOpenPile] = useState<{ missionIndex: number; pile: MissionPileName } | null>(null);
  // Which of the core's/the brig's own card list panel (#640), or the draw pile's/the dilemma pile's
  // own download panel (#690), is open, if any — only one at a time. Tracked the same way
  // `openPile` tracks a mission's open pile: a piece of UI state with no effect on the table.
  const [openFlatLocation, setOpenFlatLocation] = useState<FlatPanelLocation | null>(null);
  // The dilemma stack mounts only in the attempt layout (#1170), so its panel closes with it,
  // adjusted during render on the change of `attemptLayoutShows`.
  const [prevAttemptLayoutShows, setPrevAttemptLayoutShows] = useState(attemptLayoutShows);
  if (attemptLayoutShows !== prevAttemptLayoutShows) {
    setPrevAttemptLayoutShows(attemptLayoutShows);
    if (!attemptLayoutShows && openFlatLocation === 'dilemmaStack') setOpenFlatLocation(null);
  }
  // Which ship's crew panel (#664) is open, if any, named by the ship's own instance id (not a
  // mission index, since a ship stays reachable by its own id regardless of which mission's ship
  // row currently holds it — the same reasoning `crewDropId` already follows). Tracked the same
  // way as `openPile`/`openFlatLocation`: a piece of UI state with no effect on the table. A tap on a
  // ship (`handleShipClick` below) opens it.
  const [openCrewShipId, setOpenCrewShipId] = useState<string | null>(null);
  // Whose panel of placed cards (#810) is open, if any, named by that card's own instance id, the same way
  // `openCrewShipId` names a ship. A tap on a card in the core or the brig with cards on it opens it.
  const [openPlacedOnTargetId, setOpenPlacedOnTargetId] = useState<string | null>(null);
  // The group a mission card's badge opened (#1081): only its events or only its dilemmas. Null for
  // a core or brig card, whose panel shows every card placed on it.
  const [openPlacedOnGroup, setOpenPlacedOnGroup] = useState<PlacedOnGroup | null>(null);
  // Which mission's ship-row list panel (#713) is open, if any, named by mission index the same
  // way `openPile` is — only one at a time, tracked the same way as the other three panels
  // below. Opened once a mission's ship row holds more ships than fit without overlap
  // (`MissionRow.tsx`'s `ShipRow`), so every ship on that row stays reachable for a tap and a
  // drag, not just the one on top.
  const [openShipRowMissionIndex, setOpenShipRowMissionIndex] = useState<number | null>(null);
  // The open reveal panel of the draw deck's or the dilemma pile's top or bottom cards (#1070,
  // #1078), if any: the pile, the end of the pile shown, and the ids of the cards revealed so far
  // from that end. The panel shows one end at a time. UI state like the panels above, never saved,
  // and cleared on every close, so the next open starts empty. The panel lists the pile's cards
  // whose ids are here, in pile order, read from the pile on every render. A plain count would
  // show cards the player never revealed once a card goes to the bottom.
  const [openReveal, setOpenReveal] = useState<{ pile: DownloadPile; end: 'top' | 'bottom'; ids: string[] } | null>(null);
  // The cards checked in the currently open card list panel (#677), by id. UI state, scoped to
  // whichever panel is open — only one panel is ever open at a time — and cleared whenever a
  // panel closes, the same as the panels themselves.
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // Issue #1589: the Resolve of the same revealed card, from the reveal snapshot and the live table, so
  // its preview follows what the player does by hand. A press plays the roll the reveal kept (#1628), so it
  // does what the preview names, and dispatches one `resolveDilemma`, even with no changes, so the
  // snapshot turns resolved. No Resolve, no preview and no button: the player resolves by hand.
  // Issue #1593: where the player chooses, the row selection is the choice, so the Resolve follows it too,
  // and stays pending, its button disabled, until the choice is made. A selection triggers nothing else.
  const botResolve = useMemo(
    () => (botLabelCardId ? botResolveOf(table, undefined, selectedCardIds) : null),
    [botLabelCardId, table, selectedCardIds],
  );
  const botResolvePreview = botResolve?.resolvable ? botResolve.preview : null;
  const botResolvePending = !!(botResolve?.resolvable && botResolve.pending);
  const botResolved = !!table.attempt?.revealSnapshot?.resolved && table.attempt.revealSnapshot.dilemmaId === botLabelCardId;
  // Issue #1629: while the revealed top card is unresolved, the row marks the personnel of the roll its
  // reveal kept, and those who met its check. Gone once it is resolved or the next card is on top.
  const botRowMarks = useMemo((): BotRowMarks | null => {
    const snapshot = table.attempt?.revealSnapshot;
    if (!botLabelCardId || !snapshot || snapshot.dilemmaId !== botLabelCardId || snapshot.resolved || !snapshot.picks?.length) return null;
    const checks = botResolve?.resolvable ? (botResolve.steps?.checks ?? []) : [];
    return {
      selected: [...new Set(snapshot.picks.flat())],
      met: [...new Set(checks.filter((c) => !c.subject).flatMap((c) => c.met))],
    };
  }, [botLabelCardId, table.attempt?.revealSnapshot, botResolve]);
  const resolveRevealedDilemma = () => {
    const top = dilemmaStack[0];
    const pressed = botResolveOf(table, undefined, selectedCardIds);
    if (!top || !pressed.resolvable || pressed.pending) return;
    dispatch({
      type: 'resolveDilemma',
      dilemmaId: top.id,
      dilemma: cardDisplayName(top.card),
      changes: pressed.changes,
      notes: pressed.notes,
      ...(pressed.steps ? { steps: pressed.steps } : {}),
      ...(pressed.modifiers ? { modifiers: pressed.modifiers } : {}),
      ...(pressed.modifiersClause ? { modifiersClause: pressed.modifiersClause } : {}),
      ...(pressed.move ? { move: pressed.move } : {}),
      ...(pressed.fetchedId ? { fetchedId: pressed.fetchedId } : {}),
      ...(pressed.restToPile?.length ? { restToPile: pressed.restToPile } : {}),
    });
  };

  // A touch or pen press in a scrolling card list panel splits a scroll from a drag (#788); every
  // other press drags as before. `panelScrollSensor.ts` explains why it is one sensor.
  const sensors = useTableSensors();
  // Keeps the centre of the drag overlay under the pointer, whatever the size of the source card (#955).
  const overlayModifiers = useMemo(() => [createCenterOnPointerModifier()], []);

  // A deck loaded from Drive (#780). Once set, Reset deals it again instead of the builder's
  // currentDeck. It is kept in page state only: localStorage.currentDeck is the deck builder's
  // working copy and may hold unsaved edits.
  const [loadedDeck, setLoadedDeck] = useState<DeckList | null>(null);
  // Whether the game dealt now is a bot game (#1289), and the bot's pile when it is not Chula
  // (#1520), so Reset of `loadedDeck` deals the same bot game again. A bot game's `loadedDeck` already
  // holds the bot's pile. Every deal sets both.
  const [botGame, setBotGame] = useState(false);
  const [botPile, setBotPile] = useState<BotPileInfo | undefined>(undefined);
  // The deck as it was dealt (#779), for the game menu's read-only Decklist panel. Every deal
  // goes through `dealDeck`, so this holds the fixture deck, the builder's deck, or a deck loaded
  // from Drive, whichever the table plays now.
  const [dealtDeck, setDealtDeck] = useState<DeckList>({});
  // The Drive file of `loadedDeck`, kept in the save (#976).
  const [driveFileId, setDriveFileId] = useState<string | undefined>(undefined);
  // The Drive file of the dilemmas, when a two-step load takes them from another deck (#1114).
  // Then `driveFileId` is the file of the missions and draw deck.
  const [dilemmaDriveFileId, setDilemmaDriveFileId] = useState<string | undefined>(undefined);
  // The Drive file name of `loadedDeck`, the name of the deck when it is made offline (#1052).
  // A Drive game restored from the save has no name, so it falls back to "Drive deck".
  const [driveFileName, setDriveFileName] = useState<string | undefined>(undefined);
  // The cards the last Load deck dropped because the card data has none of that name (#1616), for
  // the warning over the table. Page state: a reload forgets it.
  const [missingCards, setMissingCards] = useState(0);
  // Set by the first deal or restore (#976). Until then `table` is the empty
  // `initialTableState`, which must not overwrite a valid save.
  const saveReadyRef = useRef(false);
  // Set once a saved game is restored, so the later `data` load does not deal over it.
  const restoredRef = useRef(false);
  // How many undo steps the last write of the history kept after a full quota (#1401), so the next
  // write does not start with one that fails.
  const historyLimitRef = useRef(Infinity);
  const [decklistOpen, setDecklistOpen] = useState(false);
  const [gameLogOpen, setGameLogOpen] = useState(false);
  // The attempt popup (#1163): the panel whose Attempt button opened it, or null when closed.
  const [attemptPopup, setAttemptPopup] = useState<AttemptPanel | null>(null);
  // The Controls panel (#1088). `controls=1` in the URL opens it on load, so it has a link to share.
  const [controlsOpen, setControlsOpen] = useState(() => searchParams.get('controls') === '1');
  const [homeScreenHelpOpen, setHomeScreenHelpOpen] = useState(false);
  const drive = usePracticeDrive();
  const botPiles = useBotPiles(drive.beginnerDecks, drive.championshipEvents);
  const offlineDecks = useOfflineDecks(data);
  const online = useOnline();
  // Set by each deal or restore (#1053): whether the browser was offline then. Only a deck dealt
  // or restored offline can be gated, so a game in progress stays on the table when the connection
  // drops, since its images are already loaded.
  const [dealtOffline, setDealtOffline] = useState(false);

  // Deals a new game from a deck. The fixture, currentDeck, and Drive loads all go through here.
  // The `?fixture=piles` deal (#802) keeps the deck order, so it places the same cards every time.
  // The fixture deck holds 27 personnel, fewer than the 20 + 12 + 2 that deal places (away team,
  // crew, brig), so it deals a second copy of the deck's personnel too, each copy its own instance.
  // The piles deal keeps the dilemmas in deck order too (#1024), so the same dilemmas go under the
  // mission every time.
  // The `?fixture=attempt` deal (#1169) then starts the attempt the popup's Start would, with its
  // default numbers, and moves the top dilemmas of the pile into the dilemma stack (#1170), as one
  // player action and so one log entry, of cards the player did not see. `tableReducer` is pure and `resetWithPiles` ignores the state it gets, so a
  // second run of the deal gives the table the page gets, and with it the ship's instance id.
  // A bot game (#1289) gets a deck that already holds the bot's pile, `opponent: 'bot'`, and the
  // pile's `botPile` unless it is the Chula pile (#1520).
  const dealDeck = (
    deck: DeckList,
    fixturePiles = false,
    fixtureAttemptPhase: AttemptPhase | null = null,
    opponent?: 'bot',
    botRevealTitle: string | null = null,
    dealtBotPile?: BotPileInfo
  ) => {
    // The cards `?fixture=costs` adds (#1654), dealt to the hand and the crew and not to the piles deal,
    // or those of `?fixture=attributes` (#1666), dealt to the crew and the core.
    const extras = fixturePiles ? (isCostsFixture ? costsFixtureExtras() : isAttributesFixture ? attributesFixtureExtras() : null) : null;
    const extraKeys = new Set(extras ? [...extras.hand, ...extras.crew, ...extras.core].map((c: any) => c.collectorsinfo) : []);
    const cards = extractDrawDeck(deck).filter((c: any) => !extraKeys.has(c.collectorsinfo));
    const deal: TableAction = {
      type: fixturePiles ? 'resetWithPiles' : 'reset',
      cards: createCardInstances(
        fixturePiles ? [...cards, ...cards.filter((c: any) => c.type === 'personnel')] : shuffleArray(cards)
      ),
      // A deck saved before #765 has no `backimagefile` on its missions, so it comes from `data`.
      missions: createCardInstances(withBackImageFiles(extractMissions(deck), data), 'up'),
      dilemmas: createCardInstances(
        fixturePiles ? extractDilemmas(deck) : shuffleArray(extractDilemmas(deck))
      ),
      ...(opponent ? { opponent } : {}),
      ...(opponent && dealtBotPile ? { botPile: dealtBotPile } : {}),
      // Last, so the ids of every other card are those of the piles deal.
      ...(extras && fixturePiles
        ? {
            extraHand: createCardInstances(extras.hand),
            extraCrew: createCardInstances(extras.crew),
            ...(extras.core.length ? { extraCore: createCardInstances(extras.core) } : {}),
          }
        : {}),
    };
    dispatch(deal);
    const botDealt = botRevealTitle ? tableReducer(initialTableState, deal) : null;
    const botLabel = botDealt && botRevealTitle ? fixtureBotLabelAttempt(botDealt, botRevealTitle) : null;
    if (botDealt && botLabel) {
      const phase: TableAction = { type: 'setAttemptPhase', phase: 'face' };
      dispatch(botLabel.start);
      dispatch(phase);
      dispatch({ type: 'batch', actions: botLabel.stack, unseen: true });
      // The flip rolls a dilemma's selection before the player's choice from the table it reveals in
      // (#1594), and `table` is still this render's, so it gets the table these actions leave.
      const beforeFlip = [botLabel.start, phase, ...botLabel.stack].reduce(tableReducer, botDealt);
      dispatchGame(withShuffleOrders(beforeFlip, { type: 'flip', id: botLabel.revealId }));
    }
    if (fixtureAttemptPhase) {
      const dealt = tableReducer(initialTableState, deal);
      const start = fixtureAttempt(dealt);
      if (start) {
        dispatch(start);
        // Dilemmas and events on the attempted mission, for its column of placed cards (#1180).
        dispatch({ type: 'batch', actions: fixtureAttemptPlacedOn(dealt), unseen: true });
        // The attempt starts in the choice phase, where the stack is face up, so the facing fixture
        // switches phase first and its stack lands face down (#1189).
        if (fixtureAttemptPhase === 'face') {
          dispatch({ type: 'setAttemptPhase', phase: 'face' });
          dispatch({ type: 'batch', actions: fixtureAttemptStack(dealt), unseen: true });
        }
      }
    }
    setDeckEmpty(isDeckEmpty(deck));
    setDealtDeck(deck);
    setBotGame(opponent === 'bot');
    setBotPile(opponent === 'bot' ? dealtBotPile : undefined);
    setDealtOffline(!isBrowserOnline());
    setOpenHand(null);
    saveReadyRef.current = true;
  };

  // The deck of the fixture route, which the deal and the restore share. The bot fixture's holds the
  // Chula pile in place of the fixture deck's dilemmas (#1289).
  // The cards `?fixture=costs` adds (#1654), split into the hand's and the crew's.
  const costsFixtureExtras = () => {
    const rows = extractDrawDeck(deckFromTsv(PRACTICE_COSTS_TSV, data));
    const crew = (row: any) => row.originalName === PRACTICE_COSTS_CREW;
    return { hand: rows.filter((r) => !crew(r)), crew: rows.filter(crew), core: [] as any[] };
  };
  // The cards `?fixture=attributes` adds (#1666), split into the crew's and the core's.
  const attributesFixtureExtras = () => {
    const rows = extractDrawDeck(deckFromTsv(PRACTICE_ATTRIBUTES_TSV, data));
    const core = (row: any) => row.originalName === PRACTICE_ATTRIBUTES_CORE;
    return { hand: [] as any[], crew: rows.filter((r) => !core(r)), core: rows.filter(core) };
  };
  const fixtureDeck = (): DeckList => {
    const deck = deckFromTsv(PRACTICE_DECK_TSV, data);
    if (isCostsFixture) return { ...deck, ...deckFromTsv(PRACTICE_COSTS_TSV, data) };
    if (isAttributesFixture) return { ...deck, ...deckFromTsv(PRACTICE_ATTRIBUTES_TSV, data) };
    if (!isBotFixture) return deck;
    const botDeck = mergeDeckPiles(deck, chulaPileDeck(data), ['dilemmaPile']);
    // The dilemma a revealing bot fixture adds, by its collector's info as `parseCardData` stores it.
    const labelled = botRevealFixture
      ? data.find((row: any) => row.collectorsinfo === collectorsKey(botRevealFixture.collectorsInfo))
      : undefined;
    // The fixture's second dilemma (#1598), when it has one.
    const next = botRevealFixture?.next
      ? data.find((row: any) => row.collectorsinfo === collectorsKey(botRevealFixture.next!.collectorsInfo))
      : undefined;
    return {
      ...botDeck,
      ...(labelled ? { [labelled.collectorsinfo]: { count: 1, row: { ...labelled, count: 1, pile: 'dilemmaPile' } } } : {}),
      ...(next ? { [next.collectorsinfo]: { count: 1, row: { ...next, count: 1, pile: 'dilemmaPile' } } } : {}),
    };
  };

  // Restores the game saved under `gameKey` (#976). Returns false when there is none, or
  // when `fromSavedGame` drops it, for example after an edit of the deck in the deck builder.
  // A fixture save is compared with the fixture deck, so it needs `data`.
  const restoreSavedGame = (): boolean => {
    try {
      if (isFixture && (loading || data.length === 0)) return false;
      const raw = localStorage.getItem(gameKey);
      if (!raw) return false;
      let currentDeck: DeckList;
      if (isFixture) {
        currentDeck = fixtureDeck();
      } else {
        const currentRaw = localStorage.getItem('currentDeck');
        currentDeck = currentRaw ? JSON.parse(currentRaw) : {};
      }
      const restored = fromSavedGame(raw, currentDeck, localStorage.getItem(savedHistoryKey(gameKey)));
      if (!restored) return false;
      seedInstanceIds(restored.maxInstanceId);
      dispatch({ type: 'restore', state: restored.table, log: restored.log, undo: restored.undo, redo: restored.redo });
      setDealtDeck(restored.dealtDeck);
      setBotGame(restored.table.opponent === 'bot');
      setBotPile(restored.table.botPile);
      setDealtOffline(!isBrowserOnline());
      setDeckEmpty(isDeckEmpty(restored.dealtDeck));
      if (restored.source === 'drive') {
        setLoadedDeck(restored.dealtDeck);
        setDriveFileId(restored.driveFileId);
        setDilemmaDriveFileId(restored.dilemmaDriveFileId);
        setDriveFileName(restored.driveFileName);
      }
      saveReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  };

  const initDeck = () => {
    if (loadedDeck) {
      dealDeck(loadedDeck, false, null, botGame ? 'bot' : undefined, null, botPile);
      return;
    }

    if (isFixture) {
      if (loading || data.length === 0) return;
      dealDeck(
        fixtureDeck(),
        isPilesFixture || isCostsFixture || isAttributesFixture || isAttemptFixture || isBotFixture,
        attemptFixturePhase,
        isBotFixture ? 'bot' : undefined,
        botRevealFixture?.title ?? null
      );
      return;
    }

    try {
      const raw = localStorage.getItem('currentDeck');
      if (!raw) return;
      const deck: DeckList = JSON.parse(raw);
      dealDeck(deck);
    } catch {
      // silently ignore parse errors
    }
  };

  // The first run restores the saved game when there is one (#976), and a restored game is never
  // dealt over by the later run that `data` starts. A fixture route restores only once `data` is
  // there. `?reset=1` skips the restore. It runs on the public cards alone: the playtest cards that
  // join later (#1615) never deal a game in progress again, and no fixture holds one.
  useEffect(() => {
    if (restoredRef.current) return;
    if (!isReset && !saveReadyRef.current && restoreSavedGame()) {
      restoredRef.current = true;
      return;
    }
    initDeck();
  }, [publicData]);

  // Writes the game and its log (#1400) after every change of the table (#976), and then the undo and
  // redo histories under a key of their own (#1401). A failed write (quota, private browsing) is
  // ignored, so play goes on, and a full quota trims the history, never the table save. The first deal or restore sets `saveReadyRef` in the
  // same commit as its dispatch, so this effect still sees the empty `initialTableState` there,
  // and that table must not overwrite the save (#1005). The write waits for the next render.
  useEffect(() => {
    if (!saveReadyRef.current || table === initialTableState) return;
    try {
      const save = loadedDeck
        ? toSavedGame(table, dealtDeck, 'drive', driveFileId, dilemmaDriveFileId, game.log, driveFileName)
        : toSavedGame(table, dealtDeck, 'builder', undefined, undefined, game.log);
      localStorage.setItem(gameKey, JSON.stringify(save));
    } catch {
      // keep playing without a save
      return;
    }
    const historyKey = savedHistoryKey(gameKey);
    historyLimitRef.current = writeSavedHistory(
      game,
      (keepUndo, keepRedo) => toSavedHistory(game, dealtDeck, keepUndo, keepRedo),
      (json) => localStorage.setItem(historyKey, json),
      () => localStorage.removeItem(historyKey),
      historyLimitRef.current
    );
  }, [table, game, dealtDeck, loadedDeck, driveFileId, dilemmaDriveFileId, driveFileName, gameKey]);

  useEffect(() => {
    screen.orientation?.lock?.('landscape')?.catch(() => {});
    return () => {
      screen.orientation?.unlock?.();
    };
  }, []);

  // The game menu's Reset item (#722): closes the menu, confirms since it throws away the
  // current game, and starts a new one the same way a fresh page load does.
  const handleResetClick = () => {
    setGameMenuOpen(false);
    if (window.confirm('Reset the game? This will throw away the current game.')) {
      initDeck();
    }
  };

  // The game menu's Decklist item (#779): closes the menu and opens the read-only deck list.
  const handleDecklistClick = () => {
    setGameMenuOpen(false);
    setDecklistOpen(true);
  };

  // The game log button of the corner column (#1065, #1399): closes the menu, if it is open, and
  // opens the log.
  const handleGameLogClick = () => {
    setGameMenuOpen(false);
    setGameLogOpen(true);
  };

  // The game menu's Controls item (#1088): closes the menu and opens the Controls panel.
  const handleControlsClick = () => {
    setGameMenuOpen(false);
    setControlsOpen(true);
  };

  // A Google sign-in that started from Load deck comes back with `?openPicker=true` (#980). The
  // table opens the picker, and drops the parameter so a reload does not open it again.
  useEffect(() => {
    if (searchParams.get('openPicker') !== 'true') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('openPicker');
    window.history.replaceState({}, '', url.pathname + url.search);
    drive.openPicker();
  }, []);

  // The game menu's Load deck item (#780): closes the menu and opens the Drive picker.
  const handleLoadDeckClick = () => {
    setGameMenuOpen(false);
    drive.openPicker();
  };

  // The game menu's Edit current deck (#1407): closes the menu, confirms, drops the saved game so the
  // next visit of the table deals the edited deck, and opens the dealt deck in the deck builder, in
  // the same tab. A Drive deck with no session signs in first and comes back to the builder.
  const handleEditDeckClick = () => {
    setGameMenuOpen(false);
    if (!window.confirm('Edit this deck? This will throw away the current game.')) return;
    const destination = editDeckDestination({
      isFixture,
      loaded: loadedDeck !== null,
      driveFileId,
      dilemmaDriveFileId,
      driveFileName,
      botGame: table.opponent === 'bot',
      dealtDeck,
      deckName: dealtDeckName(),
    });
    saveReadyRef.current = false;
    try {
      localStorage.removeItem(gameKey);
      localStorage.removeItem(savedHistoryKey(gameKey));
      if (destination.kind === 'copy') {
        sessionStorage.setItem(EDIT_DECK_HANDOFF_KEY, JSON.stringify({ name: destination.name, contents: destination.contents }));
      }
    } catch {
      // the builder opens without the copy
    }
    if (destination.kind === 'link' && destination.needsDrive) drive.openWithDrive(destination.href);
    else navigateTo(destination.href);
  };

  // The base deck of the picker's step 2 (#1114, #1290): the missions and draw deck of a Drive deck,
  // or of the deck dealt now. Confirms first, since a load throws away the current game, and gives
  // null when the player declines or the fetch fails.
  const confirmAndFetchBaseDeck = async (
    source: MissionsAndDrawSource
  ): Promise<{ deck: DeckList; fileId: string | undefined; name: string; missing: number; missingOfMissionsAndDraw: number } | null> => {
    if (!window.confirm('Load this deck? This will throw away the current game.')) return null;
    if (source.kind === 'current') {
      return { deck: dealtDeck, fileId: loadedDeck ? driveFileId : undefined, name: dealtDeckName(), missing: 0, missingOfMissionsAndDraw: 0 };
    }
    const tsv = await drive.fetchDeckTsv(source.file);
    if (tsv === null) return null;
    const cards = await completeData();
    const parsed = missingCardsOf(tsv, cards);
    return {
      deck: deckFromTsv(tsv, cards),
      fileId: source.file.id,
      name: source.file.name,
      missing: parsed.missing,
      missingOfMissionsAndDraw: missingInPiles(parsed, ['mission', 'drawDeck']),
    };
  };

  // The picker's step 2 (#1114): the missions and draw deck of step 1 with the dilemmas of a Drive
  // deck, the step-1 deck's own too, which deals that whole deck (#1290). Confirms once, then deals
  // the combined deck, which Reset deals again and the save keeps as a Drive game.
  const loadDriveDilemmas = async (source: MissionsAndDrawSource, dilemmaFile: { id: string; name: string }) => {
    const base = await confirmAndFetchBaseDeck(source);
    if (base === null) return;
    const sameDeck = source.kind === 'drive' && source.file.id === dilemmaFile.id;
    let deck = base.deck;
    let missing = base.missing;
    if (!sameDeck) {
      const dilemmaTsv = await drive.fetchDeckTsv(dilemmaFile);
      if (dilemmaTsv === null) return;
      const cards = await completeData();
      deck = mergeDeckPiles(base.deck, deckFromTsv(dilemmaTsv, cards), ['dilemmaPile']);
      missing = base.missingOfMissionsAndDraw + missingInPiles(missingCardsOf(dilemmaTsv, cards), ['dilemmaPile']);
    }
    setLoadedDeck(deck);
    setDriveFileId(base.fileId);
    setDilemmaDriveFileId(sameDeck ? undefined : dilemmaFile.id);
    setDriveFileName(sameDeck ? base.name : `${base.name} + ${dilemmaFile.name} dilemmas`);
    dealDeck(deck);
    setMissingCards(missing);
    drive.closePicker();
  };

  // Step 2's Play against the bot (#1290): the missions and draw deck of step 1 with the bot's pile
  // the player chose (#1520) as the dilemma pile, and the bot-game flag of #1289. The Chula pile, or
  // the dilemmas of a beginner or Championship deck less the titles the bot ignores, with the
  // affiliations of that deck's personnel. The name stays the base deck's, since the game menu adds
  // "vs the bot" and the pile itself.
  const playDriveBot = async (source: MissionsAndDrawSource, choice: BotPileChoice) => {
    const base = await confirmAndFetchBaseDeck(source);
    if (base === null) return;
    let pile = chulaPileDeck(data);
    let pileInfo: BotPileInfo | undefined;
    let missing = base.missingOfMissionsAndDraw;
    if (choice.id !== CHULA_BOT_PILE_ID) {
      const text = botPiles.textOf(choice.id) ?? (await drive.fetchDeckTsv({ id: choice.id }));
      if (text === null) return;
      missing += missingInPiles(missingCardsOf(text, data), ['dilemmaPile']);
      const chosen = botPileDeckOf(text, deckFromTsv(text, data), data);
      pile = chosen.pile;
      pileInfo = {
        id: choice.id,
        name: choice.name,
        affiliations: chosen.affiliations,
        ...(chosen.unexpectedDifficulties ? { unexpectedDifficulties: true as const } : {}),
      };
    }
    const deck = mergeDeckPiles(base.deck, pile, ['dilemmaPile']);
    setLoadedDeck(deck);
    setDriveFileId(base.fileId);
    setDilemmaDriveFileId(undefined);
    setDriveFileName(base.name);
    dealDeck(deck, false, null, 'bot', null, pileInfo);
    setMissingCards(missing);
    drive.closePicker();
  };

  // "Keep the current missions and draw deck" needs a dealt deck with a mission or a draw card.
  const canKeepCurrentMissionsAndDraw = Object.values(dealtDeck).some(
    (entry) => (entry?.count ?? 0) > 0 && entry?.row && cardPileFor(entry.row) !== 'dilemmaPile'
  );

  // An offline deck chosen from the not-available message or from Load deck while offline (#1053).
  // It deals the same way a Drive load does, so Reset deals it again, and the save keeps it as a
  // Drive game with no file, which restores it with no Drive call.
  const playOfflineDeck = (record: OfflineDeck, confirmFirst: boolean) => {
    if (confirmFirst && !window.confirm('Load this deck? This will throw away the current game.')) return;
    setLoadedDeck(record.deck);
    setDriveFileId(undefined);
    setDilemmaDriveFileId(undefined);
    setDriveFileName(record.name);
    dealDeck(record.deck);
    setMissingCards(0);
    drive.closePicker();
  };

  // Offline, a deck that is not in the offline record would show a table of broken images, so the
  // page shows the offline decks instead (#1053). A fixture route is a test path and is exempt.
  const deckNotOffline =
    !online && dealtOffline && !isFixture && !isDeckEmpty(dealtDeck) && !offlineDecks.isOffline(dealtDeck);

  // The name of the dealt deck, for Make available offline (#1052): the Drive file name for a Drive
  // load, and the deck builder's `deckFile.name` (written by `useDriveSync`) for the builder deck.
  const dealtDeckName = (): string => {
    if (loadedDeck) return driveFileName ?? 'Drive deck';
    if (isFixture) return 'Practice fixture deck';
    try {
      const raw = localStorage.getItem('deckFile');
      const name = raw ? JSON.parse(raw)?.name : undefined;
      return typeof name === 'string' && name.trim() ? name : 'My deck';
    } catch {
      return 'My deck';
    }
  };

  const drawOne = () => {
    dispatch({ type: 'drawCard', from: 'drawDeck', to: 'hand' });
  };

  // The Draw dilemma button of the dilemma choice (#1191): the counted draw of #1189, which adds 1 to
  // `attempt.drawn`, and then the dilemma hand opens as its arc, so the card drawn can go to the stack.
  const drawChoiceDilemma = () => {
    dispatch({ type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand', counted: true });
    setOpenHand('dilemmaHand');
  };

  // The phase button of the attempt strip (#1192). Facing the dilemmas sends the dilemma hand to the
  // pile, so its arc closes too; going back to the choice leaves the hand as it is.
  const setAttemptPhase = (phase: AttemptPhase) => {
    dispatch({ type: 'setAttemptPhase', phase });
    if (phase === 'face') setOpenHand(null);
  };

  // Moves the turn to its next segment, or at the end of the turn raises the turn counter by one and
  // unstops every stopped personnel card on the table (#718, #1605).
  const nextTurn = () => {
    dispatch({ type: 'advanceSegment' });
  };

  // Changes the score counter by SCORE_STEP points (#719), clamped by the reducer to the
  // 0-140 range.
  const adjustScore = (delta: number) => {
    dispatch({ type: 'adjustScore', delta });
  };

  // The counters of the turn (#1607), derived from the log, and the corrections of its charges.
  const currentCounters = turnCountersOn ? turnCounters(game.log, turn, tableLimitGrants(table)) : null;
  const chipCharges =
    chargeChip && game.log[chargeChip.entry]?.turn === turn ? entryCharges(game.log, chargeChip.entry) : [];
  // `source` names the model whose choice the player took (#1654).
  const correctCharge = (target: ChargeTarget, cost: number, source?: string) =>
    dispatch({ type: 'correctCharge', target, cost, ...(source ? { source } : {}) });
  // A model's choice that raises the turn's limit (#1655), "Tricia Jenkins".
  const raiseLimit = (target: ChargeTarget, delta: number, source: string) =>
    dispatch({ type: 'adjustCounterLimit', delta, source, target });

  const toggleCardSelection = (id: string) => {
    setSelectedCardIds((ids) => (ids.includes(id) ? ids.filter((cardId) => cardId !== id) : [...ids, id]));
  };

  // Sets `stopped` to one explicit value on every id in `ids` (#681's card list panel button). Keeps the selection afterward,
  // so the player can drag the same cards next, same as any other tap on the panel's checkboxes.
  const setStoppedForSelection = (ids: string[], stopped: boolean) => {
    dispatch({ type: 'setStopped', ids, stopped });
  };

  // The discard pile panel's Remove from game button (#1564). Keeps the selection, as Stop does.
  const setRemovedFromGameForSelection = (ids: string[], removedFromGame: boolean) => {
    dispatch({ type: 'setRemovedFromGame', ids, removedFromGame });
  };

  // Turns each id over on its own (#762's card list panel Flip button): one `flip` per card, so a
  // mixed selection stays mixed, inverted. Keeps the selection afterward, as with Stop.
  const flipSelection = (ids: string[]) => {
    dispatch({ type: 'batch', actions: ids.map((id) => ({ type: 'flip', id })) });
  };

  // Moves every id to the discard pile, in the given order (#787's card list panel Discard button), with
  // the same `move` action a drop on the discard pile dispatches, so each card takes the discard
  // pile's face. The panel stays open, or closes when its zone runs empty, by the same rule a drag
  // out of it follows (`closePanelsAfterDrag`). The selection clears either way.
  const discardSelection = (ids: string[]) => {
    const origin = ids.length > 0 ? findInstanceAnywhere(table, ids[0]) : null;
    const actions: TableAction[] = ids.map((id) => ({ type: 'move', id, to: 'discard' }));
    dispatch({ type: 'batch', actions });
    const nextTable = actions.reduce((state, action) => tableReducer(state, action), table);
    closePanelsAfterDrag(origin, nextTable);
    setSelectedCardIds([]);
  };

  // Moves every id from a pile into its matching hand, in the given order (#827's card list panel
  // Download button), then closes the panel, clears the selection, and shuffles the pile. The
  // moves dispatch before the shuffle, so the shuffle covers only the cards left in the pile.
  // `openHand` is not touched: the hand stays open or closed, and its badge count rises.
  const downloadSelection = (pile: DownloadPile, ids: string[]) => {
    // One player action, so one batch and one log entry (#1065): the moves, then the shuffle.
    dispatch({
      type: 'batch',
      actions: [
        ...ids.map((id): TableAction => ({ type: 'move', id, to: DOWNLOAD_HAND[pile] })),
        { type: 'shuffle', location: pile },
      ],
    });
    setOpenFlatLocation(null);
    setSelectedCardIds([]);
    bumpShuffleCount(pile);
  };

  // Sends cards to the top or the bottom of a deck, keeping their order: a 'top' send dispatches
  // them in reverse, as a 'top' drop does (#677). Shared by the hands (#994) and the reveal panel
  // (#1070).
  const sendCardsToDeck = (deck: DownloadPile, ids: string[], position: 'top' | 'bottom') => {
    const ordered = position === 'top' ? [...ids].reverse() : ids;
    const actions: Extract<TableAction, { type: 'move' }>[] = ordered.map((id) => ({ type: 'move', id, to: deck, position }));
    dispatch({ type: 'batch', actions });
    markLanded(actions);
  };

  // Sends the selected cards of an open hand to the top or the bottom of its deck (#994), with the
  // same `move` a drop on a half of that deck dispatches: the draw deck for the hand, the dilemma
  // pile for the dilemma hand. The cards keep the order of the hand, so a 'top' send dispatches
  // them in reverse, as a 'top' drop does (#677). The hand closes once it runs empty, and the
  // selection clears either way.
  const sendHandSelectionToDeck = (hand: 'hand' | 'dilemmaHand', position: 'top' | 'bottom') => {
    const ids = table[hand].filter((c) => selectedCardIds.includes(c.id)).map((c) => c.id);
    sendCardsToDeck(HAND_DECK[hand], ids, position);
    if (table[hand].length === ids.length) setOpenHand(null);
    setSelectedCardIds([]);
  };

  // Moves the selected cards of the attempt row to a destination of its Move to… list (#1341), in
  // row order, with the `move` a drop there dispatches, as one batch: one log entry, one undo. The
  // selection is shared by the whole table, so only the ids in the row move. The top of the draw
  // deck goes through `sendCardsToDeck`, which keeps the row's order there.
  const moveAttemptSelection = (destination: AttemptMoveDestination) => {
    const ids = (attemptPersonnelCards ?? []).filter((c) => selectedCardIds.includes(c.id)).map((c) => c.id);
    if (ids.length === 0) return;
    if (destination.to === 'drawDeck' && destination.position) {
      sendCardsToDeck('drawDeck', ids, destination.position);
    } else {
      const actions: Extract<TableAction, { type: 'move' }>[] = ids.map((id) => ({ type: 'move', id, to: destination.to }));
      dispatch({ type: 'batch', actions });
      markLanded(actions);
    }
    setSelectedCardIds([]);
  };

  // A tap on a ship opens its crew panel, which shows the ship in its own section above the
  // crew (#832). A ship with no crew opens the panel too, with an empty crew area.
  const handleShipClick = (shipId: string) => {
    if (findInstanceAnywhere(table, shipId)) {
      openOnlyCrewPanel(shipId);
    } else {
      setOpenCrewShipId(null);
    }
  };

  // #711: `openPile`, `openFlatLocation`, `openCrewShipId`, and, since #713, `openShipRowMissionIndex`
  // each open a panel, but none of them used to clear the others, so tapping a second panel open
  // (e.g. a core/brig card while a mission's card list panel is still open) left two of these set at
  // once. `openPanelCards`, below, only reads one of them at a time — whichever this file checks
  // first — so the second panel rendered showed the first panel's cards until it was closed and
  // reopened. These four helpers are the only way any of the four states is ever set to a
  // non-null value, so routing every "open a panel" call through one of them, each clearing the
  // other three first, restores the invariant the comments elsewhere in this file already
  // claimed.
  const openOnlyMissionPile = (missionIndex: number, pile: MissionPileName) => {
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setOpenReveal(null);
    setSelectedCardIds([]);
    setOpenPile({ missionIndex, pile });
  };

  const openOnlyFlatZone = (zone: FlatPanelLocation) => {
    setOpenPile(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setOpenReveal(null);
    setSelectedCardIds([]);
    setOpenFlatLocation(zone);
  };

  const openOnlyCrewPanel = (shipId: string) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setOpenReveal(null);
    setSelectedCardIds([]);
    setOpenCrewShipId(shipId);
  };

  const openOnlyShipRowPanel = (missionIndex: number) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenPlacedOnTargetId(null);
    setOpenReveal(null);
    setSelectedCardIds([]);
    setOpenShipRowMissionIndex(missionIndex);
  };

  const openOnlyPlacedOnPanel = (targetId: string, group?: PlacedOnGroup) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenReveal(null);
    setSelectedCardIds([]);
    setOpenPlacedOnGroup(group ?? null);
    setOpenPlacedOnTargetId(targetId);
  };

  const openOnlyRevealPanel = (pile: DownloadPile) => {
    setOpenPile(null);
    setOpenFlatLocation(null);
    setOpenCrewShipId(null);
    setOpenShipRowMissionIndex(null);
    setOpenPlacedOnTargetId(null);
    setSelectedCardIds([]);
    setOpenReveal({ pile, end: 'top', ids: [] });
  };

  // "Reveal top" and "Reveal bottom" (#1070, #1078): add the card nearest that end of the pile not
  // yet revealed. Nothing moves. A tap for the other end first forgets the cards revealed so far,
  // so the revealed cards are always one run at one end of the pile.
  const revealFrom = (end: 'top' | 'bottom') => {
    if (!openReveal) return;
    const ids = end === openReveal.end ? openReveal.ids : [];
    const pile = table[openReveal.pile];
    const next = (end === 'top' ? pile : [...pile].reverse()).find((c) => !ids.includes(c.id));
    if (next) setOpenReveal({ ...openReveal, end, ids: [...ids, next.id] });
  };

  // The reveal panel's Top and Bottom (#1070), the same send the hands' buttons make. A card sent
  // to the end the panel shows stays revealed, in its new place. A card sent to the other end is
  // no longer one of the cards at this end, so it leaves the panel (#1078).
  const sendRevealSelectionToDeck = (ids: string[], position: 'top' | 'bottom') => {
    if (!openReveal) return;
    sendCardsToDeck(openReveal.pile, ids, position);
    if (position !== openReveal.end) setOpenReveal({ ...openReveal, ids: openReveal.ids.filter((id) => !ids.includes(id)) });
    setSelectedCardIds([]);
  };

  // A drag ends a press and hold (#763), and hides a hover preview (#766). Called at the drag's
  // start and again at its end, on every branch (#776): a preview that came back during the drag
  // (a hold whose release never reached `window`) must not outlive it.
  const closePreviews = () => {
    setHeldCardId(null);
    setHoveredCardId(null);
  };

  const setPlaceOnHold = (next: PlaceOnHold) => {
    placeOnHoldRef.current = next;
    setPlaceOnHoldState(next);
  };

  const clearPlaceOnHold = () => {
    if (placeOnTimerRef.current) clearTimeout(placeOnTimerRef.current);
    placeOnTimerRef.current = null;
    if (placeOnHoldRef.current !== NO_PLACE_ON_HOLD) setPlaceOnHold(NO_PLACE_ON_HOLD);
  };

  const clearViewFullTableHold = () => {
    if (viewFullTableTimerRef.current) clearTimeout(viewFullTableTimerRef.current);
    viewFullTableTimerRef.current = null;
  };

  // The hold over View full table (#1342) is open to a drag from the row of the attempting
  // personnel, in the facing phase only.
  const viewFullTableHoldEnabled =
    attemptLayoutShows &&
    table.attempt?.phase === 'face' &&
    draggingInstance !== null &&
    (attemptPersonnelCards?.some((c) => c.id === draggingInstance.id) ?? false);

  // The pointer moved onto a new drop target (#1029). Over a card in the core or the brig, other
  // than the dragged card, a timer starts, and after `PLACE_ON_HOLD_MS` it arms that card. Any
  // change of target clears the timer and the armed card, so a drop then goes to the zone again.
  const handleDragOver = (event: DragOverEvent) => {
    // Over View full table (#1342), a timer of `PLACE_ON_HOLD_MS` switches to the full table and
    // parks the attempt layout; any other target clears it. The button unmounts with the switch,
    // and the new target that dnd-kit then reports clears nothing that still runs.
    if (viewFullTableHoldEnabled && event.over?.id === VIEW_FULL_TABLE_HOLD_ID) {
      if (!viewFullTableTimerRef.current) {
        const key = attemptKey;
        viewFullTableTimerRef.current = setTimeout(() => {
          viewFullTableTimerRef.current = null;
          if (!draggingRef.current || !key) return;
          setParkedFor(key);
          setFullTableFor(key);
        }, PLACE_ON_HOLD_MS);
      }
    } else {
      clearViewFullTableHold();
    }
    const targetId = event.over ? targetIdFromOnDropId(String(event.over.id)) : null;
    if (targetId === placeOnHoldRef.current.overTargetId) return;
    clearPlaceOnHold();
    if (!targetId || targetId === cardIdOfDraggable(event.active.id)) return;
    setPlaceOnHold({ overTargetId: targetId, armedTargetId: null });
    placeOnTimerRef.current = setTimeout(() => {
      placeOnTimerRef.current = null;
      setPlaceOnHold({ overTargetId: targetId, armedTargetId: targetId });
    }, PLACE_ON_HOLD_MS);
  };

  useEffect(
    () => () => {
      if (placeOnTimerRef.current) clearTimeout(placeOnTimerRef.current);
      if (viewFullTableTimerRef.current) clearTimeout(viewFullTableTimerRef.current);
    },
    []
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = cardIdOfDraggable(event.active.id);
    closePreviews();
    clearPlaceOnHold();
    draggingRef.current = true;
    // The press point, read from the activator event, so the release can be measured against it
    // (#774, #825).
    pressRef.current = pressGeometryFrom(event.activatorEvent);
    // A drag can start from the open hand or from a ship already on a mission's ship row
    // (#599); `findInstanceAnywhere` locates a card regardless of which one it is.
    const found = findInstanceAnywhere(table, id);
    if (!found) {
      draggingRef.current = false;
      return;
    }
    if (found.zone === 'hand' || found.zone === 'dilemmaHand') {
      // A drag from an open hand closes it at once; the DragOverlay carries the card under
      // the pointer for the rest of the drag, so the source card can stay put in the (now
      // closed) hand with no jump.
      setOpenHand(null);
    }
    setDraggingInstance(found.instance);
    // A drag off the draw pile's or the dilemma pile's art (#814) carries the card face down.
    setDraggingShowsBack(event.active.data?.current?.showBack === true);

    // A drag of a card selected in the open card list panel, or in the open hand it started from
    // (#691), moves the whole selection together, in that zone's own display order (#677); a
    // drag of a card that is not selected moves only that one card, as before, even while the
    // zone holds an unrelated selection. Only one of these can ever apply to a given drag: a
    // drag starts either from an open hand or from an open panel, never both.
    // With no panel open, a drag from the row of the attempting personnel (#1165) moves its
    // selection the same way.
    const groupSource =
      found.zone === 'hand'
        ? hand
        : found.zone === 'dilemmaHand'
          ? dilemmaHand
          : openPanelCards ?? (attemptPersonnelCards?.some((c) => c.id === id) ? attemptPersonnelCards : null);
    setDraggingGroup(
      groupSource && selectedCardIds.includes(id)
        ? groupSource.filter((c) => selectedCardIds.includes(c.id))
        : [found.instance]
    );
  };

  // Closes a card list panel after a drag ends, unless the drag started from a card inside that very
  // panel and the panel still holds a card after the drop (#675): the player can then drag the
  // next card out with no extra tap. A drag that did not start from a given panel still closes
  // it, the same as before this change — including a panel that merely happened to be open while
  // a drag started somewhere else entirely. `dragOrigin` is the dragged card's zone before the
  // drop (found while `table` still holds its pre-drop state, in `handleDragEnd`/
  // `handleDragCancel` below); `nextTable` is `table` after the drop's move applies (or `table`
  // itself, unchanged, for a drag that dispatched no move at all, including a cancelled drag and a
  // release within the cancel radius of the press point, #774).
  const closePanelsAfterDrag = (
    dragOrigin: { instance: CardInstance; zone: TableZone } | null,
    nextTable: TableState
  ) => {
    const zone = dragOrigin?.zone;
    // Tracks whether this call closes any panel, so the selection (#677), scoped to whichever
    // panel is open, clears along with it — the same "clear it when the panel closes" rule a
    // tap on the panel's own close button follows below, in the JSX.
    let closedAPanel = false;

    if (openPile) {
      const isDragOrigin =
        typeof zone === 'object' &&
        zone.zone === 'missionPile' &&
        zone.missionIndex === openPile.missionIndex &&
        zone.pile === openPile.pile;
      const stillHasCards = nextTable.missions[openPile.missionIndex][openPile.pile].length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenPile(null);
        closedAPanel = true;
      }
    }

    if (openFlatLocation) {
      const isDragOrigin = zone === openFlatLocation;
      const stillHasCards = nextTable[openFlatLocation].length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenFlatLocation(null);
        closedAPanel = true;
      }
    }

    if (openReveal) {
      const isDragOrigin = zone === openReveal.pile;
      const stillHasCards = nextTable[openReveal.pile].some((c) => openReveal.ids.includes(c.id));
      if (!isDragOrigin || !stillHasCards) {
        setOpenReveal(null);
        closedAPanel = true;
      }
    }

    if (openCrewShipId) {
      // The panel also shows the cards placed on the ship (#957), and a drag of one of them starts
      // from this panel too (#963).
      const isDragOrigin =
        typeof zone === 'object' &&
        ((zone.zone === 'crew' && zone.shipId === openCrewShipId) ||
          (zone.zone === 'on' && zone.targetId === openCrewShipId));
      // The panel shows the ship too (#832), so it stays open after the last crew member
      // leaves, as long as the ship itself is still on the table.
      const shipStillThere = !!findInstanceAnywhere(nextTable, openCrewShipId);
      if (!isDragOrigin || !shipStillThere) {
        setOpenCrewShipId(null);
        closedAPanel = true;
      }
    }

    if (openPlacedOnTargetId) {
      const isDragOrigin = typeof zone === 'object' && zone.zone === 'on' && zone.targetId === openPlacedOnTargetId;
      // The panel shows the host card too (#881), so it stays open after the last placed card
      // leaves, as long as the host card itself is still on the table.
      const hostStillThere = !!findInstanceAnywhere(nextTable, openPlacedOnTargetId);
      if (!isDragOrigin || !hostStillThere) {
        setOpenPlacedOnTargetId(null);
        closedAPanel = true;
      }
    }

    if (openShipRowMissionIndex !== null) {
      const isDragOrigin =
        typeof zone === 'object' && zone.zone === 'shipRow' && zone.missionIndex === openShipRowMissionIndex;
      const stillHasCards = nextTable.missions[openShipRowMissionIndex].ships.length > 0;
      if (!isDragOrigin || !stillHasCards) {
        setOpenShipRowMissionIndex(null);
        closedAPanel = true;
      }
    }

    // The open hand and the open dilemma hand (#740). Unlike the four panels above,
    // `handleDragStart` already closes whichever hand a drag starts from, before the drop, so
    // the `DragOverlay` can carry the card without the fan jumping underneath it — by the time
    // this function runs, `openHand` already reads `null` for that case. So the reopen check
    // below reads `zone` (the drag's pre-drop origin) rather than `openHand`, and reopens the
    // hand the drag came from if it still holds a card. A hand left open through a drag that
    // started elsewhere (e.g. an open card list panel, per the issue's acceptance check) still
    // closes, the same as the four panels above.
    if (zone === 'hand' || zone === 'dilemmaHand') {
      if (nextTable[zone].length > 0) {
        setOpenHand(zone);
      } else {
        closedAPanel = true;
      }
    } else if (openHand) {
      setOpenHand(null);
      closedAPanel = true;
    }

    if (closedAPanel) setSelectedCardIds([]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    closePreviews();
    const { active, over } = event;
    const id = cardIdOfDraggable(active.id);
    // The dragged card's zone before the drop, read while `table` still holds its pre-drop
    // state — used below both for the dilemma pile's from-hand routing and to decide, in
    // `closePanelsAfterDrag`, whether this drag started from an open panel (#675).
    const dragOrigin = findInstanceAnywhere(table, id);
    const press = pressRef.current;
    pressRef.current = null;
    const { armedTargetId } = placeOnHoldRef.current;
    clearPlaceOnHold();
    clearViewFullTableHold();
    setParkedFor(null);
    // A release still within the cancel radius of the press point is not a choice of a
    // target (#774, #825): the drag cancels before anything else runs, so no card moves, and the hand
    // or the panel it started from opens again.
    if (isReleaseInCancelRadius(press, event.delta)) {
      cancelDrag(dragOrigin);
      return;
    }
    // The full group this drag moves (#677): `draggingGroup` if `handleDragStart` built one
    // (it always does, for any drag that found a card), falling back to just the touched card
    // for a drag that somehow never set it (defensive only; `dragOrigin` covers the same case
    // `handleDragStart`'s own `findInstanceAnywhere` lookup would).
    const group = draggingGroup.length > 0 ? draggingGroup : dragOrigin ? [dragOrigin.instance] : [];
    setDraggingInstance(null);
    draggingRef.current = false;
    setDraggingGroup([]);
    // An open card list panel (#602), including the core's/the brig's own panel (#640) and a ship's
    // crew panel (#664), closes after a drag, unless the drag started from a card inside it and
    // it still holds a card after the drop (#675).

    // A drop inside the dilemma stack's own popup, on top of another card still in the stack,
    // reorders the stack instead of moving the card out of its zone (#632). The dragged card's
    // origin has to be the stack itself, and the drop has to land on another card that is still
    // in the stack — only a drag that started from this same open popup can ever land on a stack
    // card's own id (`CardListPanelCard`'s `reorderable` droppable), so this cannot misfire against
    // an unrelated drag. Returning here skips the "card left its panel" side effects a real
    // move-out triggers below (`closePanelsAfterDrag`, clearing `selectedCardIds`), since the
    // card never leaves the zone it was selected in.
    // The reveal panel (#1070) reorders its pile the same way: its cards are the top of the pile,
    // so a move between two of them moves no unrevealed card. The stack reorders only in the
    // dilemma choice (#1209): in the facing phase `orderedPanel` is null for its panel.
    if (over && orderedPanel && dragOrigin?.zone === orderedPanel.zone) {
      const overId = String(over.id);
      if (overId !== id && orderedPanel.cards.some((c) => c.id === overId)) {
        dispatch({ type: 'reorder', zone: orderedPanel.zone, id, overId });
        return;
      }
    }

    // A drop on a card of the face-up row of the dilemma choice (#1204), or on its end. The row's
    // targets exist only while it shows. A card of the stack moves to the marked place, as the
    // reorder of the panel above does. A card from anywhere else enters the stack at the marked
    // place below, through the plain move to `dilemmaStack` and a reorder after it.
    const rowTarget = over ? dilemmaStackRowTarget(String(over.id)) : null;
    const rowInsert = rowTarget
      ? dilemmaStackRowInsertPoint(
          dilemmaStack.map((c) => c.id),
          id,
          String(over!.id)
        )
      : null;
    if (rowTarget && dragOrigin?.zone === 'dilemmaStack') {
      if (rowInsert) dispatch({ type: 'reorder', zone: 'dilemmaStack', id, overId: dilemmaStack[rowInsert.slot].id });
      return;
    }

    // A drop on the dilemma pile's or the draw pile's top half (#607, #743) puts the group first
    // in the pile, in front of its existing cards; the bottom half (the default, `position`
    // undefined) puts it last. This branch does not depend on a dragged card's type
    // (`computeMoveTargetForInstance`), so it resolves the same way for every card in the group.
    // Dispatching one `move` per card, in the group's own order, keeps that order in the
    // destination for the default, appending case: each dispatch adds its card after the ones
    // already there. A 'top' drop reverses the dispatch order instead, since a repeated prepend
    // would otherwise reverse the group (#677).
    const position = over
      ? dilemmaPileHalfFromDropId(String(over.id)) ?? drawPileHalfFromDropId(String(over.id)) ?? undefined
      : undefined;
    const orderedGroup = position === 'top' ? [...group].reverse() : group;

    // Each card in the group resolves its own target and, per #677's spec, a card the drop
    // target does not accept is simply left out here — it stays in its panel, same as a lone
    // card dropped somewhere it does not fit already did.
    const actions: Extract<TableAction, { type: 'move' }>[] = [];
    const targetOver = rowTarget ? { ...over!, id: 'dilemmaStack' } : over;
    orderedGroup.forEach((instance) => {
      const target = computeMoveTargetForInstance(targetOver, instance, table, armedTargetId);
      if (target) actions.push({ type: 'move', id: instance.id, to: target, position });
    });
    // Each move appends its card to the stack. A reorder onto the card that sat at the marked place
    // then puts it right before that card, so the group keeps its order there (#1204).
    const beforeId = rowInsert ? dilemmaStack[rowInsert.boundary]?.id : undefined;
    const reorders: TableAction[] = beforeId
      ? actions.map((action) => ({ type: 'reorder', zone: 'dilemmaStack', id: action.id, overId: beforeId }))
      : [];

    // One batch applies every card's own action through `tableReducer` in order, so it reaches
    // the same end state `tableReducer`, replayed below, predicts, and makes one log entry
    // (#1065). A drag that showed the card back logs its cards as unseen.
    if (actions.length > 0) dispatch({ type: 'batch', actions: [...actions, ...reorders], unseen: draggingShowsBack });
    markLanded(actions);

    // `tableReducer` is a pure function (#675): replaying the same actions here, on the side,
    // predicts the drop's outcome without waiting for the dispatches to reach the next render —
    // `closePanelsAfterDrag` needs that outcome now, to decide whether an open panel still holds
    // a card. A drag that dispatched no move (nothing was over a valid drop target, for every
    // card in the group) leaves `table` itself as the outcome: nothing moved, so nothing in any
    // panel changed either.
    const nextTable = [...actions, ...reorders].reduce((state, action) => tableReducer(state, action), table);

    // A card that actually moved is no longer in the panel it was selected in, so it drops out
    // of the selection (#677); a card the drop target did not accept stays selected, same as it
    // stays in the panel. `closePanelsAfterDrag`, below, may clear the selection entirely on top
    // of this, if the panel it belonged to closed.
    if (actions.length > 0) {
      const movedIds = new Set(actions.map((action) => action.id));
      setSelectedCardIds((ids) => ids.filter((cardId) => !movedIds.has(cardId)));
      // A revealed card that moved, even within its own pile, is no longer one of the revealed
      // top cards (#1070).
      setOpenReveal((reveal) => reveal && { ...reveal, ids: reveal.ids.filter((cardId) => !movedIds.has(cardId)) });
    }

    closePanelsAfterDrag(dragOrigin, nextTable);
  };

  // Plays the landed cue (#778) on every distinct zone the drop moved a card into. A drop that
  // moved nothing leaves the current cue alone.
  const markLanded = (actions: Extract<TableAction, { type: 'move' }>[]) => {
    if (actions.length === 0) return;
    landedNonceRef.current += 1;
    setLandedZones({ keys: new Set(actions.map((action) => landedZoneKey(action.to))), nonce: landedNonceRef.current });
    if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
    landedTimerRef.current = setTimeout(() => {
      landedTimerRef.current = null;
      setLandedZones(null);
    }, LANDED_CUE_MS);
  };

  useEffect(
    () => () => {
      if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
    },
    []
  );

  // The browser can cancel a touch drag (a pointercancel or a resize), and a release inside the
  // cancel radius of the press point cancels one too (#774). Clear the overlay then. No move
  // ever dispatches for a cancelled drag, so `table` itself is already the outcome
  // `closePanelsAfterDrag` needs (#675): the panel the drag started from, if any, still holds
  // every card it held before the drag, so it stays open, and the hand it started from reopens.
  const cancelDrag = (dragOrigin: { instance: CardInstance; zone: TableZone } | null) => {
    setDraggingInstance(null);
    draggingRef.current = false;
    setDraggingGroup([]);
    closePanelsAfterDrag(dragOrigin, table);
  };

  const handleDragCancel = () => {
    closePreviews();
    clearPlaceOnHold();
    clearViewFullTableHold();
    setParkedFor(null);
    pressRef.current = null;
    cancelDrag(draggingInstance ? findInstanceAnywhere(table, draggingInstance.id) : null);
  };

  const isEmpty = deckEmpty;
  // #742: the dilemma stack zone is only useful once one of these is true — it holds a card, or a
  // dilemma is being dragged right now (so it's a valid drop target mid-drag, the same
  // `draggingInstance` check the dilemma pile's own top/bottom split already uses for
  // `showPositionLabel`). The face-up stack of the dilemma choice (#1190) ignores it and always
  // shows, and the dilemma hand shows only there (#1223).
  const dilemmaStackVisible = dilemmaStack.length > 0 || draggingInstance?.card.type === 'dilemma';
  const previewCardId = heldCardId ?? hoveredCardId;
  const held = previewCardId ? findInstanceAnywhere(table, previewCardId) : null;
  // A hover ends when its card moves away from the pointer (#784): a card that a table change
  // moves out from under a still pointer sends no `pointerleave`. Checked after every render, so
  // after every move of a card, against the last place the pointer was seen. The preview takes
  // no pointer events, so `elementFromPoint` sees the table under it.
  useEffect(() => {
    const point = pointerRef.current;
    if (!hoveredCardId || !point || typeof document.elementFromPoint !== 'function') return;
    const under = document.elementFromPoint(point.x, point.y);
    if (!under?.closest(previewCardSelector(hoveredCardId))) setHoveredCardId(null);
  });
  // A press anywhere closes the preview, and does nothing else (#784): it does not select a card,
  // open a panel, start a hold or start a drag, and its click is swallowed. The listener is on
  // `window` in the capture phase, so it runs before the table's own handlers and dnd-kit's. A
  // press on the card a mouse hovers is the exception: that press acts on the card it previews.
  useEffect(() => {
    if (!previewCardId || draggingInstance) return;
    const onPress = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!heldCardId && hoveredCardId && target?.closest(previewCardSelector(hoveredCardId))) return;
      event.stopPropagation();
      event.preventDefault();
      swallowClickOf(event);
      setHeldCardId(null);
      setHoveredCardId(null);
    };
    window.addEventListener('pointerdown', onPress, true);
    return () => window.removeEventListener('pointerdown', onPress, true);
  }, [previewCardId, heldCardId, hoveredCardId, draggingInstance]);
  const openCrewShip = openCrewShipId ? findInstanceAnywhere(table, openCrewShipId)?.instance : null;
  // The Attempt button of the open away team or crew panel (#1163), given only where `canAttempt` says yes.
  const attemptFrom = (panel: AttemptPanel) => (canAttempt(table, panel) ? () => setAttemptPopup(panel) : undefined);
  const attemptDefaultsOpen = attemptPopup ? attemptDefaults(table, attemptPopup) : null;
  // The popup's Start closes it and every panel, and clears the selection.
  const closeAfterStart = () => {
    setAttemptPopup(null);
    setOpenPile(null);
    setOpenCrewShipId(null);
    setSelectedCardIds([]);
  };
  // Start in a bot game (#1299): the bot draws and chooses its stack, then one `botAttempt` starts
  // the attempt in `'face'`. While it chooses, the popup stays open and undo does nothing.
  const botStart = useBotAttemptStart(
    table,
    (action) => {
      dispatch(action);
      closeAfterStart();
    },
    cardTextOn
  );
  // The undo button and Ctrl/Cmd+Z (#1194): the table goes back to the snapshot of the last log
  // entry, and the entry leaves the log. A panel, a hand or a selection may point at cards the
  // undone table holds elsewhere, so every one of them closes, as after a drag from outside them.
  // Nothing is undone while the bot chooses its stack (#1299): its reply needs the table it drew from.
  // A restored log can have fewer snapshots than entries (#1400, #1401): a save from before #1401 has
  // none, and a full quota keeps only the newest. So the button follows `game.undo` and not the log.
  const lastLogEntry = game.undo.length && game.log.length ? game.log[game.log.length - 1] : null;
  const handleUndo = () => {
    if (draggingRef.current || botStart.choosing || !game.undo.length) return;
    closePanelsAfterDrag(null, game.undo[game.undo.length - 1]);
    setSelectedCardIds([]);
    dispatch({ type: 'undo' });
  };
  // The redo button, Ctrl/Cmd+Shift+Z and Ctrl+Y (#1403): the table goes back to the table the last
  // undone action left, never a new run of it, so a redone shuffle keeps its order, and the entry
  // comes back to the log. It closes the panels as undo does.
  const nextRedo = game.redo.length ? game.redo[game.redo.length - 1] : null;
  const handleRedo = () => {
    if (draggingRef.current || botStart.choosing || !nextRedo) return;
    closePanelsAfterDrag(null, nextRedo.table);
    setSelectedCardIds([]);
    dispatch({ type: 'redo' });
  };
  const undoFromKeyboard = useEffectEvent(() => handleUndo());
  const redoFromKeyboard = useEffectEvent(() => handleRedo());
  useEffect(() => {
    if (!finePointer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey;
      // Cmd+Y is left alone: Safari and Chrome on macOS use it for the history.
      const redo = (key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey) || (key === 'y' && event.ctrlKey);
      if (!undo && !redo) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (undo) undoFromKeyboard();
      else redoFromKeyboard();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finePointer]);
  const openPlacedOnTarget = openPlacedOnTargetId ? findInstanceAnywhere(table, openPlacedOnTargetId)?.instance : null;
  // The cards of whichever card list panel is currently open, if any — only one panel is ever open
  // at a time. Used both to build a multi-select drag's group (`handleDragStart`) and to pass
  // the right card list to whichever `<CardListPanel>` below is rendered.
  // The reveal panel's cards (#1070): the pile's revealed cards, in pile order.
  const revealedCards = openReveal ? table[openReveal.pile].filter((c) => openReveal.ids.includes(c.id)) : null;
  const openPanelCards: CardInstance[] | null = revealedCards
    ? revealedCards
    : openPile
    ? missions[openPile.missionIndex][openPile.pile]
    : openFlatLocation
    ? openFlatLocation === 'core'
      ? core
      : openFlatLocation === 'brig'
      ? brig
      : openFlatLocation === 'drawDeck'
      ? drawDeck
      : openFlatLocation === 'dilemmaPile'
      ? dilemmaPile
      : openFlatLocation === 'discard'
      ? discard
      : dilemmaStack
    : openCrewShip
    ? openCrewShip.crew ?? []
    : openPlacedOnTarget
    ? (openPlacedOnTarget.placedOn ?? []).filter((c) => !openPlacedOnGroup || placedOnGroupOf(c) === openPlacedOnGroup)
    : openShipRowMissionIndex !== null
    ? missions[openShipRowMissionIndex].ships
    : null;
  // A drag that started from a card inside the dilemma stack's own popup (#632's reorder) needs
  // that popup to stay on screen for the rest of the drag: the card the player is aiming at, a
  // neighbour still in the stack, is inside the popup too, so hiding it (the same
  // `hidden={draggingInstance !== null}` every other panel below still uses, `CardListPanel`'s own
  // #598/#611 convention) leaves nothing for the player to aim at. `table` still holds the
  // dragged card in `dilemmaStack` for the whole drag — the reorder/move dispatch only runs at
  // the drop, in `handleDragEnd` — so re-deriving the drag's origin zone here, the same way
  // `dragOrigin` does inside `handleDragEnd` itself, reliably answers "did this drag start in the
  // stack popup" for as long as the drag runs, including one that ends by dropping the card
  // somewhere else entirely (the dilemma hand, a mission): that drop still moves the card, same
  // as before this popup started staying visible for it.
  // The reveal panel of a pile's top cards (#1070) is the other ordered panel, and works the same
  // way. `orderedPanel` names whichever of the two is open: its zone, its cards and its location.
  // The stack's panel counts only in the dilemma choice (#1209): in the facing phase nothing
  // reorders the stack, so its panel hides during a drag like every other flat panel.
  const orderedPanel: { zone: ReorderZone; cards: CardInstance[]; location: PanelLocation } | null =
    openReveal && revealedCards
      ? { zone: openReveal.pile, cards: revealedCards, location: `${openReveal.pile}Reveal` }
      : openFlatLocation === 'dilemmaStack' && table.attempt?.phase === 'choose'
      ? { zone: 'dilemmaStack', cards: dilemmaStack, location: 'dilemmaStack' }
      : null;
  const dragFromOrderedPanel =
    draggingInstance !== null &&
    orderedPanel !== null &&
    findInstanceAnywhere(table, draggingInstance.id)?.zone === orderedPanel.zone;

  // Keeping the popup visible mid-drag (above) is not enough on its own: dnd-kit's collision
  // detection ranks droppables purely by their on-screen rects, oblivious to which element paints
  // on top, so a stack card's own reorder droppable can lose to a mission's `ship-row-<n>` zone
  // that happens to overlap it at a short viewport (#632's review, 568x320). Restricting the
  // candidate droppables by whether the pointer is inside the popup's own row fixes this without
  // touching every other drag on the table: inside the popup, only the stack cards' reorder
  // droppables can win, so a drop there always reorders; outside it, the stack cards are excluded
  // so a drop still reaches whatever zone is under the pointer, same as before this popup started
  // staying open (dnd-kit only reports a stack card as a candidate at all when the pointer is
  // already over its own rect, which only happens inside the popup, so this exclusion never hides
  // a legitimate target elsewhere on the table).
  const orderedPanelCollisionDetection: CollisionDetection = (args) => {
    if (!dragFromOrderedPanel || !orderedPanel) return collisionDetection(args);
    const panelEl = document.querySelector(`[data-testid="card-list-panel-${orderedPanel.location}"]`);
    const panelRect = panelEl?.getBoundingClientRect();
    const pointer = args.pointerCoordinates;
    const insidePanel =
      !!panelRect &&
      !!pointer &&
      pointer.x >= panelRect.left &&
      pointer.x <= panelRect.right &&
      pointer.y >= panelRect.top &&
      pointer.y <= panelRect.bottom;
    const stackCardIds = new Set(orderedPanel.cards.map((c) => c.id));
    const droppableContainers = args.droppableContainers.filter((container) =>
      insidePanel ? stackCardIds.has(String(container.id)) : !stackCardIds.has(String(container.id))
    );
    return collisionDetection({ ...args, droppableContainers });
  };

  if (isPortrait) {
    return <RotateDeviceOverlay />;
  }

  return (
    <>
      {/* Scroll room only. Mobile Safari hides its toolbar when the document scrolls, and keeps it
          hidden only while the document is taller than the toolbar-hidden viewport (100lvh). An
          app added to the home screen has no toolbar, and a scrolled document there takes a tap
          above the finger, so it gets no spacer (#1155). */}
      {fullscreen.standalone !== true && (
        <div aria-hidden="true" data-testid="practice-scroll-spacer" className="h-[calc(100lvh+120px)]" />
      )}
      {debugTaps && <TapDebugOverlay standalone={fullscreen.standalone} />}

      {/* Game layer: fixed inset-0 always fills the visible area as the toolbar shows and hides */}
      <div ref={setGameLayer} data-testid="practice-game-layer" className="fixed inset-0 bg-gradient-page font-body text-text-primary flex flex-col">
        {/* The warning of a Load deck that dropped cards the card data does not have (#1616). */}
        {missingCards > 0 && (
          <div
            className={`fixed top-2 inset-x-0 ${LAYER_LOAD_WARNING} flex justify-center px-4 pointer-events-none`}
            style={safeAreaMargins('top', 'left', 'right')}
          >
            <div
              role="status"
              data-testid="deck-missing-cards-warning"
              className="pointer-events-auto bg-amber-900/90 border border-amber-700 text-amber-100 text-sm rounded-lg px-4 py-2 shadow-xl flex items-center gap-3"
            >
              <span>{missingCardsMessage(missingCards)}</span>
              <PlaytestSignInHint />
              <button
                type="button"
                onClick={() => setMissingCards(0)}
                className="text-amber-200 hover:text-white"
                aria-label="Dismiss"
              >
                <FaTimes />
              </button>
            </div>
          </div>
        )}
        {/* The home for whole-game controls (#722): Reset and Load deck (#780). Rendered outside the
            isEmpty/!isEmpty split below so it's there in both states. */}
        <GameMenu
          open={gameMenuOpen}
          onToggle={() => setGameMenuOpen((open) => !open)}
          onClose={() => setGameMenuOpen(false)}
          onReset={handleResetClick}
          onLoadDeck={handleLoadDeckClick}
          onEditDeck={handleEditDeckClick}
          editDeckDisabled={!online}
          onDecklist={handleDecklistClick}
          onGameLog={handleGameLogClick}
          onControls={handleControlsClick}
          onHomeScreenHelp={() => {
            setGameMenuOpen(false);
            setHomeScreenHelpOpen(true);
          }}
          fullscreen={fullscreen}
          deck={dealtDeck}
          deckName={dealtDeckName()}
          offline={offlineDecks}
          update={serviceWorkerUpdate}
          undoLabel={lastLogEntry ? `Undo: ${logEntryText(lastLogEntry)}` : null}
          onUndo={handleUndo}
          redoLabel={nextRedo ? `Redo: ${logEntryText(nextRedo.entry)}` : null}
          onRedo={handleRedo}
          undoRedoRow={!finePointer && !attemptLayoutShows}
          turnScoreColumn={!attemptLayoutShows}
          turnCounters={turnCountersOn}
          onToggleTurnCounters={() => setTurnCountersOn((on) => !on)}
          cardText={cardTextOn}
          onToggleCardText={() => setCardTextOn((on) => !on)}
          botGame={table.opponent === 'bot'}
          botPileName={table.botPile?.name ?? CHULA_BOT_PILE_NAME}
          touch={!finePointer}
        />
        {decklistOpen && <DecklistPanel deck={dealtDeck} onClose={() => setDecklistOpen(false)} />}
        {gameLogOpen && <GameLogPanel log={game.log} onClose={() => setGameLogOpen(false)} />}
        {turnCountersOn && chipCharges.length > 0 && (
          <ChargeChip
            charges={chipCharges}
            onCorrect={(target, cost, source) => {
              correctCharge(target, cost, source);
              // A correction through the chip keeps it up for its full time again.
              setChargeChip((chip) => (chip ? { ...chip } : chip));
            }}
            onRaiseLimit={(target, delta, source) => {
              raiseLimit(target, delta, source);
              setChargeChip((chip) => (chip ? { ...chip } : chip));
            }}
          />
        )}
        {turnCountersOn && countersListOpen && currentCounters && (
          <TurnCountersList
            charges={turnCharges(game.log, turn)}
            counters={currentCounters}
            onCorrect={correctCharge}
            onRaiseLimit={raiseLimit}
            onAdjustLimit={(delta) => dispatch({ type: 'adjustCounterLimit', delta })}
            pending={pendingDiscountsOf(game.log, turn)}
            onDismiss={(target) => dispatch({ type: 'dismissDiscount', target })}
            onClose={() => setCountersListOpen(false)}
          />
        )}
        {attemptDefaultsOpen && (
          <AttemptDialog
            mission={cardDisplayName(missions[attemptDefaultsOpen.missionIndex].mission!.card)}
            personnel={attemptDefaultsOpen.personnel}
            subtract={attemptDefaultsOpen.subtract}
            bot={table.opponent === 'bot'}
            choosing={botStart.choosing}
            onCancel={() => {
              botStart.cancel();
              setAttemptPopup(null);
            }}
            onStart={(personnel, subtract, bot) => {
              if (bot && table.opponent === 'bot') {
                botStart.start({ ...attemptDefaultsOpen, personnel, subtract, ...bot });
                return;
              }
              dispatch({ type: 'startAttempt', ...attemptDefaultsOpen, personnel, subtract, ...bot });
              closeAfterStart();
            }}
          />
        )}
        {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
        {homeScreenHelpOpen && <HomeScreenHelp onClose={() => setHomeScreenHelpOpen(false)} />}

        {drive.showPicker && !online && (
          <OfflineDeckPicker
            decks={offlineDecks.decks}
            onChoose={(record) => playOfflineDeck(record, true)}
            onClose={drive.closePicker}
          />
        )}

        {drive.showPicker && online && (
          <PracticeDeckPicker
            driveFiles={drive.driveFiles}
            onLoadDilemmas={loadDriveDilemmas}
            onPlayBot={playDriveBot}
            botPiles={botPiles.choices}
            botPilesLoading={botPiles.loading}
            onOpenBotPiles={botPiles.load}
            canKeepCurrent={canKeepCurrentMissionsAndDraw}
            championshipEvents={drive.championshipEvents}
            beginnerDecks={drive.beginnerDecks}
            inProgress={drive.loading}
            onClose={drive.closePicker}
            isSignedIn={!!drive.session}
            hasDriveScope={drive.session?.hasDriveScope ?? false}
            onSignIn={drive.signInToDrive}
            browsedFolder={drive.browsedFolder}
            onBrowseFolder={drive.setBrowsedFolder}
          />
        )}

        {deckNotOffline && (
          <div
            data-testid="deck-not-offline"
            className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-text-muted"
          >
            <p className="text-lg text-text-primary">This deck is not available offline.</p>
            <p className="text-sm">Choose a deck that is available offline to play instead.</p>
            <div className="w-full max-w-sm">
              <OfflineDeckList decks={offlineDecks.decks} onChoose={(record) => playOfflineDeck(record, false)} />
            </div>
          </div>
        )}

        {!deckNotOffline && isEmpty && (
          <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-8">
            <FaLayerGroup className="text-4xl" />
            <p className="text-lg">No draw cards in deck.</p>
            <p className="text-sm">Add cards to your draw deck in the deck builder, then come back here.</p>
            <Link href="/decks" className="mt-4 btn-icon">
              Go to Deck Builder
            </Link>
          </div>
        )}

        {!deckNotOffline && !isEmpty && (
          <DndContext
            sensors={sensors}
            // A ship's own crew drop zone (`crew-<shipId>`) sits nested inside its ship row's
            // drop zone (`ship-row-<idx>`), which is larger, which itself sits inside its
            // mission column. dnd-kit's default collision detection (`rectIntersection`) ranks
            // the droppable with the greatest overlap ratio first, which is usually one of the
            // bigger enclosing zones, not the smaller one nested inside it — so a personnel or
            // equipment card dropped on a ship would file into the mission's personnel pile
            // instead of boarding (#645). `collisionDetection` re-ranks the same overlap set by
            // area instead, smallest first, so the most-nested zone the dragged card touches
            // always wins.
            collisionDetection={orderedPanelCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* The dragged card's type, shared with every drop zone so each one can show its own
                highlight during a drag (#608). `draggingInstance` already tracks it for the drag
                overlay below. */}
            <DraggedCardTypeProvider value={draggingInstance?.card.type ?? null}>
            <LandedZoneProvider value={landedZones}>
            <CardHoldProvider value={cardHold}>
            <PlaceOnHoldProvider value={placeOnHold}>
            <RangeUsedProvider value={rangeUsedInfo}>
            {/* Each padding grows by the safe-area inset of its side (#1383, #1384), so the bottom
                row clears the home indicator, the table clears the notch, and the background stays
                full-bleed under both. The scale hooks read the bottom padding from the computed
                style, and get the side insets as numbers. */}
            <div className="flex flex-col flex-1 p-4" style={contentPadding(safeArea)}>
              {/* The attempt layout (#1164) in place of the mission row while an attempt is in
                  progress. Only one of the two is mounted, so each droppable is mounted once: the
                  parked attempt layout of #1342 mounts only the row, with its droppable disabled. */}
              {(attemptLayoutShows || attemptLayoutParked) && table.attempt ? (
                <AttemptLayout
                  parked={!attemptLayoutShows}
                  viewFullTableHoldEnabled={viewFullTableHoldEnabled}
                  modifiersText={attemptModifiersText(table)}
                  donePrompt={attemptDonePrompt(table)}
                  attempt={table.attempt}
                  slot={missions[table.attempt.missionIndex]}
                  sizes={attemptSizes}
                  personnelCount={attemptPersonnelCards?.length ?? 0}
                  desktop={finePointer}
                  layoutRef={setAttemptLayoutEl}
                  stripRef={setAttemptStrip}
                  onViewFullTable={() => setFullTableFor(attemptKey)}
                  onEndAttempt={() => dispatch({ type: 'endAttempt' })}
                  onOpenPile={(missionIndex, pile) => openOnlyMissionPile(missionIndex, pile)}
                  onShipClick={handleShipClick}
                  onOpenShipRow={(missionIndex) => openOnlyShipRowPanel(missionIndex)}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                  onFlipMission={(id) => dispatch({ type: 'flipMission', id })}
                  onSetMissionCompleted={(missionIndex, completed) =>
                    dispatch({ type: 'setMissionCompleted', missionIndex, completed })
                  }
                  selectedIds={selectedCardIds}
                  botMarks={botRowMarks}
                  onToggleSelect={toggleCardSelection}
                  onSetStopped={setStoppedForSelection}
                  onShuffle={(location) => dispatch({ type: 'shuffle', location })}
                  moveDestinations={attemptMoveDestinations(table)}
                  onMoveSelection={moveAttemptSelection}
                  canDrawDilemma={dilemmaPile.length > 0}
                  onDrawDilemma={drawChoiceDilemma}
                  onSetPhase={setAttemptPhase}
                  dilemmaStack={
                    table.attempt.phase === 'choose' ? (
                      <DilemmaStackFaceUp
                        stack={dilemmaStack}
                        onOpen={() => openOnlyFlatZone('dilemmaStack')}
                        width={attemptSizes.choice.stackWidth}
                        height={attemptSizes.choice.stackHeight}
                        cardWidth={attemptSizes.choice.stackCardWidth}
                        cardHeight={attemptSizes.choice.stackCardHeight}
                        wholeCards={attemptSizes.choice.stackWholeCards}
                      />
                    ) : (
                    <DilemmaStackPile
                      stack={dilemmaStack}
                      onOpen={() => openOnlyFlatZone('dilemmaStack')}
                      onReveal={() => dispatch({ type: 'flip', id: dilemmaStack[0].id })}
                      // #1536: in a bot game the empty stack of `'face'` shows its outline.
                      visible={dilemmaStackVisible || table.opponent === 'bot'}
                      choseNone={!!table.attempt.botChoseNone}
                      width={attemptSizes.stackWidth}
                      height={attemptSizes.stackHeight}
                      cardWidth={attemptSizes.stackCardWidth}
                      botLabel={botLabelText}
                      onDismissBotLabel={() => {
                        if (botLabel) setDismissedBotLabels((ids) => new Set(ids).add(botLabel.id));
                      }}
                      resolvePreview={botResolvePreview}
                      resolved={botResolved}
                      resolvePending={botResolvePending}
                      onResolve={resolveRevealedDilemma}
                    />
                    )
                  }
                />
              ) : null}
              {attemptLayoutParked && (
                <RemeasureDroppables sizes={[scale, missionScale, shipRows, flatWidths, panelBottom, bottomRowScale]} />
              )}
              {!attemptLayoutShows && (
                <>
              {/* Mission row: 5 positional slots dealt face up on a new game and on reset (#597),
                  across the full width. The dilemma stack lives only in the attempt layout
                  (#1170), so the full table shows none, during an attempt too. The row moves
                  down once the dilemmas under a mission poke out past the padding above it (#968). */}
              <div
                ref={setMissionRows}
                className="flex flex-row gap-2 justify-center items-start"
                style={{
                  paddingTop: underMissionHeadroom(missionScale, finePointer),
                  // The row keeps the column left of it free for the turn and score controls
                  // (#1337, #1451), the reservation `useMissionScale` sized the row for.
                  paddingLeft: TOUCH_CONTROLS_COLUMN,
                  paddingRight: MENU_BUTTON_GUTTER,
                }}
              >
                <MissionRow
                  missions={missions}
                  onOpenPile={(missionIndex, pile) => openOnlyMissionPile(missionIndex, pile)}
                  onShipClick={handleShipClick}
                  onOpenShipRow={(missionIndex) => openOnlyShipRowPanel(missionIndex)}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                  onFlipMission={(id) => dispatch({ type: 'flipMission', id })}
                  onSetMissionCompleted={(missionIndex, completed) =>
                    dispatch({ type: 'setMissionCompleted', missionIndex, completed })
                  }
                  attempt={table.attempt}
                  onBackToAttempt={() => setFullTableFor(null)}
                  scale={missionScale}
                  shipRows={shipRows}
                  desktop={finePointer}
                  slotBudget={desktopMissionSlotBudget(gameLayerWidth, safeAreaSides, DESKTOP_FULL_TABLE_RESERVE)}
                />
              </div>
              <TurnScoreColumn
                turn={turn}
                segment={table.segment}
                next={nextSegmentOf(table)}
                score={score}
                onNextTurn={nextTurn}
                onAdjustScore={adjustScore}
                compact={turnScoreColumnCompact({
                  systemControls: fullscreen.isFullscreen && fullscreen.systemControlsInset,
                  top: turnScoreTop + safeArea.top,
                  // The column reaches the bottom edge, since the closed hand left the bottom row (#1489).
                  roomBottom: gameLayerHeight > 0 ? gameLayerHeight - safeArea.bottom - CONTENT_PADDING : 0,
                })}
                top={turnScoreTop}
                touch={!finePointer}
                counters={currentCounters}
                onOpenCounters={() => setCountersListOpen(true)}
              />
                </>
              )}

              {/* Bottom row, anchored to the bottom. From left to right: discard pile, draw pile,
                  core, brig. The dilemma pile is the rightmost zone, at the right edge. The row
                  starts right of the left column (`TOUCH_CONTROLS_COLUMN`), as the mission row does,
                  so the column runs down to the bottom edge, and the closed hands are small fans on
                  top of the core and the brig that take no width here (#1489). The
                  push-below-the-viewport offset (#130, #636) is gone entirely now (#682): every
                  zone here fits the table's own height, so `items-end` alone aligns every zone's
                  bottom edge to this row's own bottom edge, the same edge core and the brig
                  already used. */}
              <div
                ref={setBottomRow}
                className="mt-auto flex flex-row items-end gap-2"
                style={{ paddingLeft: TOUCH_CONTROLS_COLUMN }}
              >
                <div className="flex flex-row items-end gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <DiscardPile
                      topCard={discard[discard.length - 1]}
                      count={discard.length}
                      onOpen={() => openOnlyFlatZone('discard')}
                      rowScale={bottomRowScale}
                    />
                  </div>

                  {/* The draw deck, with its Shuffle, Download (#690) and reveal (#1070) buttons
                      stacked over its left edge (`PileControls`). The turn and score controls sit in
                      the column left of the missions on either device (#1337, #1451). */}
                  <div className="flex flex-row items-end">
                    <PileControls
                      label="draw deck"
                      shuffleLabel="Shuffle"
                      count={drawDeck.length}
                      onShuffle={() => shufflePile('drawDeck')}
                      onDownload={() => openOnlyFlatZone('drawDeck')}
                      onReveal={() => openOnlyRevealPanel('drawDeck')}
                    />
                    <div data-testid="draw-deck-column" className="flex flex-col items-center gap-1">
                      {/* The draw deck (#743): the same top/bottom drop-half split as the dilemma
                          pile, so a card dragged from any zone can be filed back in at either
                          end of the deck, not only drawn from the top. */}
                      <DrawPileButton
                        count={drawDeck.length}
                        topCard={drawDeck[0]}
                        onDraw={drawOne}
                        showPositionLabel={draggingInstance !== null}
                        shuffleCount={shuffleCounts.drawDeck}
                        rowScale={bottomRowScale}
                      />
                    </div>
                  </div>

                </div>

                {/* The core and the brig share the bottom row's free space (#1029), measured
                    here, and grow into it as cards are added. */}
                <div ref={setFlatRows} data-testid="flat-rows" className="flex-1 min-w-0 flex flex-row items-end gap-2">
                {/* Core: any card, usually events (#603). A tap on a card opens the core's own
                    card list panel (#640). */}
                <FlatCardRow
                  zone="core"
                  label="Core"
                  cards={core}
                  maxWidth={flatWidths.core}
                  maxOffset={flatRowMaxOffset(bottomRowScale)}
                  rowScale={bottomRowScale}
                  onOpen={() => openOnlyFlatZone('core')}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                />

                {/* Brig: captured personnel, though the zone accepts any card type (#603). A tap
                    on a card opens the brig's own card list panel (#640). */}
                <FlatCardRow
                  zone="brig"
                  label="Brig"
                  cards={brig}
                  maxWidth={flatWidths.brig}
                  maxOffset={flatRowMaxOffset(bottomRowScale)}
                  rowScale={bottomRowScale}
                  onOpen={() => openOnlyFlatZone('brig')}
                  onOpenPlacedOn={openOnlyPlacedOnPanel}
                />
                </div>

                {/* The dilemma pile stays the rightmost zone. */}
                <div className="ml-auto flex flex-row items-end gap-2">
                  {/* Dilemma pile, with the same stacked buttons as the draw deck (#1070). The
                      Shuffle button has its own accessible name, so it is told apart from the
                      draw deck's "Shuffle" button (#785). The arc of either open hand ends at the
                      left edge of this group, its buttons included (#1125, #1150). */}
                  <div data-testid="dilemma-pile-group" className="flex flex-row items-end">
                    <PileControls
                      label="dilemma pile"
                      shuffleLabel="Shuffle dilemma pile"
                      count={dilemmaPile.length}
                      onShuffle={() => shufflePile('dilemmaPile')}
                      onDownload={() => openOnlyFlatZone('dilemmaPile')}
                      onReveal={() => openOnlyRevealPanel('dilemmaPile')}
                    />
                    <DilemmaPileButton
                      count={dilemmaPile.length}
                      topCard={dilemmaPile[0]}
                      showPositionLabel={draggingInstance?.card.type === 'dilemma'}
                      shuffleCount={shuffleCounts.dilemmaPile}
                      rowScale={bottomRowScale}
                    />
                  </div>
                </div>
              </div>

              {/* The two hands (#1489). Each draws its closed fan and its open arc in the game layer,
                  so neither takes a place in the bottom row. The dilemma hand shows only in the
                  dilemma choice (#1223), and there even with no cards (#631), as a drop target for a
                  dilemma dragged back from the stack. */}
              {/* Hand. `selectedIds`/`onToggleSelect` let the player select more than one
                  card here and drag them together (#691), the same as a card list panel (#677);
                  closing the hand clears the selection. */}
              <CardHand
                instances={hand}
                open={openHand === 'hand'}
                onOpen={() => {
                  // One open hand at a time (#1489): opening it from the other hand's arc closes that one.
                  if (openHand === 'dilemmaHand') setSelectedCardIds([]);
                  setOpenHand('hand');
                }}
                onClose={() => {
                  setOpenHand(null);
                  setSelectedCardIds([]);
                }}
                dragging={draggingInstance !== null}
                portalContainer={gameLayer}
                passthroughZone={[
                  DRAW_PILE_TOP_DROPPABLE_ID,
                  DRAW_PILE_BOTTOM_DROPPABLE_ID,
                  'attempt-draw-dilemma',
                  // A tap on the closed dilemma hand opens it in place of this hand (#1489).
                  'dilemmaHand',
                ]}
                selectedIds={selectedCardIds}
                onToggleSelect={toggleCardSelection}
                onSelectIds={setSelectedCardIds}
                onSendSelected={(position) => sendHandSelectionToDeck('hand', position)}
                openCardWidth={viewerCardWidth}
                bottomInset={panelBottom}
                arcBetween={HAND_ARC_BETWEEN}
                finePointer={finePointer}
                safeAreaBottom={safeArea.bottom}
                rowScale={bottomRowScale}
                closedFanAnchor={CLOSED_FAN_ANCHOR}
                // Only the dilemma choice shows the dilemma hand, at the right end of the core and
                // brig box, so only there the hand keeps the left end; elsewhere it sits in the
                // middle of the screen (#1496).
                closedFanSide={dilemmaHandShows ? 'left' : 'center'}
              />
              {dilemmaHandShows && (
                <CardHand
                  instances={dilemmaHand}
                  open={openHand === 'dilemmaHand'}
                  onOpen={() => {
                    if (openHand === 'hand') setSelectedCardIds([]);
                    setOpenHand('dilemmaHand');
                  }}
                  onClose={() => {
                    setOpenHand(null);
                    setSelectedCardIds([]);
                  }}
                  dragging={draggingInstance !== null}
                  portalContainer={gameLayer}
                  zone="dilemmaHand"
                  label="dilemma hand"
                  openCardWidth={viewerCardWidth}
                  bottomInset={panelBottom}
                  passthroughZone={[
                    DRAW_PILE_TOP_DROPPABLE_ID,
                    DRAW_PILE_BOTTOM_DROPPABLE_ID,
                    'attempt-draw-dilemma',
                    'hand',
                  ]}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onSendSelected={(position) => sendHandSelectionToDeck('dilemmaHand', position)}
                  deckLabel="dilemma pile"
                  arcBetween={HAND_ARC_BETWEEN}
                  finePointer={finePointer}
                  safeAreaBottom={safeArea.bottom}
                  rowScale={bottomRowScale}
                  closedFanAnchor={CLOSED_FAN_ANCHOR}
                  closedFanSide="right"
                />
              )}

              {/* The large card preview, shown only while a card is held (`useCardHold`). It is
                  read-only and takes no pointer events. `hidden` hides it during a drag. A hover preview
                  does not dim the table (#985). */}
              {held && (
                <CardPreview
                  instance={held.instance}
                  hidden={draggingInstance !== null}
                  side={heldCardId ? heldSide : hoveredSide}
                  markFaceDown={!isAwayTeamZone(held.zone)}
                  dim={heldCardId !== null}
                />
              )}

              {/* A mission's personnel or event card list panel (#602), opened by tapping its badge.
                  `selectedIds`/`onToggleSelect` let the player select more than one card here and
                  drag them together (#677); closing the panel clears the selection. */}
              {openPile && (
                <CardListPanel
                  location={openPile.pile}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenPile(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() =>
                    dispatch({
                      type: 'shuffle',
                      location: { zone: 'missionPile', missionIndex: openPile.missionIndex, pile: openPile.pile },
                    })
                  }
                  onSetStopped={setStoppedForSelection}
                  onFlip={flipSelection}
                  onDiscard={discardSelection}
                  onAttempt={
                    openPile.pile === 'awayTeam'
                      ? attemptFrom({ kind: 'awayTeam', missionIndex: openPile.missionIndex })
                      : undefined
                  }
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  // #1071: on a phone or a tablet the crew and away team grids show the art crop.
                  artCrop={!finePointer}
                  bottomInset={panelBottom}
                />
              )}

              {/* The core's or the brig's own card list panel (#640), opened by tapping a card
                  already sitting in that zone; or the draw pile's/the dilemma pile's own download
                  panel (#690), opened by the new download control beside each one. */}
              {openFlatLocation && (
                <CardListPanel
                  location={openFlatLocation}
                  cards={openPanelCards ?? []}
                  choosingDilemmas={table.attempt?.phase === 'choose'}
                  onClose={() => {
                    setOpenFlatLocation(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  // In the facing phase nothing reorders the dilemma stack, Shuffle neither (#1209).
                  onShuffle={
                    openFlatLocation === 'discard' ||
                    (openFlatLocation === 'dilemmaStack' && table.attempt?.phase !== 'choose')
                      ? undefined
                      : () => dispatch({ type: 'shuffle', location: openFlatLocation })
                  }
                  // A card in a deck pile is never stopped (#902), so the draw deck's and the dilemma
                  // pile's panels get no Stop button, and neither does the discard's.
                  onSetStopped={
                    openFlatLocation === 'discard' || isDownloadPile(openFlatLocation)
                      ? undefined
                      : setStoppedForSelection
                  }
                  onDiscard={openFlatLocation === 'discard' ? undefined : discardSelection}
                  onSetRemovedFromGame={openFlatLocation === 'discard' ? setRemovedFromGameForSelection : undefined}
                  // The dilemma pile's Download moves cards into the dilemma hand, so it is offered only
                  // while the dilemma hand shows (#1223).
                  onDownload={
                    isDownloadPile(openFlatLocation) && (openFlatLocation === 'drawDeck' || dilemmaHandShows)
                      ? (ids) => downloadSelection(openFlatLocation, ids)
                      : undefined
                  }
                  hidden={draggingInstance !== null && !dragFromOrderedPanel}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* The reveal panel of the draw deck's or the dilemma pile's top or bottom cards (#1070,
                  #1078), opened by the eye beside the pile. It starts empty, and "Reveal top" or
                  "Reveal bottom" adds the next card from that end. Closing it forgets what was revealed. No Shuffle, no Discard, no
                  Download: only Top and Bottom act on the selection. */}
              {openReveal && (
                <CardListPanel
                  location={`${openReveal.pile}Reveal`}
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenReveal(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  revealEnd={openReveal.end}
                  onReveal={revealFrom}
                  // The button for the end shown is enabled while a card is left unrevealed; the
                  // other end's button, while the pile has a card, since its tap starts over.
                  canRevealTop={
                    openReveal.end === 'top'
                      ? table[openReveal.pile].some((c) => !openReveal.ids.includes(c.id))
                      : table[openReveal.pile].length > 0
                  }
                  canRevealBottom={
                    openReveal.end === 'bottom'
                      ? table[openReveal.pile].some((c) => !openReveal.ids.includes(c.id))
                      : table[openReveal.pile].length > 0
                  }
                  onSendToDeck={sendRevealSelectionToDeck}
                  hidden={draggingInstance !== null && !dragFromOrderedPanel}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* A ship's crew panel: opened by a tap on a ship (`handleShipClick`). It shows
                  the ship in its own section above the crew (#832). */}
              {openCrewShip && (
                <CardListPanel
                  location="crew"
                  cards={openPanelCards ?? []}
                  host={openCrewShip}
                  onClose={() => {
                    setOpenCrewShipId(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() => dispatch({ type: 'shuffle', location: { zone: 'crew', shipId: openCrewShip.id } })}
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  onAttempt={attemptFrom({ kind: 'crew', shipId: openCrewShip.id })}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  // #1071: on a phone or a tablet the crew and away team grids show the art crop.
                  artCrop={!finePointer}
                  bottomInset={panelBottom}
                />
              )}

              {/* The cards placed on a card (#810): opened by a tap on a card in the core or the
                  brig with cards on it, or by a tap on a mission card's counter of the cards on it
                  (#813). A mission card has two counters (#1081), one of its events and one of its
                  dilemmas, and each opens only its own group, with a title of its own. A ship has no second tap region (#963): the cards on a ship show in its
                  crew panel, as tiny cards below the ship, and leave the ship by a drag out of
                  there. A placed card leaves a card by a drag out of here.
                  No Shuffle: `shuffle` has no location for the placed cards. */}
              {openPlacedOnTarget && (
                <CardListPanel
                  location={
                    openPlacedOnGroup === 'events' ? 'onEvents' : openPlacedOnGroup === 'dilemmas' ? 'onDilemmas' : 'on'
                  }
                  cards={openPanelCards ?? []}
                  host={openPlacedOnTarget}
                  onClose={() => {
                    setOpenPlacedOnTargetId(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}

              {/* A mission's ship-row list panel (#713): opened by a tap on any ship once that
                  row holds more ships than fit without overlap (`ShipRow`), listing every ship on
                  it individually. A tap on a ship here selects it, the same as a tap inside any
                  other panel — it does not open a crew panel, since a second panel would break
                  the one-panel-at-a-time invariant of #711. */}
              {openShipRowMissionIndex !== null && (
                <CardListPanel
                  location="shipRow"
                  cards={openPanelCards ?? []}
                  onClose={() => {
                    setOpenShipRowMissionIndex(null);
                    setSelectedCardIds([]);
                  }}
                  selectedIds={selectedCardIds}
                  onToggleSelect={toggleCardSelection}
                  onSelectIds={setSelectedCardIds}
                  onShuffle={() =>
                    dispatch({ type: 'shuffle', location: { zone: 'shipRow', missionIndex: openShipRowMissionIndex } })
                  }
                  onSetStopped={setStoppedForSelection}
                  onDiscard={discardSelection}
                  hidden={draggingInstance !== null}
                  cardWidth={viewerCardWidth}
                  cardHeight={viewerCardHeight}
                  bottomInset={panelBottom}
                />
              )}
            </div>
            </RangeUsedProvider>
            </PlaceOnHoldProvider>
            </CardHoldProvider>
            </LandedZoneProvider>
            </DraggedCardTypeProvider>

            <DragOverlay modifiers={overlayModifiers}>
              {draggingInstance && (
                // dnd-kit measures this, the overlay's only child, as `overlayNodeRect`, and its
                // wrapper is the size of the source card. `w-fit` keeps this box the size of the
                // card image, so `centerOnPointer` centres the image, not the source card's width (#955).
                // The `data-testid` lets `scripts/watch_landed.sh` see the overlay come and go (#1036).
                <div data-testid="drag-overlay-card" className="relative w-fit">
                  <img
                    src={draggingShowsBack ? '/cardimages/cardback.jpg' : cardImageUrl(draggingInstance.card)}
                    width={120}
                    height={167}
                    alt={draggingShowsBack ? 'Face-down card' : cardDisplayName(draggingInstance.card)}
                    className="rounded-lg shadow-md w-14 h-auto"
                    style={PILE_CARD_BORDER_STYLE}
                  />
                  {/* Shows how many cards this drag carries (#677), for a multi-select drag. */}
                  {draggingGroup.length > 1 && <CountBadge count={draggingGroup.length} />}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
}

export default function PracticeTable() {
  return (
    <Suspense>
      <PracticeDrawContent />
    </Suspense>
  );
}

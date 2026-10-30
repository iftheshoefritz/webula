import React, { useState } from 'react';
import { FaFolder } from 'react-icons/fa';
import { DRIVE_LIST_ROW_CLASS } from './DriveListRow';
import { DriveBackRow } from './useDriveFolderView';
import type { DriveFile } from './useDriveFolderView';
import { championshipDeckId, championshipDeckTitle } from '../../lib/championshipDecks';
import type { ChampionshipDeck, ChampionshipEvent } from '../../lib/championshipDecks';
import { beginnerDeckDetails, beginnerDeckId, beginnerDeckTitle } from '../../lib/beginnerDecks';
import type { BeginnerDeck } from '../../lib/beginnerDecks';

export const CHAMPIONSHIP_FOLDER_NAME = 'Championship decks';
export const BEGINNER_FOLDER_NAME = 'Beginner decks';

// Which folder of public decks the picker is inside, if any: the "Championship decks" folder, at its
// root (`event` null) or in one event, or the "Beginner decks" folder, which has no event level.
type PublicFolderView = { folder: 'championship'; event: string | null } | { folder: 'beginner' } | null;

type Options = {
  /** True lists the "Championship decks" folder row. */
  showChampionship: boolean
  championshipEvents: ChampionshipEvent[]
  /** True lists the "Beginner decks" folder row. */
  showBeginner: boolean
  beginnerDecks: BeginnerDeck[]
  /**
   * The controls of a public deck's row. `file` carries the deck's id (`championship:` or
   * `beginner:`) and its title as the name; `label` is the row's short name, for aria-labels.
   */
  renderDeckControls: (file: DriveFile, label: string) => React.ReactNode
}

const FOLDER_BUTTON_CLASS = 'flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate';

// The read-only folders of public decks (#1310, #1323), shared by the deck builder's picker,
// `DrivePickerModal`, and the practice table's, `PracticeDeckPicker` (#1390). The folder that is
// open is the hook's own state, so it resets when the picker unmounts. Each picker draws a deck's
// controls with `renderDeckControls`.
export function usePublicFolders({
  showChampionship,
  championshipEvents,
  showBeginner,
  beginnerDecks,
  renderDeckControls,
}: Options) {
  const [view, setView] = useState<PublicFolderView>(null);

  const championshipView = showChampionship && view?.folder === 'championship' ? view : null;
  const isBrowsingChampionship = championshipView !== null;
  const isBrowsingBeginner = showBeginner && view?.folder === 'beginner';
  const isBrowsingPublicFolder = isBrowsingChampionship || isBrowsingBeginner;
  const browsedEvent = championshipView !== null && championshipView.event !== null
    ? championshipEvents.find((e) => e.event === championshipView.event)
    : undefined;

  // A Championship deck's row (#1310): its name and player, and the controls of the picker.
  const renderChampionshipDeckRow = (deck: ChampionshipDeck) => {
    const id = championshipDeckId(deck);
    const label = `${deck.deckName} - ${deck.player}`;
    return (
      <li key={id} className={DRIVE_LIST_ROW_CLASS} data-testid="championship-deck-row">
        <span className="flex-1 min-w-0 px-3 truncate" title={label}>
          {deck.deckName} <span className="text-text-secondary">- {deck.player}</span>
        </span>
        {renderDeckControls({ id, name: championshipDeckTitle(deck) }, label)}
      </li>
    );
  };

  // A Beginner Deck's row (#1323): its name, its complexity level and its style, and the controls
  // of the picker. It has no link to the strategy article (#1325).
  const renderBeginnerDeckRow = (deck: BeginnerDeck) => {
    const id = beginnerDeckId(deck);
    const details = beginnerDeckDetails(deck);
    return (
      <li key={id} className={DRIVE_LIST_ROW_CLASS} data-testid="beginner-deck-row">
        <span className="flex-1 min-w-0 px-3 truncate" title={`${deck.deckName} — ${details}`}>
          {deck.deckName} <span className="text-text-secondary">— {details}</span>
        </span>
        {renderDeckControls({ id, name: beginnerDeckTitle(deck) }, deck.deckName)}
      </li>
    );
  };

  // Inside the open folder: the back row, then the events or the decks. These rows replace the
  // picker's list while a folder is open.
  const browseRows = isBrowsingChampionship ? (
    <>
      <DriveBackRow
        folder={{ id: 'championship', name: browsedEvent?.event ?? CHAMPIONSHIP_FOLDER_NAME }}
        onBack={() => setView(browsedEvent ? { folder: 'championship', event: null } : null)}
      />
      {!browsedEvent && championshipEvents.map((event) => (
        <li key={event.event} className={DRIVE_LIST_ROW_CLASS}>
          <button
            type="button"
            className={FOLDER_BUTTON_CLASS}
            onClick={() => setView({ folder: 'championship', event: event.event })}
            title={event.event}
          >
            <FaFolder className="inline mr-2" />{event.event}
          </button>
        </li>
      ))}
      {!browsedEvent && championshipEvents.length === 0 && (
        <li className="text-text-primary px-3 py-1">please wait...</li>
      )}
      {browsedEvent?.decks.map((deck) => renderChampionshipDeckRow(deck))}
    </>
  ) : isBrowsingBeginner ? (
    <>
      <DriveBackRow folder={{ id: 'beginner', name: BEGINNER_FOLDER_NAME }} onBack={() => setView(null)} />
      {beginnerDecks.length === 0 && (
        <li className="text-text-primary px-3 py-1">please wait...</li>
      )}
      {beginnerDecks.map((deck) => renderBeginnerDeckRow(deck))}
    </>
  ) : null;

  const championshipFolderRow = showChampionship && (
    <li className={DRIVE_LIST_ROW_CLASS}>
      <button
        type="button"
        className={FOLDER_BUTTON_CLASS}
        onClick={() => setView({ folder: 'championship', event: null })}
        title={CHAMPIONSHIP_FOLDER_NAME}
      >
        <FaFolder className="inline mr-2" />{CHAMPIONSHIP_FOLDER_NAME}
      </button>
    </li>
  );

  const beginnerFolderRow = showBeginner && (
    <li className={DRIVE_LIST_ROW_CLASS}>
      <button
        type="button"
        className={FOLDER_BUTTON_CLASS}
        onClick={() => setView({ folder: 'beginner' })}
        title={BEGINNER_FOLDER_NAME}
      >
        <FaFolder className="inline mr-2" />{BEGINNER_FOLDER_NAME}
      </button>
    </li>
  );

  // The two folder rows, Championship first, for the picker's root list.
  const folderRows = (
    <>
      {championshipFolderRow}
      {beginnerFolderRow}
    </>
  );

  return { isBrowsingPublicFolder, browseRows, folderRows };
}

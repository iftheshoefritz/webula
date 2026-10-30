import React, { useState } from 'react';
import Link from 'next/link';
import { FaArrowLeft, FaEdit, FaFolder } from 'react-icons/fa';
import { DriveModalShell } from '../../../components/drivePicker/DriveModalShell';
import { DriveSignInRows } from '../../../components/drivePicker/DriveSignInRows';
import { DriveListRow } from '../../../components/drivePicker/DriveListRow';
import { DriveBackRow, useDriveFolderView } from '../../../components/drivePicker/useDriveFolderView';
import type { DriveFile, DriveItem } from '../../../components/drivePicker/useDriveFolderView';
import { usePublicFolders } from '../../../components/drivePicker/usePublicFolders';
import type { ChampionshipEvent } from '../../../lib/championshipDecks';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';

// Where the missions and draw deck of a two-step load come from (#1114): a Drive deck or a public
// folder deck (#1390), whose `file` holds its `championship:` or `beginner:` id and its title, or
// the deck dealt now.
export type MissionsAndDrawSource = { kind: 'drive'; file: DriveFile } | { kind: 'current' };

type Props = {
  driveFiles: DriveItem[]
  inProgress: boolean
  isSignedIn: boolean
  hasDriveScope: boolean
  onSignIn: () => void
  browsedFolder: DriveFile | null
  onBrowseFolder: (folder: DriveFile | null) => void
  // Step 2's Load dilemmas: deals the missions and draw deck of step 1 with this deck's dilemmas.
  onLoadDilemmas: (source: MissionsAndDrawSource, dilemmaFile: DriveFile) => void
  // Step 2's Play against the bot (#1290): deals the missions and draw deck of step 1 with the
  // dilemma bot's Chula pile.
  onPlayBot: (source: MissionsAndDrawSource) => void
  // Whether a deck with missions or a draw deck is dealt now, for "Keep the current missions and draw deck".
  canKeepCurrent: boolean
  // The Championship decks the user sees, by event, and the Beginner Decks (#1390). The
  // "Championship decks" folder shows only when one of its decks is visible.
  championshipEvents?: ChampionshipEvent[]
  beginnerDecks?: BeginnerDeck[]
  onClose: () => void
}

// Opens the deck in the deck builder, in the same tab (#1111): a new tab breaks the home-screen app (#922).
export const editDeckHref = (file: DriveFile) =>
  `/decks?driveFile=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`;

const TEXT_BUTTON_CLASS =
  'h-6 px-2 text-xs bg-white/[0.05] border border-white/10 rounded-md text-text-secondary ' +
  'hover:text-text-primary hover:bg-white/[0.1] transition-colors duration-150 cursor-pointer ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

// The Drive picker of the practice table's Load deck (#1109). It only loads: deck management
// (move, rename, delete, new folder) stays in the deck builder's picker, `DrivePickerModal`. With
// no decks it links to the deck builder, in the same tab, since the home-screen app has no tab bar
// (#922). Each deck's Edit button opens it in the deck builder (#1111).
//
// At the root it also lists the read-only "Championship decks" and "Beginner decks" folders
// (#1390), to every user, signed out too. A folder deck has the step's button and no Edit button,
// since the deck builder's `?driveFile=` link resolves only Drive ids.
//
// It loads in two steps (#1114, #1290). Step 1 picks the missions and draw deck, of a deck or the
// current ones, and step 2 picks the deck whose dilemmas join them, the step-1 deck too for its
// whole deck, or Play against the bot. Nothing loads until the last choice, so a close at either
// step keeps the game.
export const PracticeDeckPicker: React.FC<Props> = ({
  driveFiles,
  inProgress,
  isSignedIn,
  hasDriveScope,
  onSignIn,
  browsedFolder,
  onBrowseFolder,
  onLoadDilemmas,
  onPlayBot,
  canKeepCurrent,
  championshipEvents = [],
  beginnerDecks = [],
  onClose,
}) => {
  const { isBrowsingFolder, rootFolders, visibleDeckFiles } = useDriveFolderView(driveFiles, browsedFolder);
  const ready = isSignedIn && hasDriveScope;
  // Set by step 1's choice of missions and draw deck; null on step 1.
  const [source, setSource] = useState<MissionsAndDrawSource | null>(null);

  const title = source === null
    ? 'Your decks'
    : source.kind === 'drive'
      ? `Dilemmas for ${source.file.name}`
      : 'Dilemmas for the current missions and draw deck';

  const deckActions = (file: DriveFile) =>
    source === null ? (
      <button
        type="button"
        aria-label={`Load the missions and draw deck of ${file.name}`}
        className={TEXT_BUTTON_CLASS}
        onClick={() => setSource({ kind: 'drive', file })}
      >
        Missions + draw
      </button>
    ) : (
      <button
        type="button"
        aria-label={`Load the dilemmas of ${file.name}`}
        className={TEXT_BUTTON_CLASS}
        onClick={() => onLoadDilemmas(source, file)}
      >
        Dilemmas
      </button>
    );

  // The public folders show at the root only, not inside a Drive folder, and not while the Drive
  // list loads. Each shows once its index has loaded a deck, so a failed fetch hides it.
  const showPublicFolders = !isBrowsingFolder && !(ready && inProgress);
  const showChampionship = showPublicFolders && championshipEvents.length > 0;
  const showBeginner = showPublicFolders && beginnerDecks.length > 0;
  const { isBrowsingPublicFolder, browseRows: publicBrowseRows, folderRows: publicFolderRows } = usePublicFolders({
    showChampionship,
    championshipEvents,
    showBeginner,
    beginnerDecks,
    renderDeckControls: (file) => (
      <div className="flex items-center gap-1 whitespace-nowrap shrink-0">{deckActions(file)}</div>
    ),
  });
  // The step bar shows whenever there is something to pick: the Drive list, or a public folder.
  const canPick = (ready && !inProgress) || showChampionship || showBeginner;

  return (
    <DriveModalShell title={<span title={title}>{title}</span>} onClose={onClose} testId="practice-deck-picker">
      {canPick && (
        <div className="flex items-center gap-2 px-1 pb-1">
          {source === null ? (
            <button
              type="button"
              aria-label="Keep the current missions and draw deck"
              className={TEXT_BUTTON_CLASS}
              disabled={!canKeepCurrent}
              onClick={() => setSource({ kind: 'current' })}
            >
              Keep the current missions and draw deck
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="Back"
                className={TEXT_BUTTON_CLASS}
                onClick={() => setSource(null)}
              >
                <FaArrowLeft className="inline mr-1" />Back
              </button>
              <button
                type="button"
                aria-label="Play against the bot"
                data-testid="practice-deck-picker-play-bot"
                className={TEXT_BUTTON_CLASS}
                onClick={() => onPlayBot(source)}
              >
                Play against the bot
              </button>
            </>
          )}
        </div>
      )}
      <div className="max-h-[min(16rem,50vh)] overflow-y-auto overflow-x-hidden">
        <ul className="w-full divide-y divide-white/[0.06]">
          {isBrowsingPublicFolder ? (
            publicBrowseRows
          ) : !ready ? (
            <>
              <DriveSignInRows isSignedIn={isSignedIn} hasDriveScope={hasDriveScope} onSignIn={onSignIn} />
              {publicFolderRows}
            </>
          ) : inProgress ? (
            <li className="text-text-primary px-3 py-1">please wait...</li>
          ) : (
            <>
              {isBrowsingFolder && (
                <DriveBackRow folder={browsedFolder!} onBack={() => onBrowseFolder(null)} />
              )}
              {publicFolderRows}
              {visibleDeckFiles.length === 0 && rootFolders.length === 0 && !showChampionship && !showBeginner && (
                <DriveListRow>
                  <Link
                    href="/decks"
                    className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary"
                  >
                    No decks yet. Build one in the deck builder →
                  </Link>
                </DriveListRow>
              )}
              {rootFolders.map((folder) => (
                <DriveListRow key={folder.id}>
                  <button
                    type="button"
                    className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                    onClick={() => onBrowseFolder(folder)}
                    title={folder.name}
                  >
                    <FaFolder className="inline mr-2" />{folder.name}
                  </button>
                </DriveListRow>
              ))}
              {visibleDeckFiles.map((file) => (
                <DriveListRow key={file.id} name={file.name}>
                  <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
                    {deckActions(file)}
                    <Link
                      href={editDeckHref(file)}
                      aria-label={`Edit ${file.name}`}
                      className="btn-icon btn-icon-sm"
                    >
                      <FaEdit/>
                    </Link>
                  </div>
                </DriveListRow>
              ))}
            </>
          )}
        </ul>
      </div>
    </DriveModalShell>
  );
};

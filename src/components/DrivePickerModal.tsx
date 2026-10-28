import React, { useState } from 'react'
import { FaTrash, FaFolder, FaFolderOpen, FaFolderPlus, FaEdit, FaCheck, FaTimes, FaExchangeAlt } from 'react-icons/fa';
import { DeckPile } from '../app/decks/deckBuilderUtils';
import { LAYER_MODAL } from '../lib/layers';
import { DriveModalShell } from './drivePicker/DriveModalShell';
import { DriveSignInRows } from './drivePicker/DriveSignInRows';
import { DRIVE_LIST_ROW_CLASS } from './drivePicker/DriveListRow';
import { DriveBackRow, isFolder, useDriveFolderView } from './drivePicker/useDriveFolderView';
import type { DriveFile } from './drivePicker/useDriveFolderView';
import {
  championshipDeckId,
  championshipDeckTitle,
  currentChampionshipDeckId,
} from '../lib/championshipDecks';
import type { ChampionshipDeck, ChampionshipEvent } from '../lib/championshipDecks';
import { beginnerDeckDetails, beginnerDeckId, beginnerDeckTitle } from '../lib/beginnerDecks';
import type { BeginnerDeck } from '../lib/beginnerDecks';
import { findPublicDeck, isPublicDeckId } from '../lib/publicDecks';

const MAX_COMPARE_SELECTION = 5;
const MIN_COMPARE_SELECTION = 0;

type PickerMode = 'load' | 'compare' | 'compare-multi' | 'reports';

// The modes that list the read-only folders of public decks, "Championship decks" (#1310, #1311)
// and "Beginner decks" (#1323). 'reports' lists saved Reports, not decks, so it never does.
const CHAMPIONSHIP_DECK_MODES: PickerMode[] = ['load', 'compare', 'compare-multi'];

export const CHAMPIONSHIP_FOLDER_NAME = 'Championship decks';
export const BEGINNER_FOLDER_NAME = 'Beginner decks';

type PickerProps = {
  driveFiles: Array<any>
  loadDriveFile: (file: any, piles?: DeckPile[]) => void
  deleteDriveFile: (file: any) => void
  inProgress: boolean
  onClose: () => void
  isSignedIn: boolean
  hasDriveScope: boolean
  onSignIn: () => void
  /**
   * 'compare' loads a single full deck for comparison, with no pile-subset option.
   * 'compare-multi' selects 2-5 decks via checkboxes and confirms via onConfirmSelection.
   * 'reports' lists saved Reports, with per-row load and rename actions instead of decks.
   */
  mode?: PickerMode
  /** Called with the full list of selected files when the user confirms a 'compare-multi' selection. */
  onConfirmSelection?: (files: DriveFile[]) => void
  /** Files that should start pre-checked in 'compare-multi' mode, e.g. when re-opening to add more decks. */
  preSelectedFiles?: DriveFile[]
  /** Called with a file and its new name when the user confirms a rename in 'reports' mode. */
  onRenameFile?: (file: DriveFile, newName: string) => void
  /** Called with a name when the user confirms creating a new folder in 'load' mode, root view. */
  onCreateFolder?: (name: string) => void
  /** The folder currently being browsed in 'load' mode's root/folder view, or null/undefined for root. */
  browsedFolder?: DriveFile | null
  /** Called with a folder to browse into it, or null to return to the root listing, in 'load' mode. */
  onBrowseFolder?: (folder: DriveFile | null) => void
  /** Called with a deck file and the id of the folder to move it into ('appDataFolder' for root), in 'load' mode. */
  onMoveFile?: (file: DriveFile, targetParentId: string) => void
  /** The early-access gate of the "Championship decks" folder (#1310): true lists it, in the modes that show it. */
  showChampionshipDecks?: boolean
  /** The Championship decks, by event. They are read-only and stay out of `driveFiles`. */
  championshipEvents?: ChampionshipEvent[]
  /** True lists the "Beginner decks" folder (#1323), in the modes that show it. */
  showBeginnerDecks?: boolean
  /** The Beginner Decks the user sees. They are read-only and stay out of `driveFiles`. */
  beginnerDecks?: BeginnerDeck[]
}

// Which folder of public decks the picker is inside, if any: the "Championship decks" folder, at its
// root (`event` null) or in one event, or the "Beginner decks" folder, which has no event level.
type PublicFolderView = { folder: 'championship'; event: string | null } | { folder: 'beginner' } | null;

type LoadMode = 'full' | DeckPile;

const PILE_OPTIONS: { value: LoadMode; label: string }[] = [
  { value: 'full', label: 'Full deck' },
  { value: 'mission', label: 'Missions only' },
  { value: 'dilemmaPile', label: 'Dilemmas only' },
  { value: 'drawDeck', label: 'Draw pile only' },
];

function pilesForMode(mode: LoadMode): DeckPile[] | undefined {
  if (mode === 'full') return undefined;
  return [mode];
}

export const DrivePickerModal: React.FC<PickerProps> = ({
  driveFiles = [],
  loadDriveFile,
  deleteDriveFile,
  inProgress,
  onClose,
  isSignedIn,
  hasDriveScope,
  onSignIn,
  mode = 'load',
  onConfirmSelection,
  preSelectedFiles = [],
  onRenameFile,
  onCreateFolder,
  browsedFolder = null,
  onBrowseFolder,
  onMoveFile,
  showChampionshipDecks = false,
  championshipEvents = [],
  showBeginnerDecks = false,
  beginnerDecks = [],
}) => {
  const [driveLoadModes, setDriveLoadModes] = useState<Record<string, LoadMode>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    // An old `tournament:` id checks the row of its deck (#1326).
    () => new Set(preSelectedFiles.map((f) => currentChampionshipDeckId(f.id)))
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingFile, setMovingFile] = useState<(DriveFile & { parents?: string[] }) | null>(null);
  const [publicFolderView, setPublicFolderView] = useState<PublicFolderView>(null);

  // 'reports' lists a different Drive file kind with no folder concept, so it stays
  // folder-blind; every other mode browses folders the same way.
  const { isBrowsingFolder, deckFiles, folders, rootFolders, visibleDeckFiles } =
    useDriveFolderView(driveFiles, browsedFolder, { supportsFolders: mode !== 'reports' });
  const showPublicFolders = CHAMPIONSHIP_DECK_MODES.includes(mode) && !isBrowsingFolder;
  const showChampionshipFolder = showChampionshipDecks && showPublicFolders;
  const showBeginnerFolder = showBeginnerDecks && showPublicFolders;
  const championshipView = showChampionshipFolder && publicFolderView?.folder === 'championship' ? publicFolderView : null;
  const isBrowsingChampionship = championshipView !== null;
  const isBrowsingBeginner = showBeginnerFolder && publicFolderView?.folder === 'beginner';
  const isBrowsingPublicFolder = isBrowsingChampionship || isBrowsingBeginner;
  const browsedEvent = championshipView !== null && championshipView.event !== null
    ? championshipEvents.find((e) => e.event === championshipView.event)
    : undefined;

  const startCreateFolder = () => {
    setCreatingFolder(true);
    setNewFolderName('');
  };
  const cancelCreateFolder = () => {
    setCreatingFolder(false);
    setNewFolderName('');
  };
  const confirmCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder?.(trimmed);
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const currentParentIdFor = (file: { parents?: string[] }) => file.parents?.[0] ?? 'appDataFolder';
  const handleMoveFile = (file: DriveFile & { parents?: string[] }, targetParentId: string) => {
    if (targetParentId === currentParentIdFor(file)) return;
    onMoveFile?.(file, targetParentId);
  };
  const startMoveFile = (file: DriveFile & { parents?: string[] }) => {
    setMovingFile(file);
  };
  const cancelMoveFile = () => {
    setMovingFile(null);
  };
  const selectMoveDestination = (targetParentId: string) => {
    if (movingFile) handleMoveFile(movingFile, targetParentId);
    setMovingFile(null);
  };
  const handleDriveFileSelect = (file: { id: string; name: string }) => {
    if (mode === 'compare' || mode === 'reports') {
      loadDriveFile(file);
      return;
    }
    const loadMode = driveLoadModes[file.id] ?? 'full';
    loadDriveFile(file, pilesForMode(loadMode));
  };
  const startRename = (file: DriveFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };
  const confirmRename = (file: DriveFile) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== file.name) {
      onRenameFile?.(file, trimmed);
    }
    setRenamingId(null);
    setRenameValue('');
  };
  const handleDriveFileDelete = (file) => {
    const isNonEmptyFolder = isFolder(file) && deckFiles.some((f) => f.parents?.includes(file.id));
    const message = isNonEmptyFolder
      ? `This will permanently delete "${file.name}" and everything inside it from your Google Drive. Are you sure?`
      : `This will permanently delete "${file.name}" from your Google Drive. Are you sure?`;
    if (!window.confirm(message)) return;
    deleteDriveFile(file);
  };
  const toggleFileSelection = (file: DriveFile) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        if (next.size >= MAX_COMPARE_SELECTION) return prev;
        next.add(file.id);
      }
      return next;
    });
  };
  const handleConfirmSelection = () => {
    const selectedFiles = driveFiles.filter((f: DriveFile) => selectedIds.has(f.id));
    // A public deck is not in `driveFiles` (#1311, #1323). It confirms under its title, or under the
    // name it was pre-selected with while the index has not loaded.
    const selectedPublicDecks = Array.from(selectedIds)
      .filter(isPublicDeckId)
      .map((id) => {
        const deck = findPublicDeck(id, championshipEvents.flatMap((e) => e.decks), beginnerDecks);
        if (deck) return { id, name: deck.title };
        const preSelected = preSelectedFiles.find((f) => currentChampionshipDeckId(f.id) === id);
        return preSelected && { ...preSelected, id };
      })
      .filter((f): f is DriveFile => !!f);
    onConfirmSelection?.([...selectedFiles, ...selectedPublicDecks]);
  };

  // The load controls of a public deck's row, by mode: the pile select in 'load', a checkbox in
  // 'compare-multi', a Load button otherwise. A public deck is read-only, so its row has no delete,
  // rename or move action.
  const renderPublicDeckControls = (file: DriveFile, label: string) => (
    <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
      {mode === 'load' && (
        <select
          className="input w-auto text-sm py-1 px-2"
          aria-label={`Load mode for ${label}`}
          value={driveLoadModes[file.id] ?? 'full'}
          onChange={(e) => setDriveLoadModes((prev) => ({ ...prev, [file.id]: e.target.value as LoadMode }))}
        >
          {PILE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {mode === 'compare-multi' ? (
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          className="mr-2"
          checked={selectedIds.has(file.id)}
          disabled={!selectedIds.has(file.id) && selectedIds.size >= MAX_COMPARE_SELECTION}
          onChange={() => toggleFileSelection(file)}
        />
      ) : (
        <button
          type="button"
          aria-label={`Load ${label}`}
          className="btn-icon btn-icon-sm"
          onClick={() => handleDriveFileSelect(file)}
        >
          <FaFolderOpen/>
        </button>
      )}
    </div>
  );

  // A Championship deck's row (#1310): its name and player, and the load controls of the mode.
  const renderChampionshipDeckRow = (deck: ChampionshipDeck) => {
    const id = championshipDeckId(deck);
    const label = `${deck.deckName} - ${deck.player}`;
    return (
      <li key={id} className={DRIVE_LIST_ROW_CLASS} data-testid="championship-deck-row">
        <span className="flex-1 min-w-0 px-3 truncate" title={label}>
          {deck.deckName} <span className="text-text-secondary">- {deck.player}</span>
        </span>
        {renderPublicDeckControls({ id, name: championshipDeckTitle(deck) }, label)}
      </li>
    );
  };

  // A Beginner Deck's row (#1323): its name, its complexity level and its style, and the load
  // controls of the mode. It has no link to the strategy article (#1325).
  const renderBeginnerDeckRow = (deck: BeginnerDeck) => {
    const id = beginnerDeckId(deck);
    const details = beginnerDeckDetails(deck);
    return (
      <li key={id} className={DRIVE_LIST_ROW_CLASS} data-testid="beginner-deck-row">
        <span className="flex-1 min-w-0 px-3 truncate" title={`${deck.deckName} — ${details}`}>
          {deck.deckName} <span className="text-text-secondary">— {details}</span>
        </span>
        {renderPublicDeckControls({ id, name: beginnerDeckTitle(deck) }, deck.deckName)}
      </li>
    );
  };

  const title = mode === 'compare-multi' ? 'Compare decks'
    : mode === 'compare' ? 'Compare deck'
    : mode === 'reports' ? 'Your Reports'
    : 'Your decks';

  return (
    <>
    <DriveModalShell title={title} onClose={onClose}>
          <div>
            <div className="max-h-64 overflow-y-auto overflow-x-hidden">
              <ul className="w-full divide-y divide-white/[0.06]">
                {!isSignedIn || !hasDriveScope ? (
                  <DriveSignInRows isSignedIn={isSignedIn} hasDriveScope={hasDriveScope} onSignIn={onSignIn} />
                ) : (
                  <>
                    {inProgress && (
                      <li className="text-text-primary px-3 py-1">please wait...</li>
                    )}
                    {!inProgress && isBrowsingChampionship && (
                      <DriveBackRow
                        folder={{ id: 'championship', name: browsedEvent?.event ?? CHAMPIONSHIP_FOLDER_NAME }}
                        onBack={() => setPublicFolderView(browsedEvent ? { folder: 'championship', event: null } : null)}
                      />
                    )}
                    {!inProgress && isBrowsingChampionship && !browsedEvent && championshipEvents.map((event) => (
                      <li key={event.event} className={DRIVE_LIST_ROW_CLASS}>
                        <button
                          type="button"
                          className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                          onClick={() => setPublicFolderView({ folder: 'championship', event: event.event })}
                          title={event.event}
                        >
                          <FaFolder className="inline mr-2" />{event.event}
                        </button>
                      </li>
                    ))}
                    {!inProgress && isBrowsingChampionship && !browsedEvent && championshipEvents.length === 0 && (
                      <li className="text-text-primary px-3 py-1">please wait...</li>
                    )}
                    {!inProgress && browsedEvent?.decks.map((deck) => renderChampionshipDeckRow(deck))}
                    {!inProgress && isBrowsingBeginner && (
                      <DriveBackRow folder={{ id: 'beginner', name: BEGINNER_FOLDER_NAME }} onBack={() => setPublicFolderView(null)} />
                    )}
                    {!inProgress && isBrowsingBeginner && beginnerDecks.length === 0 && (
                      <li className="text-text-primary px-3 py-1">please wait...</li>
                    )}
                    {!inProgress && isBrowsingBeginner && beginnerDecks.map((deck) => renderBeginnerDeckRow(deck))}
                    {!isBrowsingPublicFolder && (<>
                    {!inProgress && isBrowsingFolder && (
                      <DriveBackRow folder={browsedFolder!} onBack={() => onBrowseFolder?.(null)} />
                    )}
                    {!inProgress && mode === 'load' && !isBrowsingFolder && (
                      <li className={DRIVE_LIST_ROW_CLASS}>
                        {creatingFolder ? (
                          <>
                            <input
                              type="text"
                              aria-label="New folder name"
                              className="input flex-1 min-w-0 mx-3"
                              value={newFolderName}
                              autoFocus
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmCreateFolder();
                                if (e.key === 'Escape') cancelCreateFolder();
                              }}
                            />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label="Save new folder"
                                className="btn-icon btn-icon-sm"
                                onClick={confirmCreateFolder}
                              >
                                <FaCheck/>
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel new folder"
                                className="btn-icon btn-icon-sm"
                                onClick={cancelCreateFolder}
                              >
                                <FaTimes/>
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary"
                            onClick={startCreateFolder}
                          >
                            <FaFolderPlus className="inline mr-2" />New folder
                          </button>
                        )}
                      </li>
                    )}
                    {!inProgress && showChampionshipFolder && (
                      <li className={DRIVE_LIST_ROW_CLASS}>
                        <button
                          type="button"
                          className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                          onClick={() => setPublicFolderView({ folder: 'championship', event: null })}
                          title={CHAMPIONSHIP_FOLDER_NAME}
                        >
                          <FaFolder className="inline mr-2" />{CHAMPIONSHIP_FOLDER_NAME}
                        </button>
                      </li>
                    )}
                    {!inProgress && showBeginnerFolder && (
                      <li className={DRIVE_LIST_ROW_CLASS}>
                        <button
                          type="button"
                          className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                          onClick={() => setPublicFolderView({ folder: 'beginner' })}
                          title={BEGINNER_FOLDER_NAME}
                        >
                          <FaFolder className="inline mr-2" />{BEGINNER_FOLDER_NAME}
                        </button>
                      </li>
                    )}
                    {!inProgress && visibleDeckFiles.length === 0 && rootFolders.length === 0 && !showChampionshipFolder && !showBeginnerFolder && (
                      <li className="text-text-primary px-3 py-1">no files found</li>
                    )}
                    {!inProgress && rootFolders.map((folder: {id: string, name: string}) => (
                      <li key={folder.id} className={DRIVE_LIST_ROW_CLASS}>
                        {renamingId === folder.id ? (
                          <input
                            type="text"
                            aria-label={`Rename ${folder.name}`}
                            className="input flex-1 min-w-0 mx-3"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmRename(folder);
                              if (e.key === 'Escape') cancelRename();
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                            onClick={() => onBrowseFolder?.(folder)}
                            title={folder.name}
                          >
                            <FaFolder className="inline mr-2" />{folder.name}
                          </button>
                        )}
                        {mode === 'load' && renamingId === folder.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Save name for ${folder.name}`}
                              className="btn-icon btn-icon-sm"
                              onClick={() => confirmRename(folder)}
                            >
                              <FaCheck/>
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel rename"
                              className="btn-icon btn-icon-sm"
                              onClick={cancelRename}
                            >
                              <FaTimes/>
                            </button>
                          </div>
                        ) : mode === 'load' ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Rename ${folder.name}`}
                              className="btn-icon btn-icon-sm"
                              onClick={() => startRename(folder)}
                            >
                              <FaEdit/>
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${folder.name}`}
                              onClick={() => handleDriveFileDelete(folder)}
                              className="btn-icon btn-icon-sm"
                            >
                              <FaTrash/>
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                    {!inProgress && visibleDeckFiles.map((file: {id: string, name: string, parents?: string[]}) => (
                      <li key={file.id} className={DRIVE_LIST_ROW_CLASS}>
                        {mode === 'reports' && renamingId === file.id ? (
                          <input
                            type="text"
                            aria-label={`Rename ${file.name}`}
                            className="input flex-1 min-w-0 mx-3"
                            value={renameValue}
                            autoFocus
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmRename(file);
                              if (e.key === 'Escape') cancelRename();
                            }}
                          />
                        ) : (
                          <span className="flex-1 min-w-0 px-3 truncate" title={file.name}>{file.name}</span>
                        )}
                        <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
                          {mode === 'load' && (
                            <select
                              className="input w-auto text-sm py-1 px-2"
                              value={driveLoadModes[file.id] ?? 'full'}
                              onChange={(e) => setDriveLoadModes((prev) => ({ ...prev, [file.id]: e.target.value as LoadMode }))}
                            >
                              {PILE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          )}
                          {mode === 'load' && (
                            <button
                              type="button"
                              aria-label={`Move ${file.name}`}
                              className="btn-icon btn-icon-sm"
                              onClick={() => startMoveFile(file)}
                            >
                              <FaExchangeAlt/>
                            </button>
                          )}
                          {mode === 'compare-multi' ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${file.name}`}
                              className="mr-2"
                              checked={selectedIds.has(file.id)}
                              disabled={!selectedIds.has(file.id) && selectedIds.size >= MAX_COMPARE_SELECTION}
                              onChange={() => toggleFileSelection(file)}
                            />
                          ) : mode === 'reports' && renamingId === file.id ? (
                            <>
                              <button
                                type="button"
                                aria-label={`Save name for ${file.name}`}
                                className="btn-icon btn-icon-sm"
                                onClick={() => confirmRename(file)}
                              >
                                <FaCheck/>
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel rename"
                                className="btn-icon btn-icon-sm"
                                onClick={cancelRename}
                              >
                                <FaTimes/>
                              </button>
                            </>
                          ) : mode === 'reports' ? (
                            <>
                              <button
                                type="button"
                                aria-label={`Load ${file.name}`}
                                className="btn-icon btn-icon-sm"
                                onClick={() => handleDriveFileSelect(file)}
                              >
                                <FaFolderOpen/>
                              </button>
                              <button
                                type="button"
                                aria-label={`Rename ${file.name}`}
                                className="btn-icon btn-icon-sm"
                                onClick={() => startRename(file)}
                              >
                                <FaEdit/>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Load ${file.name}`}
                              className="btn-icon btn-icon-sm"
                              onClick={() => handleDriveFileSelect(file)}
                            >
                              <FaFolderOpen/>
                            </button>
                          )}
                          {mode !== 'compare-multi' && (
                            <button
                              type="button"
                              onClick={() => handleDriveFileDelete(file)}
                              className="btn-icon btn-icon-sm"
                            >
                              <FaTrash/>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                    </>)}
                  </>
                )}
              </ul>
            </div>
          </div>
          {mode === 'compare-multi' && isSignedIn && hasDriveScope && (
            <div className="flex items-center justify-between pt-3">
              <span className="text-text-secondary text-sm">{selectedIds.size} selected</span>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedIds.size < MIN_COMPARE_SELECTION}
                onClick={handleConfirmSelection}
              >
                Compare {selectedIds.size} deck{selectedIds.size === 1 ? '' : 's'}
              </button>
            </div>
          )}
    </DriveModalShell>
    {movingFile && (
      <DriveModalShell title={<>Move &quot;{movingFile.name}&quot;</>} onClose={cancelMoveFile} layer={LAYER_MODAL}>
            <ul className="w-full divide-y divide-white/[0.06]">
              <li className="text-text-primary py-1 hover:bg-white/[0.04] rounded transition-colors">
                <button
                  type="button"
                  aria-label="Move to Root"
                  className="w-full px-3 text-left text-text-primary hover:text-text-secondary"
                  onClick={() => selectMoveDestination('appDataFolder')}
                >
                  Root
                </button>
              </li>
              {folders.map((folder) => (
                <li key={folder.id} className="text-text-primary py-1 hover:bg-white/[0.04] rounded transition-colors">
                  <button
                    type="button"
                    aria-label={`Move to ${folder.name}`}
                    className="w-full px-3 text-left text-text-primary hover:text-text-secondary truncate"
                    onClick={() => selectMoveDestination(folder.id)}
                    title={folder.name}
                  >
                    <FaFolder className="inline mr-2" />{folder.name}
                  </button>
                </li>
              ))}
            </ul>
      </DriveModalShell>
    )}
    </>
  )
}

import React, { useState } from 'react'
import { FaTrash, FaFolder, FaFolderOpen, FaFolderPlus, FaSignInAlt, FaEdit, FaCheck, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { DeckPile } from '../app/decks/deckBuilderUtils';
import { FOLDER_MIME_TYPE } from '../app/api/drive/mimeTypes';

type DriveFile = { id: string; name: string };

// Folders only ever live at the appDataFolder root today (no nesting), so an item is a
// root item when it has no parents info (folders weren't requested) or its parents
// include the appDataFolder root.
const isRootItem = (file: { parents?: string[] }) =>
  !file.parents || file.parents.includes('appDataFolder');

const MAX_COMPARE_SELECTION = 5;
const MIN_COMPARE_SELECTION = 0;

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
  mode?: 'load' | 'compare' | 'compare-multi' | 'reports'
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
}

type LoadMode = 'full' | 'mission' | 'dilemma' | 'draw';

const PILE_OPTIONS: { value: LoadMode; label: string }[] = [
  { value: 'full', label: 'Full deck' },
  { value: 'mission', label: 'Missions only' },
  { value: 'dilemma', label: 'Dilemmas only' },
  { value: 'draw', label: 'Draw pile only' },
];

function pilesForMode(mode: LoadMode): DeckPile[] | undefined {
  if (mode === 'full') return undefined;
  return [mode as DeckPile];
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
}) => {
  const [driveLoadModes, setDriveLoadModes] = useState<Record<string, LoadMode>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(preSelectedFiles.map((f) => f.id))
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const isFolder = (file: { mimeType?: string }) => file.mimeType === FOLDER_MIME_TYPE;
  const isBrowsingFolder = mode === 'load' && !!browsedFolder;
  const deckFiles = driveFiles.filter((f) => !isFolder(f));
  const rootFolders = mode === 'load' && !isBrowsingFolder ? driveFiles.filter((f) => isFolder(f) && isRootItem(f)) : [];
  const visibleDeckFiles = mode === 'load'
    ? (isBrowsingFolder
        ? deckFiles.filter((f) => f.parents?.includes(browsedFolder!.id))
        : deckFiles.filter(isRootItem))
    : deckFiles;

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
    onConfirmSelection?.(selectedFiles);
  };

  const title = mode === 'compare-multi' ? 'Compare decks'
    : mode === 'compare' ? 'Compare deck'
    : mode === 'reports' ? 'Your Reports'
    : 'Your decks';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="bg-bg-secondary p-3 border border-white/10 shadow-lg relative z-20 mx-auto w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold mt-4 mb-2 block text-text-primary">{title}</span>
            <button
              type="button"
              className="text-text-primary hover:text-text-secondary"
              onClick={onClose}
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
          <div>
            <span className="block text-text-secondary py-1">Google Drive</span>
            <div className="max-h-64 overflow-y-auto overflow-x-hidden">
              <ul className="w-full">
                {!isSignedIn ? (
                  <li className="text-text-primary py-2 px-3">
                    <button className="btn-primary" onClick={onSignIn}>
                      <FaSignInAlt className="inline mr-2" />Sign in with Google to load Drive decks
                    </button>
                  </li>
                ) : !hasDriveScope ? (
                  <li className="text-text-primary py-2 px-3">
                    <button className="btn-primary" onClick={onSignIn}>
                      <FaSignInAlt className="inline mr-2" />Grant Google Drive access
                    </button>
                  </li>
                ) : (
                  <>
                    {inProgress && (
                      <li className="text-text-primary px-3 py-1">please wait...</li>
                    )}
                    {!inProgress && mode === 'load' && isBrowsingFolder && (
                      <li className="flex items-center border border-white/10 text-text-primary py-1">
                        <button
                          type="button"
                          className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                          onClick={() => onBrowseFolder?.(null)}
                          title={browsedFolder!.name}
                        >
                          <FaArrowLeft className="inline mr-2" />{browsedFolder!.name}
                        </button>
                      </li>
                    )}
                    {!inProgress && mode === 'load' && !isBrowsingFolder && (
                      <li className="flex items-center border border-white/10 text-text-primary py-1">
                        {creatingFolder ? (
                          <>
                            <input
                              type="text"
                              aria-label="New folder name"
                              className="flex-1 min-w-0 mx-3 bg-bg-secondary text-text-primary border border-white/10 rounded px-1"
                              value={newFolderName}
                              autoFocus
                              onChange={(e) => setNewFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmCreateFolder();
                                if (e.key === 'Escape') cancelCreateFolder();
                              }}
                            />
                            <button
                              type="button"
                              aria-label="Save new folder"
                              className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                              onClick={confirmCreateFolder}
                            >
                              <FaCheck/>
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel new folder"
                              className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                              onClick={cancelCreateFolder}
                            >
                              <FaTimes/>
                            </button>
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
                    {!inProgress && visibleDeckFiles.length === 0 && rootFolders.length === 0 && (
                      <li className="text-text-primary px-3 py-1">no files found</li>
                    )}
                    {!inProgress && rootFolders.map((folder: {id: string, name: string}) => (
                      <li key={folder.id} className="flex items-center border border-white/10 text-text-primary py-1">
                        <button
                          type="button"
                          className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
                          onClick={() => onBrowseFolder?.(folder)}
                          title={folder.name}
                        >
                          <FaFolder className="inline mr-2" />{folder.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${folder.name}`}
                          onClick={() => handleDriveFileDelete(folder)}
                          className="text-text-primary hover:text-text-secondary font-bold py-1 px-3"
                        >
                          <FaTrash/>
                        </button>
                      </li>
                    ))}
                    {!inProgress && visibleDeckFiles.map((file: {id: string, name: string}) => (
                      <li key={file.id} className="flex items-center border border-white/10 text-text-primary py-1">
                        {mode === 'reports' && renamingId === file.id ? (
                          <input
                            type="text"
                            aria-label={`Rename ${file.name}`}
                            className="flex-1 min-w-0 mx-3 bg-bg-secondary text-text-primary border border-white/10 rounded px-1"
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
                        <div className="flex items-center whitespace-nowrap flex-shrink-0">
                          {mode === 'load' && (
                            <select
                              className="bg-bg-secondary text-text-primary text-sm border border-white/10 rounded px-1 py-0.5 mr-1"
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
                                className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                                onClick={() => confirmRename(file)}
                              >
                                <FaCheck/>
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel rename"
                                className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
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
                                className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                                onClick={() => handleDriveFileSelect(file)}
                              >
                                <FaFolderOpen/>
                              </button>
                              <button
                                type="button"
                                aria-label={`Rename ${file.name}`}
                                className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                                onClick={() => startRename(file)}
                              >
                                <FaEdit/>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                              onClick={() => handleDriveFileSelect(file)}
                            >
                              <FaFolderOpen/>
                            </button>
                          )}
                          {mode !== 'compare-multi' && (
                            <button
                              type="button"
                              onClick={() => handleDriveFileDelete(file)}
                              className="text-text-primary hover:text-text-secondary font-bold py-1 px-3"
                            >
                              <FaTrash/>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
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
        </div>
      </div>
    </div>
  )
}

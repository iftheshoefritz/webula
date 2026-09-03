import React, { useState } from 'react';
import { FaFolder, FaFolderPlus, FaCheck, FaTimes } from 'react-icons/fa';
import { FOLDER_MIME_TYPE } from '../app/api/drive/mimeTypes';

type DriveFile = { id: string; name: string; mimeType?: string; parents?: string[] };

// Folders only ever live at the appDataFolder root today (no nesting), so an item is a
// root item when it has no parents info (folders weren't requested) or its parents
// include the appDataFolder root.
const isRootItem = (file: { parents?: string[] }) =>
  !file.parents || file.parents.includes('appDataFolder');

type SaveAsDialogProps = {
  deckTitle: string;
  /** Root-level folders and decks, as fetched via GET /api/drive?includeFolders=true. */
  driveFiles: DriveFile[];
  /** True while driveFiles is still being fetched. */
  inProgress: boolean;
  /** Called with the chosen destination's id ('appDataFolder' for root) to confirm the save. */
  onConfirm: (targetParentId: string) => void;
  /** Called with a name when the user confirms creating a new folder. */
  onCreateFolder: (name: string) => void;
  onClose: () => void;
};

export const SaveAsDialog: React.FC<SaveAsDialogProps> = ({
  deckTitle,
  driveFiles,
  inProgress,
  onConfirm,
  onCreateFolder,
  onClose,
}) => {
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const isFolder = (file: { mimeType?: string }) => file.mimeType === FOLDER_MIME_TYPE;
  const folders = driveFiles.filter((f) => isFolder(f) && isRootItem(f));

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
    if (trimmed) onCreateFolder(trimmed);
    setCreatingFolder(false);
    setNewFolderName('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="bg-bg-secondary p-3 border border-white/10 shadow-lg relative z-20 mx-auto w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold mt-4 mb-2 block text-text-primary truncate" title={deckTitle}>
              Save &quot;{deckTitle}&quot; to&hellip;
            </span>
            <button
              type="button"
              className="text-text-primary hover:text-text-secondary"
              onClick={onClose}
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
          <ul className="w-full max-h-64 overflow-y-auto overflow-x-hidden">
            {inProgress && <li className="text-text-primary px-3 py-1">please wait...</li>}
            {!inProgress && (
              <>
                <li className="border border-white/10 text-text-primary py-1">
                  <button
                    type="button"
                    aria-label="Save to Root"
                    className="w-full px-3 text-left text-text-primary hover:text-text-secondary"
                    onClick={() => onConfirm('appDataFolder')}
                  >
                    Root
                  </button>
                </li>
                {folders.map((folder) => (
                  <li key={folder.id} className="border border-white/10 text-text-primary py-1">
                    <button
                      type="button"
                      aria-label={`Save to ${folder.name}`}
                      className="w-full px-3 text-left text-text-primary hover:text-text-secondary truncate"
                      onClick={() => onConfirm(folder.id)}
                      title={folder.name}
                    >
                      <FaFolder className="inline mr-2" />{folder.name}
                    </button>
                  </li>
                ))}
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
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

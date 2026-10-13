import React from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { FOLDER_MIME_TYPE } from '../../app/api/drive/mimeTypes';
import { DRIVE_LIST_ROW_CLASS } from './DriveListRow';

export type DriveFile = { id: string; name: string };
export type DriveItem = DriveFile & { mimeType?: string; parents?: string[] };

// Folders only ever live at the appDataFolder root today (no nesting), so an item is a
// root item when it has no parents info (folders weren't requested) or its parents
// include the appDataFolder root.
export const isRootItem = (file: { parents?: string[] }) =>
  !file.parents || file.parents.includes('appDataFolder');

export const isFolder = (file: { mimeType?: string }) => file.mimeType === FOLDER_MIME_TYPE;

// Which folders and decks a Drive picker shows for the browsed folder (#1109).
export function useDriveFolderView<T extends DriveItem>(
  driveFiles: T[],
  browsedFolder: DriveFile | null | undefined,
  { supportsFolders = true }: { supportsFolders?: boolean } = {},
) {
  const isBrowsingFolder = supportsFolders && !!browsedFolder;
  const deckFiles = driveFiles.filter((f) => !isFolder(f));
  // Folders to move a deck into aren't scoped to the browsed view — a deck can move into any
  // root folder regardless of whether the picker is currently browsing root or inside one.
  const folders = driveFiles.filter((f) => isFolder(f) && isRootItem(f));
  const rootFolders = supportsFolders && !isBrowsingFolder ? folders : [];
  const visibleDeckFiles = supportsFolders
    ? (isBrowsingFolder
        ? deckFiles.filter((f) => f.parents?.includes(browsedFolder!.id))
        : deckFiles.filter(isRootItem))
    : deckFiles;
  return { isBrowsingFolder, deckFiles, folders, rootFolders, visibleDeckFiles };
}

// The row at the top of a folder's listing that names the folder and returns to the root.
export const DriveBackRow: React.FC<{ folder: DriveFile; onBack: () => void }> = ({ folder, onBack }) => (
  <li className={DRIVE_LIST_ROW_CLASS}>
    <button
      type="button"
      className="flex-1 min-w-0 px-3 text-left text-text-primary hover:text-text-secondary truncate"
      onClick={onBack}
      title={folder.name}
    >
      <FaArrowLeft className="inline mr-2" />{folder.name}
    </button>
  </li>
);

import React from 'react';
import Link from 'next/link';
import { FaEdit, FaFolder, FaFolderOpen } from 'react-icons/fa';
import { DriveModalShell } from '../../../components/drivePicker/DriveModalShell';
import { DriveSignInRows } from '../../../components/drivePicker/DriveSignInRows';
import { DriveListRow } from '../../../components/drivePicker/DriveListRow';
import { DriveBackRow, useDriveFolderView } from '../../../components/drivePicker/useDriveFolderView';
import type { DriveFile, DriveItem } from '../../../components/drivePicker/useDriveFolderView';

type Props = {
  driveFiles: DriveItem[]
  inProgress: boolean
  isSignedIn: boolean
  hasDriveScope: boolean
  onSignIn: () => void
  browsedFolder: DriveFile | null
  onBrowseFolder: (folder: DriveFile | null) => void
  onLoad: (file: DriveFile) => void
  onClose: () => void
}

// Opens the deck in the deck builder, in the same tab (#1111): a new tab breaks the home-screen app (#922).
export const editDeckHref = (file: DriveFile) =>
  `/decks?driveFile=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`;

// The Drive picker of the practice table's Load deck (#1109). It only loads: a game always deals
// the full deck, so it has no pile choice, and deck management (move, rename, delete, new folder)
// stays in the deck builder's picker, `DrivePickerModal`. With no decks it links to the deck
// builder, in the same tab, since the home-screen app has no tab bar (#922). Each deck's Edit button
// opens it in the deck builder (#1111).
export const PracticeDeckPicker: React.FC<Props> = ({
  driveFiles,
  inProgress,
  isSignedIn,
  hasDriveScope,
  onSignIn,
  browsedFolder,
  onBrowseFolder,
  onLoad,
  onClose,
}) => {
  const { isBrowsingFolder, rootFolders, visibleDeckFiles } = useDriveFolderView(driveFiles, browsedFolder);
  const ready = isSignedIn && hasDriveScope;

  return (
    <DriveModalShell title="Your decks" onClose={onClose}>
      <div className="max-h-64 overflow-y-auto overflow-x-hidden">
        <ul className="w-full divide-y divide-white/[0.06]">
          {!ready ? (
            <DriveSignInRows isSignedIn={isSignedIn} hasDriveScope={hasDriveScope} onSignIn={onSignIn} />
          ) : inProgress ? (
            <li className="text-text-primary px-3 py-1">please wait...</li>
          ) : (
            <>
              {isBrowsingFolder && (
                <DriveBackRow folder={browsedFolder!} onBack={() => onBrowseFolder(null)} />
              )}
              {visibleDeckFiles.length === 0 && rootFolders.length === 0 && (
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
                  <div className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`Load ${file.name}`}
                      className="btn-icon btn-icon-sm"
                      onClick={() => onLoad(file)}
                    >
                      <FaFolderOpen/>
                    </button>
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

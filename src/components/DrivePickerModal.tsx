import React, { useState } from 'react'
import { FaTrash, FaFolderOpen, FaSignInAlt } from 'react-icons/fa';
import { DeckPile } from '../app/decks/deckBuilderUtils';

type PickerProps = {
  driveFiles: Array<any>
  loadDriveFile: (file: any, piles?: DeckPile[]) => void
  deleteDriveFile: (file: any) => void
  inProgress: boolean
  onClose: () => void
  isSignedIn: boolean
  hasDriveScope: boolean
  onSignIn: () => void
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
}) => {
  const [driveLoadModes, setDriveLoadModes] = useState<Record<string, LoadMode>>({});

  const handleDriveFileSelect = (file: { id: string; name: string }) => {
    const mode = driveLoadModes[file.id] ?? 'full';
    loadDriveFile(file, pilesForMode(mode));
  };
  const handleDriveFileDelete = (file) => deleteDriveFile(file)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="bg-bg-secondary p-3 border border-white/10 shadow-lg relative z-20 mx-auto w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold mt-4 mb-2 block text-text-primary">Your decks</span>
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
                    {!inProgress && driveFiles.length === 0 && (
                      <li className="text-text-primary px-3 py-1">no files found</li>
                    )}
                    {!inProgress && driveFiles.map((file: {id: string, name: string}) => (
                      <li key={file.id} className="flex items-center border border-white/10 text-text-primary py-1">
                        <span className="flex-1 min-w-0 px-3 truncate" title={file.name}>{file.name}</span>
                        <div className="flex items-center whitespace-nowrap flex-shrink-0">
                          <select
                            className="bg-bg-secondary text-text-primary text-sm border border-white/10 rounded px-1 py-0.5 mr-1"
                            value={driveLoadModes[file.id] ?? 'full'}
                            onChange={(e) => setDriveLoadModes((prev) => ({ ...prev, [file.id]: e.target.value as LoadMode }))}
                          >
                            {PILE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="text-text-primary hover:text-text-secondary font-bold py-1 px-2"
                            onClick={() => handleDriveFileSelect(file)}
                          >
                            <FaFolderOpen/>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDriveFileDelete(file)}
                            className="text-text-primary hover:text-text-secondary font-bold py-1 px-3"
                          >
                            <FaTrash/>
                          </button>
                        </div>
                      </li>
                    ))}
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

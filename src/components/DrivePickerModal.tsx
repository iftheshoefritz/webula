import React, { useState } from 'react'
import { FaTrash, FaFolderOpen, FaSignInAlt, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { Deck } from '../types';
import { DeckPile } from '../app/decks/deckBuilderUtils';

interface File {
  name: string
  deck: Deck
}

type PickerProps = {
  browserFiles: Array<File>
  driveFiles: Array<any>
  loadDriveFile: (file: any, piles?: DeckPile[]) => void
  deleteDriveFile: (file: any) => void
  loadBrowserFile: (file: File, piles?: DeckPile[]) => void
  deleteBrowserFile: (file: File) => void
  inProgress: boolean
  onClose: () => void
  isSignedIn: boolean
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
  browserFiles,
  loadDriveFile,
  deleteDriveFile,
  loadBrowserFile,
  deleteBrowserFile,
  inProgress,
  onClose,
  isSignedIn,
  onSignIn,
}) => {
  const [browserLoadModes, setBrowserLoadModes] = useState<Record<string, LoadMode>>({});
  const [driveLoadModes, setDriveLoadModes] = useState<Record<string, LoadMode>>({});
  const [browserOpen, setBrowserOpen] = useState(true);
  const [driveOpen, setDriveOpen] = useState(true);

  const handleDriveFileSelect = (file: { id: string; name: string }) => {
    const mode = driveLoadModes[file.id] ?? 'full';
    loadDriveFile(file, pilesForMode(mode));
  };
  const handleDriveFileDelete = (file) => deleteDriveFile(file)
  const handleBrowserFileDelete = (file) => deleteBrowserFile(file)
  const handleBrowserFileSelect = (file: File) => {
    const mode = browserLoadModes[file.name] ?? 'full';
    loadBrowserFile(file, pilesForMode(mode));
  }
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
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left text-text-secondary py-1"
              onClick={() => setBrowserOpen((o) => !o)}
              aria-expanded={browserOpen}
            >
              {browserOpen ? <FaChevronUp /> : <FaChevronDown />}
              This Browser
            </button>
            {browserOpen && (
              <div className="max-h-64 overflow-y-auto">
                <table className="table-auto w-full border-collapse">
                  <tbody>
                    <tr><td className="text-text-primary">{inProgress && <p>please wait...</p>}</td></tr>
                    <tr><td className="text-text-primary">{!inProgress && browserFiles.length === 0 && <p>no files found</p>}</td></tr>
                    {!inProgress && browserFiles.map((file) => (
                      <tr key={file.name} className="border border-white/10 text-text-primary" >
                        <td><span className="px-3">{file.name}</span></td>
                        <td className="flex justify-end items-center">
                          <select
                            className="bg-bg-secondary text-text-primary text-sm border border-white/10 rounded px-1 py-0.5 mr-1"
                            value={browserLoadModes[file.name] ?? 'full'}
                            onChange={(e) => setBrowserLoadModes((prev) => ({ ...prev, [file.name]: e.target.value as LoadMode }))}
                          >
                            {PILE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="ml-auto text-text-primary hover:text-text-secondary font-bold py-1"
                            onClick={() => handleBrowserFileSelect(file)}
                          >
                            <FaFolderOpen/>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBrowserFileDelete(file)}
                            className="text-text-primary hover:text-text-secondary font-bold py-1 px-3"
                          >
                            <FaTrash/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left text-text-secondary py-1"
              onClick={() => setDriveOpen((o) => !o)}
              aria-expanded={driveOpen}
            >
              {driveOpen ? <FaChevronUp /> : <FaChevronDown />}
              Google Drive
            </button>
            {driveOpen && (
              <div className="max-h-64 overflow-y-auto">
                <table className="table-auto w-full border-collapse">
                  <tbody>
                    {!isSignedIn ? (
                      <tr>
                        <td className="text-text-primary py-2 px-3">
                          <button className="btn-icon" onClick={onSignIn}>
                            <FaSignInAlt className="inline mr-2" />Sign in with Google to load Drive decks
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr><td className="text-text-primary">{inProgress && <p>please wait...</p>}</td></tr>
                        <tr><td className="text-text-primary">{!inProgress && driveFiles.length === 0 && <p>no files found</p>}</td></tr>
                        {!inProgress && driveFiles.map((file: {id: string, name: string}) => (
                          <tr key={file.id} className="border border-white/10 text-text-primary" >
                            <td><span className="px-3">{file.name}</span></td>
                            <td className="flex justify-end items-center">
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
                                className="ml-auto text-text-primary hover:text-text-secondary font-bold py-1"
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
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

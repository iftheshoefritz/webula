import React, { useState } from 'react'
import { FaTrash, FaFolderOpen } from 'react-icons/fa';
import { Deck } from '../types';

interface File {
  name: string
  deck: Deck
}

type PickerProps = {
  browserFiles: Array<File>
  driveFiles: Array<any>
  loadDriveFile: (file: any) => void
  deleteDriveFile: (file: any) => void
  loadBrowserFile: (file: File) => void
  deleteBrowserFile: (file: File) => void
  inProgress: boolean
  onClose: () => void
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
}) => {
  const handleDriveFileSelect = (file) => loadDriveFile(file)
  const handleDriveFileDelete = (file) => deleteDriveFile(file)
  const handleBrowserFileDelete = (file) => deleteBrowserFile(file)
  const handleBrowserFileSelect = (file) => {
    console.log('file', file)
    loadBrowserFile(file)
  }
  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
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
          <div className="max-h-96 overflow-y-auto">
            <table className="table-auto w-full border-collapse">
              <thead><tr><td className="text-text-secondary">This Browser</td></tr></thead>
              <tbody>
                <tr><td className="text-text-primary">{inProgress && <p>please wait...</p>}</td></tr>
                <tr><td className="text-text-primary">{!inProgress && browserFiles.length === 0 && <p>no files found</p>}</td></tr>
                {!inProgress && browserFiles.map((file) => (
                  <tr key={file.name} className="border border-white/10 text-text-primary" >
                    <td><span className="px-3">{file.name}</span></td>
                    <td className="flex justify-end">
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
          <div className="max-h-96 overflow-y-auto">
            <table className="table-auto w-full border-collapse">
              <thead className="text-text-secondary">Google Drive</thead>
              <tbody>
                <tr><td className="text-text-primary">{inProgress && <p>please wait...</p>}</td></tr>
                <tr><td className="text-text-primary">{!inProgress && driveFiles.length === 0 && <p>no files found</p>}</td></tr>
                {!inProgress && driveFiles.map((file: {id: string, name: string}) => (
                  <tr key={file.id} className="border border-white/10 text-text-primary" >
                    <td><span className="px-3">{file.name}</span></td>
                    <td className="flex justify-end">
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

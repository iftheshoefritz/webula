import React, { useState } from 'react'
import { FaTrash } from 'react-icons/fa';

export default function DrivePickerModal({ files, loadFile, inProgress, onClose }) {
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id)
  const handleFileSelect = () => {
    loadFile(selectedFileId)
  }
  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="bg-white p-8 border-0 shadow-lg relative z-20 mx-auto">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold mt-4 mb-2 block">Your decks</span>
            <button
              type="button"
              className="text-black hover:text-gray-700"
              onClick={onClose}
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
          {inProgress && <p>please wait...</p>}
          <form id="file-picker" className="w-full max-w-md">
            <div
              id="file-list"
              className="h-48 overflow-y-auto flex flex-col mt-1 space-y-1"
            >
              {!inProgress && files.length === 0 && <p>no files found</p>}
              {!inProgress && files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={
                  `px-3 py-2 cursor-pointer border border-gray-300 hover:bg-gray-50 ${
                  selectedFileId === file.id ? 'bg-blue-100 border-blue-500' : ''}`
                  }
                >
                  <span>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => {}} // Empty onClick handler
                    className="ml-auto text-black hover:text-gray-700 font-bold py-1 px-3"
                  >
                    <FaTrash/>
                  </button>
                </div>
              ))}
            </div>
            {files.length > 0 && !inProgress &&
              <button
                type="button"
                onClick={handleFileSelect}
                className="bg-black hover:bg-gray-700 text-white font-bold mt-4 py-2 px-4 rounded w-full"
              >
                Submit
              </button>
            }
          </form>
        </div>
      </div>
    </div>
  )
}

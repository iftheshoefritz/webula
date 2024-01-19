import React, { useState } from 'react'
import { FaTrash, FaFolderOpen } from 'react-icons/fa';

export default function DrivePickerModal({ files, loadFile, deleteFile, inProgress, onClose }) {
  const handleFileSelect = (file) => loadFile(file)
  const handleFileDelete = (file) => deleteFile(file)
  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen">
        <div className="absolute inset-0 bg-black opacity-50" onClick={onClose}></div>
        <div className="bg-white p-3 border-0 shadow-lg relative z-20 mx-auto w-11/12 sm:w-3/4 md:w-1/2 lg:w-1/3">
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
          <div className="max-h-96 overflow-y-auto">
            <table className="table-auto w-full border-collapse">
              <tbody>
                <tr><td>{inProgress && <p>please wait...</p>}</td></tr>
                <tr><td>{!inProgress && files.length === 0 && <p>no files found</p>}</td></tr>
                {!inProgress && files.map((file) => (
                  <tr key={file.id} className="border" >
                    <td><span className="px-3">{file.name}</span></td>
                    <td className="flex justify-end">
                      <button
                        type="button"
                        className="ml-auto text-black hover:text-gray-700 font-bold py-1"
                        onClick={() => handleFileSelect(file)}
                      >
                        <FaFolderOpen/>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFileDelete(file)}
                        className="text-black hover:text-gray-700 font-bold py-1 px-3"
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

import React, { useState } from 'react'
import { FaTrash } from 'react-icons/fa';

export default function DrivePickerModal({ files, loadFile, deleteFile, inProgress, onClose }) {
  const [selectedFile, setSelectedFile] = useState({})
  const handleFileSelect = () => loadFile(selectedFile)
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
                  <tr key={file.id} className="border `${selectedFile.id === file.id ? 'bg-blue-100 border-blue-500' : ''}`">
                    <td onClick={() => setSelectedFile(file)}><span>{file.name}</span></td>
                    <td className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleFileDelete(file)}
                        className="ml-auto text-black hover:text-gray-700 font-bold py-1 px-3"
                      >
                        <FaTrash/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {files.length > 0 && !inProgress &&
           <button
             type="button"
             onClick={handleFileSelect}
             className="bg-black hover:bg-gray-700 text-white font-bold mt-4 py-2 px-4 rounded w-full"
           >
             Load
           </button>
          }
        </div>
      </div>
    </div>
  )
}

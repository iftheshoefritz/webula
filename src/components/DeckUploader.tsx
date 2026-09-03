import React, { FunctionComponent } from 'react';
import { FaFileUpload } from 'react-icons/fa';

export interface UploadedFile {
  name: string;
  content: string;
}

interface DeckUploaderProps {
  // Called once with every selected file's name and text contents (in FileList order). The
  // caller decides how to handle a single file vs. multiple — this component just reports
  // what was picked.
  onFilesLoad: (files: UploadedFile[]) => void;
}

const readFileAsText = (file: File): Promise<UploadedFile> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) {
        reject(new Error('File reading error'));
        return;
      }
      resolve({ name: file.name, content: e.target.result as string });
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });

const DeckUploader: FunctionComponent<DeckUploaderProps> = ({ onFilesLoad }) => {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {return;}
    const files = Array.from(event.target.files);

    Promise.all(files.map(readFileAsText))
      .then(onFilesLoad)
      .catch((e) => console.error('File reading error', e));
  };

  return (
    <label
      htmlFor="fileInput"
      className="btn-icon"
      data-tooltip-id="button-tooltip"
      data-tooltip-content="Load a decklist from one or more LackeyCCG files"
    >
      <input id="fileInput" type="file" multiple onChange={handleFileUpload} className="hidden" />
      <FaFileUpload/>
    </label>
  );
};

export default DeckUploader;

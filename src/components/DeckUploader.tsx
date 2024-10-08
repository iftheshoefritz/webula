import React, { FunctionComponent } from 'react';
import { FaFileUpload } from 'react-icons/fa';

interface DeckUploaderProps {
  onFileLoad: (name: string, file: string) => void;
}

const DeckUploader: FunctionComponent<DeckUploaderProps> = ({ onFileLoad }) => {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {return;}
    const file = event.target.files[0];
    if (file) {
      let reader = new FileReader();

      reader.onload = (e) => {
        if (!e.target?.result) {return;}
        onFileLoad(file.name, e.target.result as string);
      };

      reader.onerror = (e) => {
        console.error('File reading error', e);
      };

      reader.readAsText(file);
    }
  };

  return (
    <label
      htmlFor="fileInput"
      className="bg-black hover:bg-gray-600 text-white font-bold inline-block py-2 px-4 rounded"
      data-tooltip-id="button-tooltip"
      data-tooltip-content="Load a decklist from a LackeyCCG file"
    >
      <input id="fileInput" type="file" onChange={handleFileUpload} className="hidden" />
      <FaFileUpload/>
    </label>
  );
};

export default DeckUploader;

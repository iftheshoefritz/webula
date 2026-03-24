import React, { FunctionComponent } from 'react';
import { FaFileUpload } from 'react-icons/fa';

interface DeckUploaderProps {
  onFileLoad: (name: string, file: string) => void;
  menuStyle?: boolean;
}

const DeckUploader: FunctionComponent<DeckUploaderProps> = ({ onFileLoad, menuStyle }) => {
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

  if (menuStyle) {
    return (
      <label
        htmlFor="fileInput"
        className="flex items-center gap-2 w-full text-sm text-text-primary cursor-pointer"
        data-tooltip-id="button-tooltip"
        data-tooltip-content="Load a decklist from a LackeyCCG file"
      >
        <input id="fileInput" type="file" onChange={handleFileUpload} className="hidden" />
        <FaFileUpload className="text-text-muted" /> Import deck
      </label>
    );
  }

  return (
    <label
      htmlFor="fileInput"
      className="btn-icon"
      data-tooltip-id="button-tooltip"
      data-tooltip-content="Load a decklist from a LackeyCCG file"
    >
      <input id="fileInput" type="file" onChange={handleFileUpload} className="hidden" />
      <FaFileUpload/>
    </label>
  );
};

export default DeckUploader;

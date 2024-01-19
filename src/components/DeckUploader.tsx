import React, { FunctionComponent } from 'react';

interface DeckUploaderProps {
  onFileLoad: (name: string, file: string) => void;
}

const DeckUploader: FunctionComponent<DeckUploaderProps> = ({ onFileLoad }) => {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files[0];
    let reader = new FileReader();

    reader.onload = (e) => {
      onFileLoad(file.name, e.target.result as string);
    };

    reader.onerror = (e) => {
      console.error('File reading error', e);
    };

    reader.readAsText(file);
  };

  return (
    <div>
      <div>
        <label htmlFor="fileInput" className="bg-black hover:bg-gray-600 text-white font-bold inline-block py-2 px-4 rounded cursor-pointer">
          <input id="fileInput" type="file" onChange={handleFileUpload} className="hidden" />
          Upload deck
        </label>
      </div>
    </div>
  );
};

export default DeckUploader;

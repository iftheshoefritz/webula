import React, { Component } from 'react';

class DeckUploader extends Component {
  handleFileUpload = (event) => {
    const file = event.target.files[0];
    let reader = new FileReader();

    reader.onload = (e) => {
      this.props.onFileLoad(e.target.result);
    };

    reader.onerror = (e) => {
      console.error('File reading error', e);
    };

    reader.readAsText(file);
  };

  render() {
    return (
      <div>
        <div>
          <label htmlFor="fileInput" className="bg-black hover:bg-gray-600 text-white font-bold inline-block py-2 px-4 rounded cursor-pointer">

            <input id="fileInput" type="file" onChange={this.handleFileUpload} className="hidden" />
            Upload deck
          </label>
        </div>
      </div>
    );
  }
}

export default DeckUploader;

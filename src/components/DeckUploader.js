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
        <input type="file" onChange={this.handleFileUpload} />
      </div>
    );
  }
}

export default DeckUploader;

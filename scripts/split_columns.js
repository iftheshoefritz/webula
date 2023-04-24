const fs = require('fs');
const readline = require('readline');

const filename = process.argv[2];
const outputFilename = process.argv[3];

const rl = readline.createInterface({
  input: fs.createReadStream(filename),
  crlfDelay: Infinity
});

let headers = [];

// Create a writable stream to write the output to a file
const outputStream = fs.createWriteStream(outputFilename, { flags: 'a' });

rl.on('line', (line) => {
  const values = line.split('\t');
  if (headers.length === 0) {
    // First line contains the headers
    headers = values.map((header) => {
      if (header.includes('/')) {
        // Split headers with slash
        const splitHeaders = header.split('/');
        return [...splitHeaders];
      }
      return header;
    });
    outputStream.write(Object.values(headers.flat()).join('\t') + '\n');
  } else {
    // Process data rows
    const data = {};
    headers.forEach((header, i) => {
      if (Array.isArray(header)) {
        // Process split columns
        header.forEach((subHeader, j) => {
          data[subHeader] = values[i];
        });
      } else {
        // Process regular columns
        data[header] = values[i];
      }
    });
    // Write the data to the output stream
    outputStream.write(Object.values(data).join('\t') + '\n');
  }
});

// Close the output stream when the script finishes running
rl.on('close', () => {
  outputStream.end();
});

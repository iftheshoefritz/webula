const fs = require('fs');
const readline = require('readline');

const filename = process.argv[2];
const outputFilename = process.argv[3];

const rl = readline.createInterface({
  input: fs.createReadStream(filename),
  crlfDelay: Infinity
});

let headers = [];

const rewriteHeaders = {
  Text: "gametext",
}

function loadNamesFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const namesArray = data.split('\n').filter(name => name.trim() !== '');
    return namesArray;
  } catch (error) {
    console.error(`An error occurred while reading the file: ${error}`);
    return [];
  }
}

const hofRetired = loadNamesFromFile('public/hof_retired.txt');

// Create a writable stream to write the output to a file
const outputStream = fs.createWriteStream(outputFilename, { flags: 'a' });

rl.on('line', (line) => {
  const values = line.split('\t');
  if (headers.length === 0) {
    // First line contains the headers
    // split up headers with / in them
    headers = values.map((header) => {
      if (header.includes('/')) {
        // Split headers with slash
        const splitHeaders = header.split('/');
        return [...splitHeaders];
      }
      return header;
    });
    // rewrite any of the header names that we want to be called something different
    headers = headers.map((header) => (rewriteHeaders[header] || header))
    headers.push('HoF');
    outputStream.write(Object.values(headers.flat()).join('\t') + '\n');
  } else {
    // Process data rows
    const data = {};
    headers.forEach((header, i) => {
      escapedValue = `"${(values[i] || '').replace(/"/g, '""')}"`
      if (Array.isArray(header)) {
        // Process split columns
        header.forEach((subHeader, j) => {
          data[subHeader] = escapedValue;
        });
      } else {
        // Process regular columns
        data[header] = escapedValue;
      }
    });
    title = data['Name'].replace(/["\*]/g, '').trim();
    hofCheckTitle = new RegExp(`${title}.*?`, 'i')
    if (/Leonard/i.test(title)) {
      console.log(`HOF TEST: ${title}`);
      console.log(hofRetired.filter((i) => /Leonard/i.test(i)));
      console.log(
        hofRetired.some((item) =>
          new RegExp(`^${ item.replace(',', '') }`).test(title)
      ));
    }
    if (
      hofRetired.some((item) =>
        new RegExp(`^${ item.replace(',', '') }`).test(title)
      )
    ) {
      console.log(`HOF NO: ${title}`);
      data['HoF'] = '"N"';
    } else {
      data['HoF'] = '"Y"';
    }
    // Write the data to the output stream
    outputStream.write(Object.values(data).join('\t') + '\n');
  }
});

// Close the output stream when the script finishes running
rl.on('close', () => {
  outputStream.end();
});

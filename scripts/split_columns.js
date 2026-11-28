// Writes public/cards_with_processed_columns.txt from the joined LackeyCCG set files: it splits the
// slash headers, renames Text to gametext, and appends HoF, Title and Subtitle. Title and Subtitle
// come from data/card_titles.tsv (#1971), which this script also rewrites to cover the card data
// exactly, and it prints a review list of the rows it added and dropped.
//
//   node scripts/split_columns.js <lackey cards file> <output file>
const fs = require('fs');

const {
  cardTitleKey,
  formatCardTitlesTsv,
  hofMatcher,
  joinCardTitles,
  parseCardTitlesTsv,
} = require('../src/lib/cardTitleRule.js');

const filename = process.argv[2];
const outputFilename = process.argv[3];
const cardTitlesFilename = 'data/card_titles.tsv';

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

const hof = hofMatcher(loadNamesFromFile('public/hof_retired.txt'));

const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/).filter((line) => line !== '');
const rawHeaders = lines[0].split('\t');
const rows = lines.slice(1).map((line) => line.split('\t'));

// split up headers with / in them, and rewrite any of the header names that we want to be called something different
const headers = rawHeaders
  .map((header) => (header.includes('/') ? header.split('/') : header))
  .map((header) => (rewriteHeaders[header] || header));

const column = (name) => rawHeaders.indexOf(name);
const cards = rows.map((values) => ({
  CollectorsInfo: values[column('CollectorsInfo')] || '',
  Name: values[column('Name')] || '',
  Type: values[column('Type')] || '',
}));

const titles = joinCardTitles(cards, parseCardTitlesTsv(fs.readFileSync(cardTitlesFilename, 'utf8')));

const quote = (value) => `"${(value || '').replace(/"/g, '""')}"`;

const output = [[...headers.flat(), 'HoF', 'Title', 'Subtitle'].join('\t')];
rows.forEach((values, i) => {
  const fields = headers.flatMap((header, j) => (Array.isArray(header) ? header : [header]).map(() => quote(values[j])));
  const { Title, Subtitle } = titles.byKey.get(cardTitleKey(cards[i].CollectorsInfo, cards[i].Name));
  fields.push(hof.isRetired(Title, Subtitle) ? '"N"' : '"Y"', quote(Title), quote(Subtitle));
  output.push(fields.join('\t'));
});
fs.writeFileSync(outputFilename, output.join('\n') + '\n');
fs.writeFileSync(cardTitlesFilename, formatCardTitlesTsv(titles.rows));

// The review list: check each added row, and correct it in data/card_titles.tsv before you commit it.
console.log(`${cardTitlesFilename}: ${titles.rows.length} rows, ${titles.added.length} added, ${titles.dropped.length} dropped`);
for (const { row, rule } of titles.added) {
  console.log(`ADDED ${row.CollectorsInfo}\t${row.Name}\tTitle "${row.Title}"\tSubtitle "${row.Subtitle}"\t(${rule})`);
}
for (const row of titles.dropped) {
  console.log(`DROPPED ${row.CollectorsInfo}\t${row.Name}\tTitle "${row.Title}"\tSubtitle "${row.Subtitle}"`);
}
for (const line of hof.unmatched()) {
  console.warn(`WARNING: the Hall of Fame line "${line}" of public/hof_retired.txt matches no card`);
}

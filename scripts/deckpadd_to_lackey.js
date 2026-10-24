// Converts trekcc.org DeckPADD deck files to the LackeyCCG text deck format.
//
//   node scripts/deckpadd_to_lackey.js <file-or-directory>... --out <output directory>
//
// Each input `<name>.txt` gives `<output directory>/<name>.txt`. A directory input converts
// every `.txt` file in it. The script prints every line it could not match, with its line
// number and the reason, and then a total. It exits with status 1 when a line did not match.
//
// A DeckPADD file (`/decklists/?mode=download&deckID=<id>`) has one line for each copy of a
// card, and no pile headers:
//
//   33V22\tCommon Enemy
//   33V22\tCommon Enemy
//   0VP272\tMouth of the Wormhole Deep Space 9
//
// The first field is the collector ID: the trekcc set number, the rarity, and the number in
// the set. The CollectorsInfo column of public/cards_with_processed_columns.txt uses the same
// set numbers and rarities (0VP is a virtual promo, 60AP is set 60), but pads the number with
// zeros: `33V022`. The script removes the zeros the same way `parseCardData` in
// src/lib/loadCards.ts does, so the two IDs are then equal.
//
// The name drops the unique dot and the comma between the title and the subtitle, and can
// hold HTML entities (`Mu&ntilde;iz`). The card data has the same name with no accent
// (`Muniz`), and it can add a version suffix (`*VP`) or a set tag (`(SS)`).
//
// The output is the format that `createLackeyTSV` in src/components/DeckBuilderClient.tsx
// writes and `deckFromTsv` in src/app/decks/deckBuilderUtils.ts reads: a header line for each
// pile, and `<count>\t<Name column>` for each card. LackeyCCG finds a card by that name.
//
//   Deck:
//   3\tCommon Enemy
//   Dilemmas:
//   1\tAdopted Authority (SS)
//   Missions:
//   1\tMouth of the Wormhole Deep Space 9 *VP

const fs = require('fs');
const path = require('path');

const setNumberOf = (id) => (id.match(/^\d+/) || [''])[0];
const rarityOf = (id) => (id.match(/[a-z]+/) || [''])[0];

const CARD_DATA = path.join(__dirname, '..', 'public', 'cards_with_processed_columns.txt');

// The same headers and order as `createLackeyTSV` in src/components/DeckBuilderClient.tsx.
const LACKEY_PILES = [
  { pile: 'drawDeck', header: 'Deck:' },
  { pile: 'dilemmaPile', header: 'Dilemmas:' },
  { pile: 'mission', header: 'Missions:' },
];

// The same rule as `cardPileFor` in src/app/decks/deckBuilderUtils.ts.
function cardPileFor(type) {
  switch (type.toLowerCase()) {
    case 'mission': return 'mission';
    case 'dilemma': return 'dilemmaPile';
    default: return 'drawDeck';
  }
}

// Reads the card data file. Every field is in double quotes, with `""` for a quote inside it.
function parseCardData(text) {
  const unquote = (field) => field.replace(/^"([\s\S]*)"$/, '$1').replace(/""/g, '"');
  const lines = text.split(/\r?\n/).filter((line) => line !== '');
  const headers = lines[0].split('\t').map(unquote);
  return lines.slice(1).map((line) => {
    const values = line.split('\t').map(unquote);
    const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
    return { name: row.Name, set: row.Set, collectorsInfo: row.CollectorsInfo, type: row.Type };
  });
}

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-',
  hellip: '...', bull: '', middot: '',
};

// Decodes `&amp;`, `&#233;` and `&#xE9;`. A named accented letter (`&ntilde;`, `&eacute;`)
// becomes the plain letter, because the card data has no accents.
function decodeHtmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const hex = code[1].toLowerCase() === 'x';
      const value = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    const lower = code.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower];
    const accented = code.match(/^([a-z])(acute|grave|circ|tilde|uml|ring|cedil|slash)$/i);
    return accented ? accented[1] : whole;
  });
}

// The form of a card name that both files agree on: no HTML entity, no accent, no version
// suffix or set tag, no punctuation, lower case, single spaces.
function normalizeCardName(name) {
  return decodeHtmlEntities(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+\*(vp|a|ap|vap)$/, '')
    .replace(/\s+\([^)]*\)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// `33V022` and `33V22` both become `33v22`.
function normalizeCollectorId(id) {
  return id.trim().toLowerCase().replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
}

function parseDeckpadd(text) {
  const entries = [];
  const unmatched = [];
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') return;
    const lineNumber = index + 1;
    const parsed = line.trim().match(/^(\d+[A-Za-z]+\d+)\t(.+)$/);
    if (!parsed) {
      unmatched.push({ lineNumber, line, reason: 'not a DeckPADD line (<collector ID>\\t<name>)' });
      return;
    }
    entries.push({ lineNumber, line, collectorId: parsed[1], name: parsed[2].trim() });
  });
  return { entries, unmatched, totalLines: entries.length + unmatched.length };
}

// `setCodes` maps a trekcc set number to the Set column values of its rows. A reprint has
// the collector ID of the first printing and the Set column of the reprint, so set 6 maps
// to `R2` and set 0 maps to `VP`, `BP`, `AP` and others. The data itself gives the mapping.
function buildIndex(cards) {
  const byId = new Map();
  const byName = new Map();
  const setCodes = new Map();
  const push = (map, key, card) => (map.has(key) ? map.get(key).push(card) : map.set(key, [card]));
  for (const card of cards) {
    const id = normalizeCollectorId(card.collectorsInfo);
    push(byId, id, card);
    push(byName, normalizeCardName(card.name), card);
    if (!setCodes.has(setNumberOf(id))) setCodes.set(setNumberOf(id), new Set());
    setCodes.get(setNumberOf(id)).add(card.set);
  }
  return { byId, byName, setCodes };
}

// The number of single-letter changes that turn `a` into `b`.
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// A DeckPADD name and a card data name with this many changes or less are one card with a
// typo in one of the two files, when the collector ID agrees too.
const MAX_TYPO_DISTANCE = 2;


// One collector ID can belong to several rows: a reprint in a later set (`(R2)`, `(AC)`)
// keeps the collector ID of the first printing. The row with no set tag is the original
// printing, so it comes first.
function preferOriginalPrinting(cards) {
  return [...cards].sort((a, b) => Number(/\)$/.test(a.name)) - Number(/\)$/.test(b.name)));
}

// Finds the card of one DeckPADD line. The collector ID comes first, because the name is
// lossy, but the name must agree with it, so a wrong ID in the file does not give a wrong
// card. When the ID finds nothing that agrees, the name alone decides. When no card has the
// name, a card with the ID and a name with a small typo is the last choice.
function matchEntry(entry, index) {
  const id = normalizeCollectorId(entry.collectorId);
  const name = normalizeCardName(entry.name);
  const byId = index.byId.get(id) || [];
  const idAndName = byId.filter((card) => normalizeCardName(card.name) === name);
  if (idAndName.length > 0) return { card: preferOriginalPrinting(idAndName)[0], method: 'id' };

  const byName = index.byName.get(name) || [];
  if (byName.length > 0) {
    // Several printings share the name. The DeckPADD set number can differ from the
    // collector ID of the right row: trekcc writes `6R49` for the R2 reprint of Machinations,
    // which the card data keeps as `2R049` with Set `R2`, and `0B5` for U.S.S. Excelsior
    // (BP), which the card data numbers `1B005`. So a row scores 2 when its Set column
    // belongs to the DeckPADD set number, and 1 when its rarity is the same.
    const codes = index.setCodes.get(setNumberOf(id)) || new Set();
    const score = (card) =>
      (codes.has(card.set) ? 2 : 0) + (rarityOf(normalizeCollectorId(card.collectorsInfo)) === rarityOf(id) ? 1 : 0);
    const best = Math.max(...byName.map(score));
    const preferred = byName.filter((card) => score(card) === best);
    return { card: preferOriginalPrinting(preferred)[0], method: 'name' };
  }

  const closeNames = byId.filter((card) => editDistance(normalizeCardName(card.name), name) <= MAX_TYPO_DISTANCE);
  if (closeNames.length > 0) return { card: preferOriginalPrinting(closeNames)[0], method: 'idCloseName' };

  if (byId.length > 0) {
    const names = Array.from(new Set(byId.map((card) => card.name))).join(' / ');
    return { reason: `collector ID ${entry.collectorId} is "${names}" in the card data, and no card has the name "${entry.name}"` };
  }
  return { reason: `no card with collector ID ${entry.collectorId} or the name "${entry.name}"` };
}

// Writes the matched cards as a LackeyCCG deck. `counts` keeps the order of first sight.
function lackeyDeckText(counts) {
  const lines = [];
  for (const { pile, header } of LACKEY_PILES) {
    const inPile = [...counts.values()].filter(({ card }) => cardPileFor(card.type) === pile);
    if (inPile.length === 0) continue;
    lines.push(header);
    for (const { card, count } of inPile) lines.push(`${count}\t${card.name}`);
  }
  return lines.join('\n');
}

// Converts the text of one DeckPADD file. `cardsOrIndex` is the card data rows, or the
// result of `buildIndex` for them.
function convertDeckpadd(text, cardsOrIndex) {
  const index = Array.isArray(cardsOrIndex) ? buildIndex(cardsOrIndex) : cardsOrIndex;
  const { entries, unmatched, totalLines } = parseDeckpadd(text);
  const counts = new Map();
  const matches = [];
  for (const entry of entries) {
    const result = matchEntry(entry, index);
    if (result.reason) {
      unmatched.push({ lineNumber: entry.lineNumber, line: entry.line, reason: result.reason });
      continue;
    }
    matches.push({ entry, card: result.card, method: result.method });
    const previous = counts.get(result.card.name);
    counts.set(result.card.name, { card: result.card, count: (previous ? previous.count : 0) + 1 });
  }
  unmatched.sort((a, b) => a.lineNumber - b.lineNumber);
  return { lackey: lackeyDeckText(counts), matches, unmatched, totalLines };
}

function main(args) {
  const usage = 'Usage: node scripts/deckpadd_to_lackey.js <file-or-directory>... --out <output directory>';
  const outIndex = args.indexOf('--out');
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const inputs = args.filter((_, i) => i !== outIndex && i !== outIndex + 1);
  if (!outDir || inputs.length === 0) {
    console.error(usage);
    return 2;
  }

  const files = inputs.flatMap((input) =>
    fs.statSync(input).isDirectory()
      ? fs.readdirSync(input).filter((name) => name.toLowerCase().endsWith('.txt')).sort().map((name) => path.join(input, name))
      : [input]
  );
  const index = buildIndex(parseCardData(fs.readFileSync(CARD_DATA, 'utf8')));
  fs.mkdirSync(outDir, { recursive: true });

  let totalLines = 0;
  let matchedLines = 0;
  let byName = 0;
  let closeName = 0;
  for (const file of files) {
    const result = convertDeckpadd(fs.readFileSync(file, 'utf8'), index);
    fs.writeFileSync(path.join(outDir, path.basename(file)), result.lackey + '\n');
    totalLines += result.totalLines;
    matchedLines += result.matches.length;
    byName += result.matches.filter((match) => match.method === 'name').length;
    closeName += result.matches.filter((match) => match.method === 'idCloseName').length;
    for (const { entry, card } of result.matches.filter((match) => match.method === 'idCloseName')) {
      console.log(`${file}: line ${entry.lineNumber}: ${JSON.stringify(entry.line)}: matched by collector ID to "${card.name}", a name that differs`);
    }
    if (result.unmatched.length > 0) {
      console.log(`${file}: ${result.unmatched.length} of ${result.totalLines} lines not matched`);
      for (const { lineNumber, line, reason } of result.unmatched) {
        console.log(`  line ${lineNumber}: ${JSON.stringify(line)}: ${reason}`);
      }
    }
  }

  console.log(
    `${files.length} files, ${matchedLines} of ${totalLines} lines matched ` +
    `(${totalLines - matchedLines} not matched, ${byName} matched by name only, ` +
    `${closeName} matched by collector ID to a name that differs)`
  );
  return matchedLines === totalLines ? 0 : 1;
}

module.exports = {
  convertDeckpadd,
  decodeHtmlEntities,
  normalizeCardName,
  normalizeCollectorId,
  parseCardData,
  parseDeckpadd,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

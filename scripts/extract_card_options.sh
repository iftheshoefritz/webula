#!/usr/bin/env bash
# extract_card_options.sh
#
# Extracts unique Class, Species, and Set values from the card data TSV and
# writes/overwrites the SHIP_CLASSES, SPECIES, and SETS constant blocks in
# src/lib/missionRequirements.ts between sentinel comments.
#
# Set names are fetched live from https://www.trekcc.org/2e/ and matched to
# TSV set abbreviations via the numeric prefix in the CollectorsInfo column.
# If the page is unreachable, set labels fall back to the raw abbreviation.
#
# Usage: bash scripts/extract_card_options.sh
# Run this script whenever public/cards_with_processed_columns.txt is updated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TSV="$REPO_ROOT/public/cards_with_processed_columns.txt"
TARGET="$REPO_ROOT/src/lib/missionRequirements.ts"

if [[ ! -f "$TSV" ]]; then
  echo "Error: card data file not found at $TSV" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Single Node.js script that:
#   1. Parses the card TSV for SHIP_CLASSES, SPECIES, and set abbreviations
#   2. Fetches set names from https://www.trekcc.org/2e/ by parsing links of
#      the form href="index.php?id=N" — these are the "View Card List" links
#      that appear in each set section of the page.  For each such link the
#      script finds the nearest preceding heading element (h2-h6) and treats
#      its text content as the set name.
#   3. Maps each abbreviation to a set name via the numeric prefix found in
#      CollectorsInfo (e.g. BG cards carry "8R…"/"8C…" → set id 8 →
#      "To Boldly Go").  The most-frequent non-zero prefix is used so that
#      sets like Reflections 2.0 (which also reprints earlier-numbered cards)
#      resolve to their own id rather than a reprint's id.
#   4. Writes the updated constants block to missionRequirements.ts
# ---------------------------------------------------------------------------
node -e "
const https = require('https');
const fs    = require('fs');

const tsvPath    = process.argv[1];
const targetPath = process.argv[2];

// ── 1. Parse TSV ──────────────────────────────────────────────────────────
const lines      = fs.readFileSync(tsvPath, 'utf8').split('\n');
const headers    = lines[0].split('\t');
const classIdx   = headers.indexOf('Class');
const speciesIdx = headers.indexOf('Species');
const setIdx     = headers.indexOf('Set');
const collIdx    = headers.indexOf('CollectorsInfo');

const classes    = new Set();
const speciesSet = new Set();
// abbrev -> { setNum (string) -> count }
const abbrevToSetNums = {};

for (let i = 1; i < lines.length; i++) {
  const cols   = lines[i].split('\t');
  const c      = (cols[classIdx]   || '').replace(/^\"|\"$/g, '').trim();
  const s      = (cols[speciesIdx] || '').replace(/^\"|\"$/g, '').trim();
  const abbrev = (cols[setIdx]     || '').replace(/^\"|\"$/g, '').trim();
  const coll   = (cols[collIdx]    || '').replace(/^\"|\"$/g, '').trim();

  if (c)      classes.add(c);
  if (s)      speciesSet.add(s);
  if (abbrev) {
    if (!abbrevToSetNums[abbrev]) abbrevToSetNums[abbrev] = {};
    const m = coll.match(/^(\d+)/);
    if (m) {
      const num = m[1];
      abbrevToSetNums[abbrev][num] = (abbrevToSetNums[abbrev][num] || 0) + 1;
    }
  }
}

// For each abbreviation pick the most-frequent non-zero set number.
const abbrevToPrimaryId = {};
for (const [abbrev, numCounts] of Object.entries(abbrevToSetNums)) {
  const nonZero = Object.entries(numCounts).filter(([n]) => n !== '0');
  if (!nonZero.length) continue;
  nonZero.sort((a, b) => b[1] - a[1]);
  abbrevToPrimaryId[abbrev] = nonZero[0][0];
}

// ── 2. Fetch set names from trekcc.org/2e/ ───────────────────────────────
function fetchPage(url, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; webula-script/1.0)' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Parse the trekcc.org/2e/ page HTML.
//
// Structure of each set section on the page:
//
//   <h2>To Boldly Go</h2>          ← (or h3/h4 depending on page design)
//   <p>A Physical Expansion …</p>
//   …download links…
//   <a href=\"index.php?id=8\">View Card List</a>
//
// Strategy: collect all heading positions, then for every
// href=\"index.php?id=N\" link find the nearest preceding heading.
function parseSetNames(html) {
  const setIdToName = {};

  const headings = [];
  const headRe = /<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/gi;
  let hm;
  while ((hm = headRe.exec(html)) !== null) {
    const text = hm[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, '')
      .trim();
    if (text) headings.push({ pos: hm.index, text });
  }

  const linkRe = /href=\"index\.php\?id=(\d+)[^\"]*\"/g;
  let lm;
  while ((lm = linkRe.exec(html)) !== null) {
    const id = lm[1];
    if (setIdToName[id]) continue; // keep first (View Card List) match

    const linkPos = lm.index;
    let nearest = null;
    for (const h of headings) {
      if (h.pos < linkPos) nearest = h;
      else break;
    }
    if (nearest) setIdToName[id] = nearest.text;
  }

  return setIdToName;
}

// ── 3. Build constants and write to file ─────────────────────────────────
(async () => {
  let setIdToName = {};
  try {
    const html = await fetchPage('https://www.trekcc.org/2e/');
    setIdToName = parseSetNames(html);
    console.error('Fetched ' + Object.keys(setIdToName).length + ' set names from https://www.trekcc.org/2e/');
  } catch (e) {
    console.error('Warning: could not fetch set names from https://www.trekcc.org/2e/: ' + e.message);
    console.error('Set labels will fall back to abbreviations.');
  }

  const indent = '  ';

  const sortedClasses = [...classes].sort();
  const classLines = sortedClasses.map(c => {
    const esc = c.includes(\"'\") ? '\"' + c + '\"' : \"'\" + c + \"'\";
    return indent + esc + ',';
  }).join('\n');

  const sortedSpecies = [...speciesSet].sort();
  const speciesLines = sortedSpecies.map(s => {
    const esc = s.includes(\"'\") ? '\"' + s + '\"' : \"'\" + s + \"'\";
    return indent + esc + ',';
  }).join('\n');

  const sortedAbbrevs = Object.keys(abbrevToSetNums).sort();
  const setsLines = sortedAbbrevs.map(abbrev => {
    const primaryId = abbrevToPrimaryId[abbrev];
    const label = (primaryId && setIdToName[primaryId]) || abbrev;
    const labelEsc = label.includes(\"'\") ? '\"' + label + '\"' : \"'\" + label + \"'\";
    const valueEsc = abbrev.includes(\"'\") ? '\"' + abbrev + '\"' : \"'\" + abbrev + \"'\";
    return indent + '{ label: ' + labelEsc + ', value: ' + valueEsc + ' },';
  }).join('\n');

  const block =
    '// AUTO-GENERATED by scripts/extract_card_options.sh \u2014 do not edit manually\n' +
    'export const SHIP_CLASSES: string[] = [\n' +
    classLines + '\n' +
    '];\n\n' +
    'export const SPECIES: string[] = [\n' +
    speciesLines + '\n' +
    '];\n\n' +
    'export const SETS: { label: string; value: string }[] = [\n' +
    setsLines + '\n' +
    '];\n' +
    '// END AUTO-GENERATED';

  const content = fs.readFileSync(targetPath, 'utf8');
  const start = content.indexOf('// AUTO-GENERATED by scripts/extract_card_options.sh');
  const end   = content.indexOf('// END AUTO-GENERATED');
  if (start === -1 || end === -1) {
    console.error('Sentinel comments not found in ' + targetPath);
    process.exit(1);
  }
  const endFull = end + '// END AUTO-GENERATED'.length;
  const newContent = content.slice(0, start) + block + content.slice(endFull);
  fs.writeFileSync(targetPath, newContent, 'utf8');
  console.log('Updated ' + targetPath);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
" "$TSV" "$TARGET"

echo "Done. SHIP_CLASSES, SPECIES, and SETS updated in $TARGET"

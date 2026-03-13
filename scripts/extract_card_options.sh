#!/usr/bin/env bash
# extract_card_options.sh
#
# Extracts unique Class, Species, and Set values from the card data TSV and
# writes/overwrites the SHIP_CLASSES, SPECIES, and SETS constant blocks in
# src/lib/missionRequirements.ts between sentinel comments.
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
# Hardcoded set abbreviation → full name mapping.
# Sourced from https://www.trekcc.org/2e/
# Add new entries here as new sets are released; unknown abbreviations fall
# back to the raw abbreviation as both label and value.
# ---------------------------------------------------------------------------
declare -A SET_NAMES=(
  ["50"]="50th Anniversary Collection"
  ["AC"]="Allegiance"
  ["AP"]="Archive Pack"
  ["AR"]="Assimilation"
  ["ATtS"]="A Time to Stand"
  ["Alg"]="Alliance"
  ["AoY"]="Age of Onset"
  ["BG"]="Blood and Honor"
  ["BP"]="Broken Promises"
  ["BoT"]="Broken Bow"
  ["CA"]="Convergence"
  ["CC"]="Captain's Log"
  ["Ctkr"]="Contagion"
  ["DM"]="Dangerous Missions"
  ["DS"]="Deep Space 9"
  ["EM"]="Earth"
  ["En"]="Energize"
  ["FBtS"]="Far Beyond the Stars"
  ["FT"]="Fractured Time"
  ["FotE"]="Face of the Enemy"
  ["Ge"]="Genesis"
  ["ID"]="Identity"
  ["IMD"]="In a Mirror, Darkly"
  ["In"]="Infinite Diversity"
  ["LD"]="Live Long and Prosper"
  ["Leg"]="Legends of the Alliance"
  ["Lineage"]="Lineage"
  ["MoT"]="Matter of Time"
  ["PP"]="Premiere Pack"
  ["Promo"]="Promo"
  ["QP"]="Q's Tent"
  ["R2"]="Reflections 2.0"
  ["RoF"]="Reign of Fury"
  ["RtG"]="Return to Grace"
  ["SB"]="Strange Bedfellows"
  ["SC"]="Second Chances"
  ["SOA"]="Sacrifice of Angels"
  ["Sym"]="Symbiosis"
  ["TM"]="The Maquis"
  ["TUC"]="The Undiscovered Country"
  ["Tapestry"]="Tapestry"
  ["Unity"]="Unity"
  ["WNOHGB"]="Where No One Has Gone Before"
  ["WYLB"]="What You Leave Behind"
  ["ZH"]="Zero Hour"
)

# ---------------------------------------------------------------------------
# Extract unique values using Node.js (already required by the project).
# ---------------------------------------------------------------------------
EXTRACTED=$(node -e "
const fs = require('fs');
const lines = fs.readFileSync('$TSV', 'utf8').split('\n');
const headers = lines[0].split('\t');
const classIdx = headers.indexOf('Class');
const speciesIdx = headers.indexOf('Species');
const setIdx = headers.indexOf('Set');

const classes = new Set();
const species = new Set();
const sets = new Set();

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t');
  const c = (cols[classIdx] || '').replace(/^\"|\"$/g, '').trim();
  const s = (cols[speciesIdx] || '').replace(/^\"|\"$/g, '').trim();
  const st = (cols[setIdx] || '').replace(/^\"|\"$/g, '').trim();
  if (c) classes.add(c);
  if (s) species.add(s);
  if (st) sets.add(st);
}

process.stdout.write(JSON.stringify({
  classes: [...classes].sort(),
  species: [...species].sort(),
  sets: [...sets].sort(),
}));
")

# Parse extracted JSON values
CLASSES=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(d.classes));" "$EXTRACTED")
SPECIES_LIST=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(d.species));" "$EXTRACTED")
SETS_LIST=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(d.sets));" "$EXTRACTED")

# ---------------------------------------------------------------------------
# Build the replacement block using Node.js for reliable string handling.
# ---------------------------------------------------------------------------
node -e "
const fs = require('fs');
const setNames = $(declare -p SET_NAMES 2>/dev/null | node -e "
  const data = require('fs').readFileSync('/dev/stdin', 'utf8');
  // Parse bash associative array declaration to JS object
  const obj = {};
  const re = /\[\"([^\"]+)\"\]=\"([^\"]*)\"/g;
  let m;
  while ((m = re.exec(data)) !== null) obj[m[1]] = m[2];
  process.stdout.write(JSON.stringify(obj));
" || echo '{}');
const classes = $CLASSES;
const speciesList = $SPECIES_LIST;
const setsList = $SETS_LIST;

const indent = '  ';

const classLines = classes.map(c => {
  const escaped = c.includes(\"'\") ? '\"' + c + '\"' : \"'\" + c + \"'\";
  return indent + escaped + ',';
}).join('\n');

const speciesLines = speciesList.map(s => {
  const escaped = s.includes(\"'\") ? '\"' + s + '\"' : \"'\" + s + \"'\";
  return indent + escaped + ',';
}).join('\n');

const setsLines = setsList.map(abbrev => {
  const label = setNames[abbrev] || abbrev;
  const labelEsc = label.includes(\"'\") ? '\"' + label + '\"' : \"'\" + label + \"'\";
  const valueEsc = abbrev.includes(\"'\") ? '\"' + abbrev + '\"' : \"'\" + abbrev + \"'\";
  return indent + '{ label: ' + labelEsc + ', value: ' + valueEsc + ' },';
}).join('\n');

const block = \`// AUTO-GENERATED by scripts/extract_card_options.sh — do not edit manually
export const SHIP_CLASSES: string[] = [
\${classLines}
];

export const SPECIES: string[] = [
\${speciesLines}
];

export const SETS: { label: string; value: string }[] = [
\${setsLines}
];
// END AUTO-GENERATED\`;

const target = '$TARGET';
let content = fs.readFileSync(target, 'utf8');
const start = content.indexOf('// AUTO-GENERATED by scripts/extract_card_options.sh');
const end = content.indexOf('// END AUTO-GENERATED');
if (start === -1 || end === -1) {
  console.error('Sentinel comments not found in ' + target);
  process.exit(1);
}
const endFull = end + '// END AUTO-GENERATED'.length;
const newContent = content.slice(0, start) + block + content.slice(endFull);
fs.writeFileSync(target, newContent, 'utf8');
console.log('Updated ' + target);
"

echo "Done. SHIP_CLASSES, SPECIES, and SETS updated in $TARGET"

#! /bin/bash

# Builds public/cards_with_processed_columns.txt from the set files of the
# LackeyCCG Star Trek 2E plugin, fetched from GitHub. These are the same files
# LackeyCCG downloads into ~/LackeyCCG/plugins/startrek2e/sets/ (see the
# plugin's updatelist.txt), so no local LackeyCCG install is needed.
#
# Set STARTREK2E_REF to build from another branch, tag or commit.

set -euo pipefail

ref="${STARTREK2E_REF:-playable}"
base="https://raw.githubusercontent.com/eberlems/startrek2e/${ref}/sets"
output="public/cards_with_processed_columns.txt"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$base/Physical.txt" -o "$tmp/Physical.txt"
curl -fsSL "$base/Virtual.txt" -o "$tmp/Virtual.txt"
cat "$tmp/Physical.txt" <(tail -n +2 "$tmp/Virtual.txt") > "$tmp/lackey_cards.txt"

# split_columns.js appends to its output file, so start from an empty one
rm -f "$output"
node scripts/split_columns.js "$tmp/lackey_cards.txt" "$output"

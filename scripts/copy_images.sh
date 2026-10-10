#! /bin/bash

# Downloads the card images that public/cards_with_processed_columns.txt names
# into public/cardimages, from the image folder of the LackeyCCG Star Trek 2E
# plugin on GitHub (the folder its CardGeneralURLs.txt points LackeyCCG at).
#
# By default it fetches only the images missing from public/cardimages.
# Pass --all to download every image again, to pick up images changed upstream.
# Set STARTREK2E_REF to fetch from another branch, tag or commit.
#
# Run it after scripts/copy_card_data.sh.

set -euo pipefail

all=false
while [ $# -gt 0 ]; do
  case "$1" in
    --all) all=true ;;
    *) echo "usage: $0 [--all]" >&2; exit 2 ;;
  esac
  shift
done

ref="${STARTREK2E_REF:-playable}"
export base="https://raw.githubusercontent.com/eberlems/startrek2e/${ref}/sets/setimages/general"
export dest="public/cardimages"
cards="public/cards_with_processed_columns.txt"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export tmp

# The ImageFile column, found by its header, without the quotes split_columns.js
# adds. A double-sided card names its front and back image, "front,back", and
# each is a file of its own (see loadCards.ts).
awk -F'\t' '
  NR == 1 { for (i = 1; i <= NF; i++) if ($i == "ImageFile") col = i; next }
  { gsub(/"/, "", $col); n = split($col, files, ","); for (j = 1; j <= n; j++) if (files[j] != "") print files[j] }
' "$cards" | sort -u > "$tmp/names"

if [ "$all" = false ]; then
  while read -r name; do
    [ -f "$dest/$name.jpg" ] || echo "$name"
  done < "$tmp/names" > "$tmp/wanted"
else
  cp "$tmp/names" "$tmp/wanted"
fi

echo "Downloading $(wc -l < "$tmp/wanted") of $(wc -l < "$tmp/names") images"

# Download to a temporary file first, so a failed download leaves no broken image
fetch() {
  if curl -fsSL "$base/$1.jpg" -o "$tmp/$1.jpg" 2>/dev/null; then
    mv "$tmp/$1.jpg" "$dest/$1.jpg"
  else
    echo "$1" >> "$tmp/failed"
  fi
}
export -f fetch
xargs -P 8 -I {} bash -c 'fetch "$@"' _ {} < "$tmp/wanted"

if [ -s "$tmp/failed" ]; then
  echo "Not found on GitHub ($(wc -l < "$tmp/failed")):"
  sort "$tmp/failed"
fi

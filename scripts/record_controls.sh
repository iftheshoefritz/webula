#!/usr/bin/env bash
# Records the clips of the Controls panel (#1089, #1091).
#
#   bash scripts/record_controls.sh <row-id>           # both columns of one row
#   bash scripts/record_controls.sh <row-id> touch     # one column
#   bash scripts/record_controls.sh --all              # every row of controls.ts that sets `clip`
#
# It needs the dev server (`NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev`, or BASE_URL) and ffmpeg.
# The work is done by `record_controls.mjs`; the gesture of each clip is in its GESTURES map.
# It writes public/controls/<id>-<touch|mouse>.{webm,mp4,webp}, and prints the size of each file.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is missing. Install it (apt-get install ffmpeg, or brew install ffmpeg) and run this again." >&2
  exit 1
fi
if ! curl -s -o /dev/null "$BASE_URL"; then
  echo "Nothing answers at $BASE_URL. Start the dev server with \`NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev\` first." >&2
  exit 1
fi

export BASE_URL
exec node --experimental-websocket --no-warnings "$DIR/record_controls.mjs" "$@"

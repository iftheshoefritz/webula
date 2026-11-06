#!/usr/bin/env bash
# Records a bot game from the start to the first revealed dilemma.
#
#   bash scripts/record_bot_attempt.sh                 # mouse, into public/videos
#   bash scripts/record_bot_attempt.sh touch           # touch, into public/videos
#   bash scripts/record_bot_attempt.sh mouse <dir>     # mouse, into <dir>
#
# It needs the dev server (`NEXT_PUBLIC_AGENT_BROWSER=1 yarn dev`, or BASE_URL) and ffmpeg.
# The work is done by `record_bot_attempt.mjs`. It writes bot-attempt-<mode>.mp4.
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
exec node --no-warnings "$DIR/record_bot_attempt.mjs" "$@"

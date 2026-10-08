#!/usr/bin/env bash
# Opens one page in agent-browser as a desktop with a mouse (#1022).
#
#   bash scripts/agent_browser_desktop.sh <url>
#   bash scripts/agent_browser_desktop.sh 'http://localhost:3000/decks/practice?fixture=1&reset=1'
#
# Headless Chromium has no pointer device, so `(pointer: fine)` does not match.
# The practice table then draws its touch layout: `useFinePointer` returns
# false, and the CSS `[@media(pointer:fine)]` rules of `CardPreview` do not
# apply. A check of a desktop feature sees the wrong layout.
#
# This script starts Chromium with the Blink setting
# `primaryPointerType=4;availablePointerTypes=4` (4 is a fine pointer). The
# setting changes the device the browser reports, so JavaScript and CSS media
# queries agree. Do not patch `window.matchMedia` with `--init-script` instead:
# that changes what JavaScript sees and nothing else, so CSS still sees
# `pointer: none`, and the page draws a layout no real device draws.
#
# The mode gives a fine pointer only. `(hover: hover)` stays false.
#
# agent-browser runs a daemon, and launch options such as `--args` apply only
# when the daemon starts. With a daemon already running, they are ignored. So
# this script first closes every agent-browser session. Any earlier page state
# in the browser is gone.
#
# Every later `npx agent-browser ...` command, `practice_drag.sh` too, talks to
# the same daemon and stays in desktop mode. To go back to the touch layout,
# run `npx agent-browser close` and open the page again without this script.
#
# After the load the script prints `pointer: fine = <true|false>`, and exits 1
# when it is false.
set -u

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "usage: bash scripts/agent_browser_desktop.sh <url>" >&2
  exit 2
fi

# The `--args` value is split on commas, so this flag must hold no comma.
FLAG='--blink-settings=primaryPointerType=4;availablePointerTypes=4'

npx agent-browser close --all >/dev/null 2>&1

if ! npx agent-browser --args "$FLAG" open "$URL"; then
  echo "agent-browser could not open $URL" >&2
  exit 1
fi
npx agent-browser wait --load load >/dev/null 2>&1

FINE=$(npx agent-browser eval "matchMedia('(pointer: fine)').matches" 2>&1 | tail -1 | tr -d '"')
echo "pointer: fine = $FINE"
if [ "$FINE" != "true" ]; then
  echo "The page does not see a fine pointer, so it draws the touch layout." >&2
  exit 1
fi

#!/usr/bin/env bash
# Sends touch input, or mouse input with modifier keys, to the agent-browser page (#1035).
#
#   bash scripts/cdp_input.sh tap <x> <y> | <selector>
#   bash scripts/cdp_input.sh pan <selector> <dx> <dy>
#   bash scripts/cdp_input.sh touch-drag <x> <y> <tx> <ty>
#   bash scripts/cdp_input.sh click <x> <y> | <selector> [--mod shift,ctrl,meta,alt]
#   bash scripts/cdp_input.sh mouse-drag <x> <y> <tx> <ty> [--mod shift,ctrl,meta,alt]
#   bash scripts/cdp_input.sh mouse-path <x> <y> <tx>,<ty>,<hold-ms> ... [--mod shift,ctrl,meta,alt]
#   bash scripts/cdp_input.sh touch-path <x> <y> <tx>,<ty>,<hold-ms> ...
#
# The work is done by `cdp_input.mjs`; this wrapper only finds the browser's
# DevTools URL with `npx agent-browser get cdp-url` and runs Node with
# `--experimental-websocket`, the built-in WebSocket of Node 20. No package is
# needed. Each command prints the pointer events the page saw.
#
# For a touch drag of a card to a place on the practice table, use
# `bash scripts/practice_drag.sh --touch <card-id> <target>` instead. It finds
# the point to grab and the point to drop, and prints the zone the card ends in.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
URL=$(npx agent-browser get cdp-url 2>/dev/null | tail -1 | tr -d '"')
case "$URL" in
  ws://*) ;;
  *)
    echo "agent-browser has no browser running. Open a page with \`npx agent-browser open <url>\` first." >&2
    exit 1 ;;
esac

exec node --experimental-websocket --no-warnings "$DIR/cdp_input.mjs" "$URL" "$@"

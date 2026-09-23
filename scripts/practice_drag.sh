#!/usr/bin/env bash
# Drags one card of the practice table to one zone, with agent-browser.
#
#   bash scripts/practice_drag.sh <card-id> <data-zone>
#   bash scripts/practice_drag.sh card-5 core
#
# It prints the zone the card is in after the drag, or `pile` when the card
# went into a mission pile, because a mission pile shows a badge and keeps its
# cards out of the DOM.
#
# Two things make a hand drag fail, and both cost an agent many turns to find
# again. This script handles both.
#
# 1. The coordinates of the target move while the drag runs. A mouse down on a
#    card of the open hand closes the fan, and the rest of the table then
#    reflows. A target position read before the drag points at the old layout,
#    so the drop lands in the wrong zone or in no zone. This script reads the
#    target rect after the drag starts.
#
# 2. The cards of the fan overlap, and the later card is on top. So the centre
#    of a card is often under its neighbour, and the drag then moves the wrong
#    card. This script scans the box of the card for a point where
#    `elementFromPoint` returns that card, and grabs it there.
#
# `collisionDetection.ts` ranks a drop by `pointerWithin` first, so the pointer
# must stop inside the rect of the target zone. The script moves to the centre
# of that rect.
#
# The first move is 4 px right and 8 px up. The `PointerSensor` in `page.tsx`
# needs 8 px of movement before a drag starts, so one large move alone does
# nothing.
set -u

CARD="${1:-}"
ZONE="${2:-}"
if [ -z "$CARD" ] || [ -z "$ZONE" ]; then
  echo "usage: bash scripts/practice_drag.sh <card-id> <data-zone>" >&2
  exit 2
fi

ab() { npx agent-browser "$@" >/dev/null 2>&1; }
ev() { npx agent-browser eval "$1" 2>&1 | tail -1 | tr -d '"'; }

# Every eval shares one scope, so each one is an arrow function called at once.
# A bare `const` fails the second time with "Identifier has already been declared".
grab=$(ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');if(!e)return 'MISSING';const r=e.getBoundingClientRect();for(let fx=0.05;fx<=0.95;fx+=0.05){for(let fy=0.2;fy<=0.8;fy+=0.1){const x=Math.round(r.x+r.width*fx),y=Math.round(r.y+r.height*fy);const t=document.elementFromPoint(x,y);if(t&&t.closest('[data-card-id]')===e)return x+' '+y}}return 'COVERED'})()")

case "$grab" in
  MISSING) echo "card $CARD is not in the DOM. Open the hand or the panel that holds it first." >&2; exit 1 ;;
  COVERED) echo "no point of card $CARD is on top. Another card covers all of it." >&2; exit 1 ;;
esac

set -- $grab
ax=$1; ay=$2

ab mouse move "$ax" "$ay"
ab mouse down
ab mouse move "$((ax + 4))" "$((ay - 8))"

# The layout reflowed when the drag started, so read the target now, not before.
target=$(ev "(()=>{const e=document.querySelector('[data-zone=\"$ZONE\"]');if(!e)return 'MISSING';const r=e.getBoundingClientRect();return Math.round(r.x+r.width/2)+' '+Math.round(r.y+r.height/2)})()")

if [ "$target" = "MISSING" ]; then
  ab mouse up
  echo "no element has data-zone=\"$ZONE\"." >&2
  exit 1
fi

set -- $target
bx=$1; by=$2

ab mouse move "$bx" "$by"
# A second move at the same point. dnd-kit reads the last pointer event, and one
# move can arrive before the reflow settles.
ab mouse move "$bx" "$by"
ab mouse up

ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');if(!e)return 'pile';const z=e.closest('[data-zone]');return z?z.getAttribute('data-zone'):'no zone'})()"

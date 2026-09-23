#!/usr/bin/env bash
# Drags one card of the practice table to one zone, with agent-browser.
#
#   bash scripts/practice_drag.sh <card-id> <data-zone>
#   bash scripts/practice_drag.sh card-5 core
#
# It prints the zone the card is in after the drag. A mission pile, a closed
# hand, a closed dilemma hand, and a ship's crew all keep their cards out of
# the DOM (a badge with a count stands in for the cards), so for those the
# script cannot find the card by id afterward. Instead it reads the
# `aria-label` of every badge on the table, before and after the drag, and
# reports whichever one gained a card. If none did (or more than one did), it
# says so rather than guessing.
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

# A badge (hand, dilemma hand, or a mission pile) reads "<Label>, N cards, tap
# to open". Everything else, including the aria-labels the draw and download
# piles use, misses the regex and is ignored. The key is the badge's own
# data-zone if it has one (the closed hand and dilemma hand are their own drop
# target, and so is a mission pile's badge - a separate drop target from the
# mission card's own, and not nested inside it, so scoping the search to the
# target zone's own subtree would miss it). The one badge with no data-zone of
# its own, the dilemmas stacked under a mission, falls back to its label text;
# only one card moves per run of this script, so at most one badge anywhere
# on the table ever gains a card, and this fallback key never has to tell two
# missions' stacks apart.
#
# A ship's crew badge reads "<Ship name> crew, N cards" instead - no ", tap to
# open" suffix, since it's a non-interactive span (#678), not a button. It
# never carries its own data-zone either: it's a sibling of the ship's own
# TableCard button, so it can't be the drop target itself (a `<button>` can't
# nest inside another `<button>`). Its data-zone lives one level up, on the
# div MissionRow.tsx wraps around both the ship and its badge (`crewDropId`).
# So this key comes from the closest ancestor's data-zone, not the element's
# own, falling back to the ship name if somehow neither is set (#715).
snapshot() {
  ev "(()=>{const parts=[];const add=(el)=>{const l=el.getAttribute&&el.getAttribute('aria-label');if(!l)return;const pile=/^(.*?), (\d+) cards?, tap to open$/.exec(l);if(pile){const k=el.getAttribute('data-zone')||pile[1];parts.push(k+'='+pile[2]);return}const crew=/^(.*?) crew, (\d+) cards?$/.exec(l);if(!crew)return;const z=el.closest('[data-zone]');const k=z?z.getAttribute('data-zone'):crew[1];parts.push(k+'='+crew[2])};document.querySelectorAll('[aria-label]').forEach(add);return parts.join(';')})()"
}

before=$(snapshot)

ab mouse move "$bx" "$by"
# A second move at the same point. dnd-kit reads the last pointer event, and one
# move can arrive before the reflow settles.
ab mouse move "$bx" "$by"
ab mouse up

found=$(ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');if(!e)return 'MISSING';const z=e.closest('[data-zone]');return z?z.getAttribute('data-zone'):'no zone'})()")

if [ "$found" != "MISSING" ]; then
  echo "$found"
  exit 0
fi

# The card left the DOM. Find which badge on the table gained a card, rather
# than guessing it was a mission pile - a closed hand or dilemma hand also
# takes its cards out of the DOM.
after=$(snapshot)

declare -A beforeCounts afterCounts
if [ -n "$before" ]; then
  IFS=';' read -ra parts <<< "$before"
  for p in "${parts[@]}"; do
    beforeCounts["${p%=*}"]="${p##*=}"
  done
fi
if [ -n "$after" ]; then
  IFS=';' read -ra parts <<< "$after"
  for p in "${parts[@]}"; do
    afterCounts["${p%=*}"]="${p##*=}"
  done
fi

increased=()
for k in "${!afterCounts[@]}"; do
  b="${beforeCounts[$k]:-0}"
  a="${afterCounts[$k]}"
  if [ "$a" -gt "$b" ]; then
    increased+=("$k")
  fi
done

case "${#increased[@]}" in
  1) echo "${increased[0]}" ;;
  0) echo "card $CARD left the DOM, but no badge on the table gained a card. Could not tell where it went." ;;
  *) echo "card $CARD left the DOM, and more than one badge gained a card (${increased[*]}). Could not tell which one it went to." ;;
esac

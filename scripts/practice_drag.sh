#!/usr/bin/env bash
# Drags one card of the practice table to one place, with agent-browser.
#
#   bash scripts/practice_drag.sh <card-id> <data-zone or data-testid>
#   bash scripts/practice_drag.sh card-5 core
#   bash scripts/practice_drag.sh card-1 mission-pile-awayTeam-0
#
# The target is a name, not a CSS selector. The script looks for the element
# with `data-zone="<name>"` first, and if none has it, the element with
# `data-testid="<name>"` (#1026). A data-testid marks a place that is not a
# drop target of its own, such as the away team badge (#924), so aiming at one
# means "drop at that spot": the droppable under that spot routes the drop.
# For the away team badge that is the mission's bottom half, `mission-on-<index>`.
#
# It prints the zone the card is in after the drag: a data-zone, or, for a card
# that left the DOM, the data-zone or data-testid of the badge that gained a
# card. Each of those names is also a valid target. The only exceptions are the
# fallbacks below: a mission card's counter of the cards on it is keyed by the
# mission's name, and a crew badge with no data-zone ancestor by the ship's name.
#
# A mission pile, a closed hand, a closed dilemma hand, and a ship's crew all
# keep their cards out of the DOM (a badge with a count stands in for the cards), so for those the
# script cannot find the card by id afterward. Instead it reads the
# `aria-label` of every badge on the table, before and after the drag, and
# reports whichever one gained a card. If none did (or more than one did), it
# says so rather than guessing.
#
# A drop under a mission prints `mission-under-<index>` (#920), the name of the
# drop target, whether the card shows as one of the two slivers of the stack
# or has left the DOM. The stack is not a drop target (#861), so it has no
# data-zone; the script finds it by its data-testid, `mission-under-<index>-stack`.
#
# A drop on the draw deck or the dilemma pile prints `draw-pile-top`,
# `draw-pile-bottom`, `dilemma-pile-top` or `dilemma-pile-bottom` (#1025), the
# half the card reached. A card that went to the top is the pile's new top
# card, which stays in the DOM inside the pile's wrapper (`data-testid` of
# `draw-pile` or `dilemma-pile`), so the script prints `<pile>-top`. A card
# that went to the bottom leaves the DOM; the wrapper's `data-pile-count` then
# grows, so the script prints `<pile>-bottom`.
#
# Three things make a hand drag fail, and each one cost an agent many turns to
# find again. This script handles all three.
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
# 3. A release near the press point cancels the drag (#774, `releaseCancel.ts`).
#    A release less than 24 px, in a straight line, from the press point puts
#    the card back where it was (#825 replaced the older rectangle around the
#    pressed card), so a hand card goes back to the hand and the script prints
#    `hand`. This script releases at the point of the target rect nearest its
#    centre that is at least 24 px from the press point.
#
# `collisionDetection.ts` ranks a drop by `pointerWithin` first, so the pointer
# must stop inside the rect of the target zone. The script moves to the centre
# of that rect when the centre is at least 24 px from the press point, as above.
#
# The first move is 4 px right and 8 px up. The `PointerSensor` in `page.tsx`
# needs 8 px of movement before a drag starts, so one large move alone does
# nothing.
#
# A card in a closed hand or a closed dilemma hand is not in the DOM. The script
# opens the hand that holds it first (#1027), and closes it again after the
# drop, so the table is left as the script found it. It does not open a card
# list panel, a mission pile, or a ship's crew; open those yourself.
#
# When no point of the card is on top, the script reads why and says what to do:
# a hidden card (a drag may still be running), a card outside the viewport,
# another card on top, or another element on top, such as the backdrop of an
# open hand or card list panel, named by its data-testid, data-zone or
# aria-label.
#
# The game menu splash (#781) opens on every load of the table and covers it,
# so a drag under it lands nowhere. The script checks for the splash first and
# stops with a message if it is open (#1028). It does not close the splash,
# because a check of the splash itself must still see it. Open the table with
# `menu=0` in the URL to start with the splash closed.
set -u

CARD="${1:-}"
ZONE="${2:-}"
if [ -z "$CARD" ] || [ -z "$ZONE" ]; then
  echo "usage: bash scripts/practice_drag.sh <card-id> <data-zone or data-testid>" >&2
  exit 2
fi

ab() { npx agent-browser "$@" >/dev/null 2>&1; }
ev() { npx agent-browser eval "$1" 2>&1 | tail -1 | tr -d '"'; }

# A badge (hand, dilemma hand, or a mission pile) reads "<Label>, N cards, tap
# to open". Everything else, including the aria-labels the draw and download
# piles use, misses the regex and is ignored. The key is the badge's own
# data-zone if it has one (the closed hand and dilemma hand are their own drop
# target). The away team badge is not a drop target (#924), so its key is its
# data-testid, `mission-pile-awayTeam-<index>`. It sits below the mission card,
# not nested inside the bottom half's element, so scoping the search to the
# target zone's own subtree would miss it. The one badge with neither, the hidden button of the dilemmas stacked under a mission, sits in
# the stack, whose data-testid is `mission-under-<index>-stack` (#920). Its key
# is that testid without the `-stack`, which is the name of the drop target,
# `mission-under-<index>`, so two missions' stacks never share one key.
#
# A ship's crew badge reads "<Ship name> crew, N cards" instead - no ", tap to
# open" suffix, since it's a non-interactive span (#678), not a button. It
# has no data-zone of its own (#923) and shows with an empty crew too (#812).
# It sits inside the ship's own wrapper, so the key comes from the closest
# data-zone, the ship's drop zone `crew-<the ship's card id>`, falling back to
# the ship name if somehow none is set (#715). The ship's counter of the cards
# on it shares that key, so the counts of one key are summed.
#
# The badge of the placed cards (#810), on a card in the core or the brig, reads
# "<Card name>, N cards on it". It sits inside that card's own wrapper, so its
# key is that card's drop zone, `on-<its card id>`. A ship's counter of the
# cards on it (#812) reads the same way, and sits inside the ship's own
# wrapper, so its key is the ship's drop zone, `crew-<the ship's card id>`.
# A mission card's counter (#813) reads the same way too. It sits beside the
# mission card's two drop halves (#871), not inside a data-zone, so its key is
# the fallback, the mission's name.
#
# The draw deck and the dilemma pile hold their size in `data-pile-count` on
# the pile's wrapper (#1025), present even when the pile is empty. One wrapper
# per pile, so each pile counts once. Its key is `<testid>-bottom`, because a
# card that leaves the DOM and lands in the pile went to the bottom: a card on
# top would still be in the DOM as the pile's top card.
snapshot() {
  ev "(()=>{const parts=[];const add=(el)=>{const l=el.getAttribute&&el.getAttribute('aria-label');if(!l)return;const pile=/^(.*?), (\d+) cards?, tap to open$/.exec(l);if(pile){const st=el.closest('[data-testid^=\"mission-under-\"][data-testid$=\"-stack\"]');const k=el.getAttribute('data-zone')||el.getAttribute('data-testid')||(st?st.getAttribute('data-testid').replace(/-stack$/,''):pile[1]);parts.push(k+'='+pile[2]);return}const crew=/^(.*?) crew, (\d+) cards?$/.exec(l)||/^(.*?), (\d+) cards? on it$/.exec(l);if(!crew)return;const z=el.closest('[data-zone]');const k=z?z.getAttribute('data-zone'):crew[1];parts.push(k+'='+crew[2])};document.querySelectorAll('[aria-label]').forEach(add);document.querySelectorAll('[data-pile-count]').forEach((el)=>parts.push(el.getAttribute('data-testid')+'-bottom='+el.getAttribute('data-pile-count')));return parts.join(';')})()"
}

splash=$(ev "(()=>document.querySelector('[data-testid=\"game-menu-splash\"]')?'OPEN':'CLOSED')()")
if [ "$splash" = "OPEN" ]; then
  echo "the game menu splash is open and covers the table. Add menu=0 to the URL, or press Continue." >&2
  exit 1
fi

# Every eval shares one scope, so each one is an arrow function called at once.
# A bare `const` fails the second time with "Identifier has already been declared".
present() { ev "(()=>document.querySelector('[data-card-id=\"$CARD\"]')?'YES':'NO')()"; }

# A closed hand keeps its cards out of the DOM (#1027). The closed button of a
# hand carries the hand's data-zone, `hand` or `dilemmaHand`, only while the
# hand is closed, and it is disabled when the hand is empty. Open each closed
# hand that holds cards, with a DOM click ("A click that does not click" in
# AGENTS.md), until one shows the card. A hand that does not hold it is closed
# again by a DOM click on its backdrop, `Close <label>`, which lands at (0, 0),
# outside every control the backdrop lets through. Only one hand is open at a
# time, so opening a hand closes the other one.
OPENED=""
close_hand() {
  ev "(()=>{const b=document.querySelector('button[aria-label=\"Close $1\"]');if(!b)return 'NONE';b.click();return 'CLOSED'})()" >/dev/null
}
wait_present() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ "$(present)" = "YES" ] && return 0
    sleep 0.2
  done
  return 1
}

if [ "$(present)" = "NO" ]; then
  for hz in hand dilemmaHand; do
    label=$(ev "(()=>{const b=document.querySelector('button[data-zone=\"$hz\"]');if(!b||b.disabled)return '';const m=/^(.*?), \\d+ cards?, tap to open\$/.exec(b.getAttribute('aria-label')||'');if(!m)return '';b.click();return m[1]})()")
    [ -z "$label" ] && continue
    if wait_present; then
      OPENED="$label"
      break
    fi
    close_hand "$label"
  done
fi

# The page opens the hand a card came from again after the drop if it still
# holds a card. If the script opened that hand, close it on the way out, so the
# next command does not meet a backdrop that covers the table. A hand that was
# open before the run stays open.
cleanup() {
  if [ -n "$OPENED" ]; then
    sleep 0.3
    close_hand "$OPENED"
  fi
}
trap cleanup EXIT

# Scan the card for a point where `elementFromPoint` returns it (trap 2). The
# x axis goes in 1 px steps: `offsetFor` (`overlapOffset.ts`) can show only a
# 2 px strip of a card under its neighbour, and a coarser step can miss it.
grab=$(ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');if(!e)return 'MISSING';const r=e.getBoundingClientRect();for(let x=Math.ceil(r.x+1);x<r.right-1;x++){for(let fy=0.2;fy<=0.8;fy+=0.1){const y=Math.round(r.y+r.height*fy);const t=document.elementFromPoint(x,y);if(t&&t.closest('[data-card-id]')===e)return x+' '+y}}return 'COVERED'})()")

if [ "$grab" = "MISSING" ]; then
  echo "card $CARD is not in the DOM, and neither hand holds it. The script opens a closed hand itself, but not a card list panel, a mission pile, or a ship's crew. Open the panel that holds the card (a tap on the pile, the mission, or the ship), then run the script again." >&2
  exit 1
fi

# No point of the card is on top. Read why, in the same page state, and say
# what the agent can do about it.
if [ "$grab" = "COVERED" ]; then
  why=$(ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');for(let a=e;a&&a.nodeType===1;a=a.parentElement){if(getComputedStyle(a).visibility==='hidden'||a.getAttribute('aria-hidden')==='true')return 'HIDDEN'}const r=e.getBoundingClientRect();if(r.width===0||r.height===0)return 'HIDDEN';const x=Math.min(Math.max(r.x+r.width/2,0),innerWidth-1),y=Math.min(Math.max(r.y+r.height/2,0),innerHeight-1);if(r.right<=0||r.bottom<=0||r.x>=innerWidth||r.y>=innerHeight)return 'OFFSCREEN';const t=document.elementFromPoint(x,y);if(!t)return 'OFFSCREEN';const c=t.closest('[data-card-id]');if(c)return 'CARD '+c.getAttribute('data-card-id');for(let a=t;a&&a.nodeType===1;a=a.parentElement){for(const k of ['data-testid','data-zone','aria-label']){const v=a.getAttribute(k);if(v&&v!=='practice-game-layer')return 'OTHER '+k+'='+v}}return 'OTHER '+t.tagName.toLowerCase()})()")
  case "$why" in
    HIDDEN)
      echo "card $CARD is in the DOM but hidden. A hidden fan means a drag may still be running. Release the mouse (npx agent-browser mouse up) and run the script again." >&2 ;;
    OFFSCREEN)
      echo "card $CARD is outside the viewport, so no point of it can be hit. Use a larger viewport (npx agent-browser set viewport 1280 800), or scroll the card into view, and run the script again." >&2 ;;
    "CARD "*)
      echo "card $CARD is under card ${why#CARD }, and no point of it is on top. Drag the card out of its card list panel instead, or move ${why#CARD } first." >&2 ;;
    "OTHER aria-label=Close "*)
      echo "card $CARD is under the backdrop of the open ${why#OTHER aria-label=Close }, a hand or a card list panel. Close it with a DOM click on its backdrop, button[aria-label=\"${why#OTHER aria-label=}\"], and run the script again." >&2 ;;
    "OTHER data-testid=card-list-panel-"*)
      echo "card $CARD is under an open card list panel (${why#OTHER }). Close the panel, or drag a card that is in the panel, and run the script again." >&2 ;;
    *)
      echo "card $CARD is under another element (${why#OTHER }). Close what covers it and run the script again." >&2 ;;
  esac
  exit 1
fi

set -- $grab
ax=$1; ay=$2

# Read the badges before the mouse down. During a drag the open hand shows no
# count badge, so a count read then would make the hand look like it gained
# every card it still holds (#920).
before=$(snapshot)

ab mouse move "$ax" "$ay"
ab mouse down
ab mouse move "$((ax + 4))" "$((ay - 8))"

# The layout reflowed when the drag started, so read the target now, not before.
# Of a grid of points inside the target rect, take the one nearest its centre
# that is at least the cancel radius from the press point (trap 3). The same
# rule as `isReleaseInCancelRadius` in `releaseCancel.ts`. The target is the
# element with that data-zone, or else the element with that data-testid.
target=$(ev "(()=>{const e=document.querySelector('[data-zone=\"$ZONE\"]')||document.querySelector('[data-testid=\"$ZONE\"]');if(!e)return 'MISSING';const r=e.getBoundingClientRect();const cx=r.x+r.width/2,cy=r.y+r.height/2;const px=$ax,py=$ay;const dead=(x,y)=>Math.hypot(x-px,y-py)<24;let best=null,bd=Infinity;for(let fx=0.1;fx<=0.91;fx+=0.05){for(let fy=0.1;fy<=0.91;fy+=0.05){const x=Math.round(r.x+r.width*fx),y=Math.round(r.y+r.height*fy);if(dead(x,y))continue;const d=Math.hypot(x-cx,y-cy);if(d<bd){bd=d;best=x+' '+y}}}return best||'DEAD'})()")

if [ "$target" = "MISSING" ]; then
  ab mouse up
  echo "no element has data-zone=\"$ZONE\" or data-testid=\"$ZONE\"." >&2
  exit 1
fi

if [ "$target" = "DEAD" ]; then
  ab mouse up
  echo "every point of $ZONE is less than 24 px from the press point on $CARD, so any release there cancels the drag (#774). Drag the card out of a card list panel instead, or pick another card." >&2
  exit 1
fi

set -- $target
bx=$1; by=$2


ab mouse move "$bx" "$by"
# A second move at the same point. dnd-kit reads the last pointer event, and one
# move can arrive before the reflow settles.
ab mouse move "$bx" "$by"
ab mouse up

# A card in the core or the brig sits inside its own placed-card droppable (#810),
# `on-<its id>`, so the zone it is in is the next data-zone up.
# A card that shows as a sliver of the stack under a mission has no data-zone
# ancestor, so the stack's data-testid names the pile instead (#920).
# A card on top of the draw deck or the dilemma pile wraps the pile's two drop
# halves, so it has no data-zone ancestor either; the pile's data-testid names
# it, and the card is on top (#1025).
found=$(ev "(()=>{const e=document.querySelector('[data-card-id=\"$CARD\"]');if(!e)return 'MISSING';const pl=e.closest('[data-pile-count]');if(pl)return pl.getAttribute('data-testid')+'-top';const st=e.closest('[data-testid^=\"mission-under-\"][data-testid$=\"-stack\"]');if(st)return st.getAttribute('data-testid').replace(/-stack$/,'');let z=e.closest('[data-zone]');if(z&&z.getAttribute('data-zone')==='on-$CARD')z=z.parentElement.closest('[data-zone]');return z?z.getAttribute('data-zone'):'no zone'})()")

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
    beforeCounts["${p%=*}"]=$(( ${beforeCounts["${p%=*}"]:-0} + ${p##*=} ))
  done
fi
if [ -n "$after" ]; then
  IFS=';' read -ra parts <<< "$after"
  for p in "${parts[@]}"; do
    afterCounts["${p%=*}"]=$(( ${afterCounts["${p%=*}"]:-0} + ${p##*=} ))
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

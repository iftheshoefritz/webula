#!/usr/bin/env bash
# Records the short-lived states of the practice table, with agent-browser (#1036).
#
#   bash scripts/watch_landed.sh install   # start recording
#   bash scripts/practice_drag.sh card-5 core
#   bash scripts/watch_landed.sh print     # print the record, then clear it
#
# One agent-browser call takes longer than the landed cue, the bump of a count
# badge, or the drag overlay (about 450 ms, `LANDED_CUE_MS`), so a snapshot
# after the drag never shows them. `install` puts a MutationObserver on
# `document.body` that writes down, with the milliseconds since the install:
#
#   data-landed           an element gains `data-landed` (a zone's cue)
#   landed-ring           a `data-testid="landed-ring"` element is inserted
#   animate-landed-bump   a count gains the bump class and its animation runs
#   drag-overlay          the drag overlay's content (`drag-overlay-card`)
#                         appears or is removed
#
# Each line names the element by its own `data-zone`, `data-testid` or
# `aria-label`, or, when it has none, by the nearest ancestor that has one. A
# landed ring and a bump are named by the zone or badge they sit in.
#
# Under `agent-browser set media … reduced-motion` the bump does not play (it is
# `motion-safe:`), and the static ring shows instead, so the record lists
# `landed-ring` and no `animate-landed-bump`.
#
# `print` clears the record, so a second `print` right after shows it empty.
# The observer lives in the page until a navigation; after one, run `install`
# again. A second `install` replaces the first and starts an empty record.

set -euo pipefail

case "${1:-}" in
  install)
    js=$(cat <<'EOF'
(() => {
  const w = window;
  if (w.__landedWatch) w.__landedWatch.observer.disconnect();
  const start = performance.now();
  const record = [];
  const label = (el) => el.getAttribute('data-zone') || el.getAttribute('data-testid') || el.getAttribute('aria-label');
  // Names an element by itself or its nearest named ancestor; `skipSelf` for the ring, whose own
  // test id says only that it is a ring.
  const nameOf = (el, skipSelf) => {
    for (let e = skipSelf ? el.parentElement : el; e; e = e.parentElement) {
      const name = label(e);
      if (name) return name;
    }
    return '(unnamed ' + el.tagName.toLowerCase() + ')';
  };
  const add = (kind, el, note) => {
    const ms = Math.round(performance.now() - start);
    record.push('+' + ms + 'ms ' + kind + ' ' + (note || nameOf(el, kind !== 'data-landed')));
  };
  const isBump = (el) =>
    typeof el.className === 'string' && el.className.includes('animate-landed-bump') &&
    getComputedStyle(el).animationName !== 'none';
  const scanAdded = (root) => {
    const els = [root, ...root.querySelectorAll('*')];
    for (const el of els) {
      if (el.hasAttribute('data-landed')) add('data-landed', el);
      if (el.getAttribute('data-testid') === 'landed-ring') add('landed-ring', el);
      if (el.getAttribute('data-testid') === 'drag-overlay-card') add('drag-overlay', el, 'appeared');
      if (isBump(el)) add('animate-landed-bump', el);
    }
  };
  const scanRemoved = (root) => {
    if (root.getAttribute('data-testid') === 'drag-overlay-card' || root.querySelector('[data-testid="drag-overlay-card"]')) {
      add('drag-overlay', root, 'removed');
    }
  };
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        const el = m.target;
        if (m.attributeName === 'data-landed' && el.hasAttribute('data-landed') && m.oldValue === null) add('data-landed', el);
        if (m.attributeName === 'class' && isBump(el) && !(m.oldValue || '').includes('animate-landed-bump')) add('animate-landed-bump', el);
      } else {
        m.addedNodes.forEach((n) => n.nodeType === 1 && scanAdded(n));
        m.removedNodes.forEach((n) => n.nodeType === 1 && scanRemoved(n));
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['data-landed', 'class'],
  });
  w.__landedWatch = { observer, record };
  return 'watching';
})()
EOF
)
    npx agent-browser eval "$js" 2>&1 | tail -1 | tr -d '"'
    ;;
  print)
    js=$(cat <<'EOF'
(() => {
  const watch = window.__landedWatch;
  if (!watch) return 'not installed (run: bash scripts/watch_landed.sh install)';
  const lines = watch.record.splice(0);
  return lines.length ? lines.join('|') : '(empty)';
})()
EOF
)
    npx agent-browser eval "$js" 2>&1 | tail -1 | tr -d '"' | tr '|' '\n'
    ;;
  *)
    echo "usage: bash scripts/watch_landed.sh install|print" >&2
    exit 2
    ;;
esac

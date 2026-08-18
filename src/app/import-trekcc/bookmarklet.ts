// Source for the "Import from TrekCC" bookmarklet.
//
// Run on https://www.trekcc.org/decklists/?mode=list (while logged in), this script:
// 1. Finds every "Download Deck to Lackey" link on the page (plus each deck's trekCC
//    deckID, read from its paired "mode=viewdeck" link).
// 2. If there's exactly one deck, imports it directly. If there's more than one, shows
//    an overlay so the user can select several decks (with a "select all" convenience).
// 3. For a single selected deck, fetches its export (same-origin, using the browser's
//    existing trekcc.org session, so it isn't blocked by Cloudflare's bot-check) and
//    POSTs the text to Webula's /api/share endpoint, then opens the imported deck at
//    <BASE_URL>/decks?share=<id> in a new tab — unchanged from the single-deck flow.
// 4. For several selected decks, fetches each export (showing fetch progress in the new
//    tab), POSTs the whole batch as one JSON array to /api/share, then opens
//    <BASE_URL>/import-trekcc/bulk?share=<id> in a new tab, which signs the user in if
//    needed and saves every deck to their Google Drive, showing a final per-deck summary.
//
// BASE_URL points at whichever deployment generated this bookmarklet (production or a
// Vercel preview), so the bookmarklet keeps working when dragged from a preview URL
// instead of always hard-coding production.
//
// Kept as plain ES5-ish JS (no arrow functions/template literals) for maximum
// compatibility with whatever browser a bookmarklet gets run in.
const BASE_URL =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app');

const BOOKMARKLET_SOURCE = `
(function () {
  var API = '${BASE_URL}/api/share';
  var DECKS_URL = '${BASE_URL}/decks';
  var BULK_IMPORT_URL = '${BASE_URL}/import-trekcc/bulk';

  function findDecks() {
    var decks = [];
    var links = document.querySelectorAll('a[href*="mode=lackeyexport2020"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var container = link.closest('p') || link.parentElement;
      var viewLink = container ? container.querySelector('a[href*="mode=viewdeck"]') : null;
      var nameEl = viewLink ? viewLink.querySelector('b') : null;
      var deckIdMatch = viewLink ? viewLink.href.match(/[?&]deckID=(\\d+)/) : null;
      decks.push({
        name: nameEl ? nameEl.textContent.trim() : 'Untitled deck',
        href: link.href,
        trekccDeckId: deckIdMatch ? deckIdMatch[1] : null
      });
    }
    return decks;
  }

  function fetchDeckContent(deck) {
    return fetch(deck.href, { credentials: 'include' }).then(function (r) { return r.text(); });
  }

  function importDeck(deck, win) {
    fetchDeckContent(deck)
      .then(function (content) {
        return fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content, title: deck.name })
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.id) { throw new Error('Webula did not return a share id'); }
        if (win) { win.location.href = DECKS_URL + '?share=' + json.id; }
      })
      .catch(function (err) {
        if (win) {
          win.document.body.textContent = 'Failed to import deck into Webula: ' + err.message;
        } else {
          alert('Failed to import deck into Webula: ' + err.message);
        }
      });
  }

  function startImport(deck) {
    var win = window.open('', '_blank');
    if (win) { win.document.write('Importing your deck into Webula...'); }
    importDeck(deck, win);
  }

  function startBulkImport(selectedDecks) {
    var win = window.open('', '_blank');
    if (win) { win.document.write('Fetching 0 of ' + selectedDecks.length + ' decks from trekcc.org...'); }

    var completed = 0;
    var payload = new Array(selectedDecks.length);
    var fetches = selectedDecks.map(function (deck, i) {
      return fetchDeckContent(deck).then(function (content) {
        payload[i] = { trekccDeckId: deck.trekccDeckId, title: deck.name, content: content };
        completed++;
        if (win) {
          win.document.body.textContent =
            'Fetching ' + completed + ' of ' + selectedDecks.length + ' decks from trekcc.org...';
        }
      });
    });

    Promise.all(fetches)
      .then(function () {
        if (win) { win.document.body.textContent = 'Sending ' + payload.length + ' decks to Webula...'; }
        return fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: JSON.stringify(payload),
            title: 'Bulk import (' + payload.length + ' decks)'
          })
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (!json.id) { throw new Error('Webula did not return a share id'); }
        if (win) { win.location.href = BULK_IMPORT_URL + '?share=' + json.id; }
      })
      .catch(function (err) {
        if (win) {
          win.document.body.textContent = 'Failed to import decks into Webula: ' + err.message;
        } else {
          alert('Failed to import decks into Webula: ' + err.message);
        }
      });
  }

  var decks = findDecks();
  if (decks.length === 0) {
    alert('No "Download Deck to Lackey" links found on this page. Go to https://www.trekcc.org/decklists/?mode=list and try again.');
    return;
  }
  if (decks.length === 1) {
    startImport(decks[0]);
    return;
  }

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;color:#111;padding:20px;border-radius:8px;max-height:80%;max-width:90%;overflow:auto;';

  var title = document.createElement('div');
  title.textContent = 'Choose decks to import into Webula:';
  title.style.cssText = 'font-weight:bold;margin-bottom:10px;';
  box.appendChild(title);

  var selectAllLabel = document.createElement('label');
  selectAllLabel.style.cssText = 'display:block;margin-bottom:8px;cursor:pointer;';
  var selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllLabel.appendChild(selectAllCheckbox);
  selectAllLabel.appendChild(document.createTextNode(' Select all'));
  box.appendChild(selectAllLabel);

  var checkboxes = [];
  decks.forEach(function (deck) {
    var label = document.createElement('label');
    label.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0;padding:4px;cursor:pointer;';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + deck.name));
    box.appendChild(label);
    checkboxes.push(checkbox);
  });

  selectAllCheckbox.onchange = function () {
    for (var i = 0; i < checkboxes.length; i++) { checkboxes[i].checked = selectAllCheckbox.checked; }
  };

  var importBtn = document.createElement('button');
  importBtn.textContent = 'Import selected';
  importBtn.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px;cursor:pointer;font-weight:bold;';
  importBtn.onclick = function () {
    var selected = [];
    for (var i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) { selected.push(decks[i]); }
    }
    if (selected.length === 0) { alert('Select at least one deck to import.'); return; }
    document.body.removeChild(overlay);
    if (selected.length === 1) {
      startImport(selected[0]);
    } else {
      startBulkImport(selected);
    }
  };
  box.appendChild(importBtn);

  var cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'display:block;width:100%;margin-top:6px;padding:8px;cursor:pointer;';
  cancel.onclick = function () { document.body.removeChild(overlay); };
  box.appendChild(cancel);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
})();
`.trim();

// Percent-encoded so that browsers, which strip raw tab/newline characters from a
// javascript: URL before percent-decoding and evaluating it, don't mangle the script.
export const bookmarkletHref = `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE)}`;

export default BOOKMARKLET_SOURCE;

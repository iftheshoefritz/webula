// Source for the "Import from TrekCC" bookmarklet.
//
// Run on https://www.trekcc.org/decklists/?mode=list (while logged in), this script:
// 1. Finds every "Download Deck to Lackey" link on the page.
// 2. If there's more than one, shows a small overlay so the user can pick a deck.
// 3. Fetches the chosen export (same-origin, using the browser's existing trekcc.org
//    session, so it isn't blocked by Cloudflare's bot-check) and POSTs the text to
//    Webula's /api/share endpoint.
// 4. Opens the imported deck at https://webula.app/decks?share=<id> in a new tab.
//
// Kept as plain ES5-ish JS (no arrow functions/template literals) for maximum
// compatibility with whatever browser a bookmarklet gets run in.
const BOOKMARKLET_SOURCE = `
(function () {
  var API = 'https://webula.app/api/share';
  var DECKS_URL = 'https://webula.app/decks';

  function findDecks() {
    var decks = [];
    var links = document.querySelectorAll('a[href*="mode=lackeyexport2020"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var container = link.closest('p') || link.parentElement;
      var nameEl = container ? container.querySelector('a[href*="mode=viewdeck"] b') : null;
      decks.push({
        name: nameEl ? nameEl.textContent.trim() : 'Untitled deck',
        href: link.href
      });
    }
    return decks;
  }

  function importDeck(deck, win) {
    fetch(deck.href, { credentials: 'include' })
      .then(function (r) { return r.text(); })
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
  title.textContent = 'Choose a deck to import into Webula:';
  title.style.cssText = 'font-weight:bold;margin-bottom:10px;';
  box.appendChild(title);

  decks.forEach(function (deck) {
    var btn = document.createElement('button');
    btn.textContent = deck.name;
    btn.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0;padding:8px;cursor:pointer;';
    btn.onclick = function () {
      document.body.removeChild(overlay);
      startImport(deck);
    };
    box.appendChild(btn);
  });

  var cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px;cursor:pointer;';
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

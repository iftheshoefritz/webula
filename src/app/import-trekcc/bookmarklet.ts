// Source for the "Import from TrekCC" bookmarklet.
//
// Run on https://www.trekcc.org/decklists/?mode=list (while logged in), this script:
// 1. Finds every "Download Deck to Lackey" link on the page.
// 2. If there's more than one, shows a small overlay so the user can pick a deck.
// 3. Fetches the chosen export (same-origin, using the browser's existing trekcc.org
//    session, so it isn't blocked by Cloudflare's bot-check) and POSTs the text to
//    Webula's /api/share endpoint.
// 4. Opens the imported deck at <BASE_URL>/decks?share=<id> in a new tab.
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

  // iOS Shortcuts' "Run JavaScript on Web Page" action injects a global completion()
  // function and errors ("The script must call the function completion(result) when
  // finished") if the script's top-level execution ends without calling it. It's absent
  // when this script runs as an ordinary browser bookmarklet, so only call it if present.
  function finish() {
    if (typeof completion === 'function') { completion(); }
  }

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
    finish();
    return;
  }
  if (decks.length === 1) {
    startImport(decks[0]);
    finish();
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
  finish();
})();
`.trim();

// Percent-encoded so that browsers, which strip raw tab/newline characters from a
// javascript: URL before percent-decoding and evaluating it, don't mangle the script.
export const bookmarkletHref = `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE)}`;

// --- iOS Shortcuts ---
//
// Under iOS Shortcuts' "Run JavaScript on Web Page" action, calling the injected
// completion() tells Shortcuts the script is done and lets it tear down the web view
// immediately — cancelling any in-flight fetch() calls and discarding the DOM (including
// an overlay deck picker) before they get a chance to run. BOOKMARKLET_SOURCE above only
// calls completion() synchronously, so it can't reliably import a deck under Shortcuts.
//
// Instead, a Shortcut built from these two scripts calls completion() promptly from each:
// 1. iosListDecksSource only scrapes the page and calls completion() immediately with a
//    dictionary of { "deck name": "download href" }, for the Shortcut's native
//    "Choose from List" action to present.
// 2. iosImportDeckSource performs the fetch/POST chain and calls completion() only from
//    inside the resolved/rejected promise chain — never synchronously — with either the
//    imported deck's Webula URL or an "error:" prefixed message, for the Shortcut to open
//    or display natively. The chosen deck's name/href have to be pasted into this script's
//    placeholders using Shortcuts' variable-insertion UI, since there's no way to feed
//    values into a pasted "Run JavaScript on Web Page" script other than editing its text.
export const iosListDecksSource = `
(function () {
  var decks = {};
  var links = document.querySelectorAll('a[href*="mode=lackeyexport2020"]');
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var container = link.closest('p') || link.parentElement;
    var nameEl = container ? container.querySelector('a[href*="mode=viewdeck"] b') : null;
    var name = nameEl ? nameEl.textContent.trim() : 'Untitled deck';
    decks[name] = link.href;
  }
  completion(decks);
})();
`.trim();

export const iosImportDeckSource = `
(function () {
  var API = '${BASE_URL}/api/share';
  var DECKS_URL = '${BASE_URL}/decks';
  var name = 'PASTE DECK NAME HERE';
  var href = 'PASTE DECK LINK HERE';

  fetch(href, { credentials: 'include' })
    .then(function (r) { return r.text(); })
    .then(function (content) {
      return fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, title: name })
      });
    })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      if (!json.id) { throw new Error('Webula did not return a share id'); }
      completion(DECKS_URL + '?share=' + json.id);
    })
    .catch(function (err) {
      completion('error:' + err.message);
    });
})();
`.trim();

export default BOOKMARKLET_SOURCE;

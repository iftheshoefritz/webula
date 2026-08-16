// Script for the second "Run JavaScript on Web Page" action in the iOS Shortcut (see
// docs/ios-shortcut.md). It fetches the deck the user picked (same-origin, using the
// browser's existing trekcc.org session) and POSTs it to Webula's /api/share endpoint,
// then calls the injected completion() only once that chain resolves or rejects — never
// synchronously — with either the imported deck's Webula URL or an "error:"-prefixed
// message, for the Shortcut to open or display natively.
//
// This is exactly what to paste into that action in the Shortcuts app. After pasting,
// replace the 'PASTE DECK NAME HERE' / 'PASTE DECK LINK HERE' placeholders with Shortcuts
// variables, per docs/ios-shortcut.md — there's no way to feed values into a pasted "Run
// JavaScript on Web Page" script other than editing its text.
import BASE_URL from './baseUrl';

const iosImportDeckSource = `
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

export default iosImportDeckSource;

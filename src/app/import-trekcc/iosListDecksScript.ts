// Script for the first "Run JavaScript on Web Page" action in the iOS Shortcut (see
// docs/ios-shortcut.md). Run on https://www.trekcc.org/decklists/?mode=list, it scrapes
// every "Download Deck to Lackey" link on the page and calls the injected completion()
// immediately with a { "deck name": "download href" } dictionary, so the Shortcut's native
// "Choose from List" action can present the deck names to the user.
//
// This is exactly what to paste into that action in the Shortcuts app — no build step or
// substitution needed, since it doesn't depend on which Webula deployment built it.
const iosListDecksSource = `
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

export default iosListDecksSource;

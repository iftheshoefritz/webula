# iOS Shortcut: building and sharing a pre-built Shortcut

`/import-trekcc` doesn't walk end users through assembling an iOS Shortcut by hand. Instead,
the app author builds the Shortcut once (on a Mac or iPhone/iPad with the Shortcuts app) and
shares a single iCloud link that users tap to install.

This can't be automated in CI: the `.shortcut` file format is an undocumented
`WFWorkflow*` property list, and Apple's trusted signing only happens when a Shortcut is
built and shared from the real Shortcuts app. There's no CLI or API for it.

## Why two JavaScript actions

iOS Shortcuts' "Run JavaScript on Web Page" action tears down the web view — cancelling
any in-flight `fetch()` calls and discarding the DOM — the instant the script calls the
injected `completion()`, and Shortcuts requires `completion()` to be called before the
action can finish. That rules out a single script that both fetches the deck list and lets
the user pick one. The Shortcut therefore uses two separate "Run JavaScript on Web Page"
actions with native Shortcuts steps in between:

1. `iosListDecksSource` (exported from
   [`src/app/import-trekcc/bookmarklet.ts`](../src/app/import-trekcc/bookmarklet.ts)) scrapes
   the page and calls `completion()` immediately with a `{ "deck name": "download href" }`
   dictionary.
2. `iosImportDeckSource` (same file) performs the fetch/POST import chain and calls
   `completion()` only once that chain resolves or rejects, with either the imported
   deck's Webula URL or an `error:`-prefixed message.

## Building the Shortcut (author, one-time — repeat whenever the scripts change)

You need a Mac, iPhone, or iPad with the Shortcuts app.

1. Open [`src/app/import-trekcc/bookmarklet.ts`](../src/app/import-trekcc/bookmarklet.ts) in
   this repo and copy the current value of `iosListDecksSource`.
2. In the Shortcuts app, create a new Shortcut.
3. Add a "Run JavaScript on Web Page" action and paste in `iosListDecksSource`.
4. Add a "Get Dictionary Value" action set to "Get Keys", fed by the previous action's
   result.
5. Add a "Choose from List" action fed by those keys — this shows the deck names and lets
   the user pick one.
6. Add another "Get Dictionary Value" action: set the dictionary back to the result of the
   step 3 action, and set the key to the "Chosen Item" from step 5 — this looks up the
   download link for the picked deck.
7. Copy the current value of `iosImportDeckSource` from
   [`bookmarklet.ts`](../src/app/import-trekcc/bookmarklet.ts).
8. Add a second "Run JavaScript on Web Page" action and paste in `iosImportDeckSource`.
9. Edit the pasted script: replace the `'PASTE DECK NAME HERE'` placeholder with the
   "Chosen Item" variable from step 5 (via Shortcuts' variable-insertion menu), and replace
   `'PASTE DECK LINK HERE'` with the dictionary value from step 6.
10. Add an "If" action checking whether step 9's result starts with `error:`.
    - "Otherwise" branch: add "Open URLs" with that result, to open the imported deck in
      Webula.
    - "If" branch: add "Show Alert" with that result, so import failures are visible.
11. Name the Shortcut (e.g. "Import from TrekCC") and confirm it's enabled in the Safari
    share sheet (Shortcut Details → "Show in Share Sheet").
12. Test it: go to the
    [trekcc.org decks list](https://www.trekcc.org/decklists/?mode=list) while signed in,
    tap Share, and run the Shortcut.
13. Share it: in the Shortcuts app, select the Shortcut → Share icon → "Copy iCloud Link".
    This produces a stable `https://www.icloud.com/shortcuts/<id>` URL.

Whenever `iosListDecksSource` or `iosImportDeckSource` change in the codebase, repeat steps
1–12 to rebuild and re-test the Shortcut, then re-share from the same Shortcut in step 13
— the iCloud link stays the same across re-shares.

## Distributing the link (author)

Give the iCloud link from step 13 to users however makes sense (e.g. a message, a doc, or
by updating the note in `/import-trekcc` to link to it). This repo intentionally doesn't
hard-code a Shortcut link, since the Shortcut has to be built and re-shared manually by the
author outside of any code change here.

## Installing and running it (end user)

1. Open the iCloud Shortcut link on an iPhone or iPad.
2. Tap "Add Shortcut" on the review screen Shortcuts shows.
3. Go to the trekcc.org decks list while signed in.
4. Tap the Share button and choose the Shortcut (e.g. "Import from TrekCC").
5. Pick a deck from the list that appears.
6. Webula opens with the imported deck, or an alert shows if the import failed.

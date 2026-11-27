# Championship and Beginner decks

The rules of the converted decks that the code does not show at a glance. Read this file before you
change `championship-decks/`, `public/beginner-decks/`, their routes or the code that lists them. The
rules for adding a deck file are in `AGENTS.md`.

## Championship decks

`championship-decks/`, at the top of the repository, holds the converted decks of the 2026
championship events. `index.json` in that folder lists them, with the event, the player, the trekcc
deck ID and `authorizedUse`. A deck with `authorizedUse: false` is for the users with early access
only.

Two API routes serve the folder, and both apply `visibleChampionshipDecks`
(`src/lib/championshipDecks.ts`) to the caller's email from the NextAuth JWT:

- `/api/championship-decks` returns the rows the caller may see.
- `/api/championship-decks/<file>` returns the text of a deck the caller may see, and a 404 for
  anything else.

An early-access user gets every row; any other user, a signed-out user too, only the
`authorizedUse` rows. `outputFileTracingIncludes` in `next.config.mjs` puts the folder into the
routes' function bundle. The dilemma lab reads the folder at build time and lists only the
`authorizedUse` decks.

## Beginner decks

`public/beginner-decks/` holds the converted Beginner Decks of trekcc.org, by Lucas Thompson
(https://www.trekcc.org/articles/?viewArticle=2715). `index.json` in that folder lists them in the
order of the article, with the trekcc deck ID, the complexity level (1 to 5), the deck style and the
strategy article of each deck. The author gave Webula permission to show these decks to every user,
so every row has an `authorizedUse` of `true`.

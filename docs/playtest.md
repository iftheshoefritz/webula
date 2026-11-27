# Playtest cards

The rules of the playtest cards that the code does not show at a glance. Read this file before
you change the playtest store, its routes, the admin page at `/playtest/admin`, or how the client
loads and shows playtest cards. The repository rules (no playtest card is ever committed, the
server-only `PLAYTEST_ADMIN_EMAILS`) and the local setup are in `AGENTS.md`.

## The store

`src/lib/playtestStore.ts` keeps the playtest sets in testing in the same Upstash Redis database as
the share links, through `shareStoreCredentials`, with no TTL. Its client reads strings as they are
(`automaticDeserialization: false`). A playtest set is named by the `Set` column of its TSV: letters,
digits, `_`, `-` and `.`. Its key, `<key>` below, is the name lowercased, and so is the `set` of its
rows.

| Key | Value |
|---|---|
| `playtest:sets` | The sets in testing, a Redis set of their names as written |
| `playtest:set:<key>:version` | A number, bumped by every upload of the set |
| `playtest:set:<key>:uploadedAt` | An ISO time, written with the version |
| `playtest:set:<key>:cards` | The normalised TSV of `normalisePlaytestTsv` |
| `playtest:set:<key>:img:<ImageFile>` | One JPEG, base64 |
| `playtest:emails` | The playtesters of every set, a Redis set of lowercased emails |

A publish writes the set's cards and time and bumps its version before it lists the set in
`playtest:sets`, so a reader never sees a version whose cards or images are missing. A replace of
another set removes that set only after the new one is listed; a re-upload under the set's own name
bumps its version and deletes only the images the new TSV no longer names.

On first use the store moves the keys of the single-set store (`playtest:version`,
`playtest:uploadedAt`, `playtest:cards`, `playtest:img:<ImageFile>`) to the set named by the single
`Set` value of their TSV, version kept, and deletes them; with no `Set` value or several it moves
nothing, and the admin status's `legacyError` says so.

## Access

A playtester is an email in `playtest:emails` or an owner listed in `PLAYTEST_ADMIN_EMAILS`,
comma-separated. The email comes from the NextAuth JWT.

`GET /api/playtest/cards` answers `{ sets: [{ name, version, tsv }] }`, by name, `{ sets: [] }`
before the first upload, with `Cache-Control: private, no-cache`.
`GET /api/playtest/images/<key>/<ImageFile>.jpg` answers the JPEG of a set in testing with
`private, max-age=31536000, immutable`; the client adds `?v=<the set's version>`, which the route
ignores. Both answer 404 to anyone who is not a playtester, a signed-out caller too, and to an
unknown or malformed set or image, so they never reveal that playtest cards exist. A store failure
answers 502 `upstream_unreachable`. Every answer is `private` and carries `X-Robots-Tag: noindex`.

## The client

Each playtest row keeps its own `set`, and a playtest card is one whose `collectorsinfo` starts with
`pt-`. `cardImageUrl` reads the version of the row's set from the map `PlaytestCardsProvider` sets;
a row of a set not in testing, or the `set: 'playtest'` of a row saved by the single-set store, gets
`CardMissing.jpg`. An answer of the old `{ version, tsv }` shape is no cards. A playtester's Set
picker lists one option per set, by name, above the real sets. The search matches the `set` of a
playtest row on its whole value, so `set:a` finds no `testseta` card.

A deck loaded from Lackey text drops a line whose card the card data lacks, a playtest card for a
user who is not a playtester among them, and a dismissible warning says how many cards were not
found: in the deck builder after any load, and on the practice table after a Load deck from Drive or
a bot pile. The count is of copies, by pile header, so a load of some piles counts only theirs. A
`?share=` or `?driveFile=` deck waits until the playtest cards have settled, so a playtester's own
deck loads with its playtest cards.

A device that loaded a non-empty `sets` for a signed-in user keeps
`localStorage['playtest-device'] = '1'`, never cleared, a sign-out included. On that device, signed
out and online, a hint says "You may need to sign in to see playtest cards" beside a "Sign in with
Google" button, a plain sign-in with no Drive scope back to the same URL: on the practice table's
game menu splash and in every missing-cards warning. A device without the flag never sees it, and
reads no session for it.

## The admin page

The owners upload at `/playtest/admin`, a server page that reads the JWT: a signed-out visitor gets a
"Sign in with Google" button, a signed-in non-owner the 404 page, and an owner `PlaytestAdminClient`.

The browser reads `images.zip` with `src/lib/zipReader.ts` (stored and deflated entries, no zip64, no
encryption, no package) and builds the preview with `src/lib/playtestUpload.ts`: the set, the cards
by type, the errors, the warnings, the `ImageFile`s with no `<ImageFile>.jpg` in the zip and the
unused images. An error disables Publish, which sends the images of the set in batches under 3 MB of
JSON (a Vercel function takes at most 4.5 MB), then the TSV. The preview offers "New set" or
"Replace <set>" over the sets in testing, with the set of the TSV's own name pre-selected when it is
in testing, so a corrected re-upload is one click. The status lists every set in testing: name,
version, upload time, cards and images, and a Remove behind an inline confirm.

The owner-only routes under `/api/playtest/admin/` answer 404 to anyone else, with
`private, no-store`, and write nothing on an error:

- `GET status`: `{ sets: [{ name, version, uploadedAt, cards, images, cardNames, collectorsInfo }],
  legacyError, emails }`, counted from the stored TSVs.
- `POST images`: `{ set, images: [{ imageFile, base64 }] }`.
- `POST cards`: the TSV as text, with `?replace=<set>` to replace a set in testing and no `replace`
  for a new set.
- `DELETE sets`: `{ name }`, removes a set, its cards and its images.
- `GET`, `POST` and `DELETE emails`: `{ email }`.

`POST cards` runs `checkPlaytestUpload` again with the real names: the rows name exactly one valid
`Set`, not a real set's value nor `playtest`; a new set is not in testing yet; a replace names a set
in testing, and the new name is no other set in testing; and no card name or `CollectorsInfo` is one
of another set in testing (the replaced set excepted), so the deck keys stay `pt-<n>`. It then checks
the store holds every image under the set, and publishes.

In development, `/playtest/admin?fixture=1` renders the page with an in-memory store of two sets,
`TestSetA` and `TestSetB` (`src/lib/playtestAdminFixture.ts`); production ignores it.

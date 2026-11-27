# Share links

The rules of the share links that the code does not show at a glance. Read this file before you
change `/api/share` (`src/app/api/share/route.ts`), `src/lib/shareStore.ts` or
`src/lib/shareErrors.ts`. The env vars and the local setup are in `AGENTS.md`.

`/api/share` stores each share in Upstash Redis under `share:<id>` with a 30-day TTL.

- `POST { content, title }` answers `{ id }`, a random 10-character id.
- `GET ?id=` answers `{ content, title }`.

The content is capped at 256 KB, and a larger one answers 413 `bad_request`. A store failure answers
502 `upstream_unreachable`, an unknown or expired id 404 `not_found`.

The playtest store shares the same database (`docs/playtest.md`).

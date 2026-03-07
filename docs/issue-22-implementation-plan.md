# Implementation Plan: Issue #22 — Affiliation Filter for Missions, Ships, and Personnel

## Problem

When a user selects "Federation" from the affiliation filter, it generates the search query
`affiliation:Federation`. The filter in `useFilterData.js` checks `row['affiliation'].includes('federation')`.

This matches:
- ✅ Personnel/ships with affiliation `"federation"` (e.g., `"Robin Lefler"`)
- ✅ HQ missions like `"federation headquarters"` (contains the substring)
- ❌ Planet/space missions with abbreviated affiliation `"[fed]"` or `"[baj][fed][kli]"` etc.

## Root Cause

Card data stores the `affiliation` column differently by card type:
- **Personnel/Ships:** full names, e.g. `"federation"`, `"bajoran"`
- **HQ Missions:** names like `"federation headquarters"`, `"bajoran headquarters"`
- **Planet/Space Missions:** bracket abbreviations, e.g. `"[fed]"`, `"[baj][fed]"`, `"[car][dom][rom]"`

The filter does a simple `.includes()` match, so `"federation"` never matches `"[fed]"`.

## Solution

### Step 1 — Add affiliation abbreviation mapping (`src/lib/missionRequirements.js`)

Export a new constant that maps lowercase full affiliation names to their lowercase bracket
abbreviations. This co-locates affiliation knowledge with the existing `AFFILIATIONS` list.

```js
export const AFFILIATION_ABBREVIATIONS = {
  'bajoran':     '[baj]',
  'borg':        '[bor]',
  'cardassian':  '[car]',
  'dominion':    '[dom]',
  'federation':  '[fed]',
  'ferengi':     '[fer]',
  'hirogen':     '[hir]',
  'kazon':       '[kaz]',
  'klingon':     '[kli]',
  'non-aligned': '[na]',
  'romulan':     '[rom]',
  'starfleet':   '[sf]',
  'vidiian':     '[vid]',
};
```

### Step 2 — Update filter logic (`src/hooks/useFilterData.js`)

Import `AFFILIATION_ABBREVIATIONS` and modify the affiliation matching to also check the
abbreviated form. There are two places that need updating — the include filter and the exclude
filter — both currently use `row[column].includes(match)`.

**Include filter** (currently at line ~71):
```js
if (textColumns.includes(column)) {
  return parsedQuery[fullOrAbbreviatedColumn].every((match) => {
    if (column === 'affiliation') {
      const abbrev = AFFILIATION_ABBREVIATIONS[match];
      return row[column].includes(match) || (abbrev && row[column].includes(abbrev));
    }
    return row[column].includes(match);
  });
}
```

**Exclude filter** (currently at line ~57):
```js
if (textColumns.includes(column)) {
  return parsedQuery.exclude[fullOrAbbreviatedColumn].every((match) => {
    if (column === 'affiliation') {
      const abbrev = AFFILIATION_ABBREVIATIONS[match];
      return !row[column].includes(match) && !(abbrev && row[column].includes(abbrev));
    }
    return !row[column].includes(match);
  });
}
```

### Step 3 — Clean up the `AFFILIATIONS` list (`src/lib/missionRequirements.js`)

The existing abbreviated entries like `{ label: '[Baj] (personnel)', value: '[Baj]' }` are
now misleading: they work for missions too (they match the bracket abbreviation directly), and
the `(personnel)` label is wrong. Two options:

**Option A (preferred — simpler UX):** Remove the abbreviated entries entirely. After Step 2,
selecting "Bajoran" will find all personnel, ships, HQ missions, and planet/space missions with
that affiliation. The abbreviated entries add no additional value and their labels are confusing.

**Option B:** Rename their labels to clarify (e.g., `'[Baj] missions only'`) if there is a
legitimate use case for filtering missions that allow a specific affiliation without also pulling
in all Bajoran personnel. Only choose this if that use case is confirmed.

This plan uses **Option A**.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/missionRequirements.js` | Add `AFFILIATION_ABBREVIATIONS` export; remove abbreviated entries from `AFFILIATIONS` |
| `src/hooks/useFilterData.js` | Import mapping; add abbreviation check in include and exclude filters |

## Tests to Add

Add tests to `src/tests/components/SearchPills.test.tsx` or a new
`src/tests/hooks/useFilterData.test.js`:

1. Filtering by `affiliation:federation` returns Federation personnel ✓ (existing behavior)
2. Filtering by `affiliation:federation` returns planet/space missions with `[fed]` affiliation ← new
3. Filtering by `affiliation:federation` returns missions with mixed affiliations like `[baj][fed]` ← new
4. Filtering by `affiliation:bajoran` returns missions with `[baj]` affiliation ← new
5. Exclude filter `affiliation:-federation` still excludes Federation personnel and `[fed]` missions ← new

## Notes

- The `[SF]` abbreviation maps to "starfleet" which differs from the `[Fed]` pattern; the mapping handles this correctly since it is explicit.
- "Non-Aligned" maps to `[NA]` — the hyphen in `non-aligned` is already handled by lowercasing the query term and the mapping key.
- No changes are needed to `loadCards.ts` or the data file.
- No changes are needed to `SearchPills.tsx` — it already lowercases before building the query.

# Search results

The rules of the search results of `/` and `/decks` that the code does not show at a glance. Read
this file before you change the image/list view or the hover image.

Both pages show search results as the text list by default, on every screen. The deck builder's
image/list toggle saves the choice under `search-view-mode-v2` (`useSearchViewMode`), and `/` reads
the same key with no toggle of its own. The old `search-view-mode` key is not read.

`/` shows the hover image only with a fine pointer (`useFinePointer`): on a touch device a tap fires
a `mouseenter` with no `mouseleave`, so a preview would stay open.

With a fine pointer, the deck builder's hover image over a grid card of the image view is sized from
that card (`gridHoverImageWidth` in `SearchResults.tsx`): as large as the native image and the
window's height allow, and none at all when that is not 1.25 times the card (`previewEnlarges`), as
in the 1-column layout below `lg`. The grid card's own click and right-click still add and remove.
List view, and a touch device, keep the 230 px image.

A row of the list view shows the card's name with `CardName` (#1975): the unique dot, the printed
title, then the subtitle and any version suffix (`*AP`) in smaller, muted type, on the same line, so
the row height does not change and a long name is cut from its end. A row with no `originalTitle`
shows its plain name. The deck list and the practice table's decklist panel use the same component.

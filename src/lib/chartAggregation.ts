/**
 * Shared helpers for aligning N count-by-label series (e.g. the current
 * deck plus any number of comparison decks) onto a single shared, sorted
 * label list so they can be overlaid on the same bar chart axis.
 */

export function unionSortedLabels(
  seriesCounts: Record<string, number>[],
  sortFn: (a: string, b: string) => number
): string[] {
  const keys = new Set<string>();
  seriesCounts.forEach((counts) => {
    Object.keys(counts).forEach((key) => keys.add(key));
  });
  return Array.from(keys).sort(sortFn);
}

export function unionAlignValues(
  seriesCounts: Record<string, number>[],
  sortedLabels: string[]
): number[][] {
  return seriesCounts.map((counts) => sortedLabels.map((label) => counts[label] ?? 0));
}

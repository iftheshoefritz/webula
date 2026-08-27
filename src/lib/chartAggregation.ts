/**
 * Shared helpers for aligning two count-by-label series (e.g. the current
 * deck vs. a comparison deck) onto a single shared, sorted label list so
 * they can be overlaid on the same bar chart axis.
 */

export function unionSortedLabels(
  primaryCounts: Record<string, number>,
  compareCounts: Record<string, number> | undefined,
  sortFn: (a: string, b: string) => number
): string[] {
  const keys = new Set(Object.keys(primaryCounts));
  if (compareCounts) {
    Object.keys(compareCounts).forEach((key) => keys.add(key));
  }
  return Array.from(keys).sort(sortFn);
}

export function unionAlignValues(
  primaryCounts: Record<string, number>,
  compareCounts: Record<string, number> | undefined,
  sortedLabels: string[]
): { values: number[]; compareValues?: number[] } {
  const values = sortedLabels.map((label) => primaryCounts[label] ?? 0);
  if (!compareCounts) return { values };
  const compareValues = sortedLabels.map((label) => compareCounts[label] ?? 0);
  return { values, compareValues };
}

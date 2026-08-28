import React from 'react';

/** Renders a signed count delta (e.g. "(+2)"/"(-1)") relative to a comparison deck's count. */
export default function CompareDelta({ count, compareCount }: { count: number; compareCount?: number }) {
  if (compareCount === undefined) return null;
  const delta = count - compareCount;
  const sign = delta > 0 ? '+' : '';
  const colorClass = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-text-muted';
  return <span className={`ml-0.5 ${colorClass}`}>({sign}{delta})</span>;
}

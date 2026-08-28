import React from 'react';

interface PileAggregateProps {
  currentDeckRows: Array<Record<string, any>>;
  characteristicName: string;
  filterFunction: (row: Record<string, any>) => boolean;
  splitFunction: (value: any) => any[];
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>;
  compareDeckRows?: Array<Record<string, any>>;
  children: (entry: [string, any], compareCount: number | undefined, index: number) => React.ReactNode;
}

function aggregate(
  rows: Array<Record<string, any>>,
  characteristicName: string,
  filterFunction: (row: Record<string, any>) => boolean,
  splitFunction: (value: any) => any[],
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>
) {
  let characteristicCounts: Record<string, any> = {};
  rows
    .filter(filterFunction)
    .forEach((row) => {
      splitFunction(row[characteristicName])
        .forEach((item) => {
          characteristicCounts = assembleCounts(characteristicCounts, item, row.count);
        });
    });
  return characteristicCounts;
}

export default function PileAggregate({
  currentDeckRows,
  characteristicName,
  filterFunction,
  splitFunction,
  assembleCounts,
  compareDeckRows,
  children
}: PileAggregateProps) {
  const characteristicCounts = aggregate(currentDeckRows, characteristicName, filterFunction, splitFunction, assembleCounts);
  const compareCounts = compareDeckRows
    ? aggregate(compareDeckRows, characteristicName, filterFunction, splitFunction, assembleCounts)
    : undefined;

  const sortedCharacteristicCounts = Object.entries(characteristicCounts)
        .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-wrap">
      {sortedCharacteristicCounts.map((entry, index) => children(entry, compareCounts ? (compareCounts[entry[0]] ?? 0) : undefined, index))}
    </div>
  );
}

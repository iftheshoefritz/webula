import React from 'react';

interface PileAggregateProps {
  currentDeckRows: Array<Record<string, any>>;
  characteristicName: string;
  filterFunction: (row: Record<string, any>) => boolean;
  splitFunction: (value: any) => any[];
  assembleCounts: (counts: Record<string, any>, item: any, count: number) => Record<string, any>;
  children: (entry: [string, any], index: number) => React.ReactNode;
}

export default function PileAggregate({
  currentDeckRows,
  characteristicName,
  filterFunction,
  splitFunction,
  assembleCounts,
  children
}: PileAggregateProps) {
  let characteristicCounts: Record<string, any> = {};
  currentDeckRows
    .filter(filterFunction)
    .forEach((row) => {
      splitFunction(row[characteristicName])
        .forEach((item) => {
          characteristicCounts = assembleCounts(characteristicCounts, item, row.count);
        });
    });

  const sortedCharacteristicCounts = Object.entries(characteristicCounts)
        .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-wrap">
      {sortedCharacteristicCounts.map(children)}
    </div>
  );
}

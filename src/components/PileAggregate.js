export default function PileAggregate({ 
  currentDeckRows,
  characteristicName,
  filterFunction,
  splitFunction,
  assembleCounts,
  children
}) {
  let characteristicCounts = {};
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

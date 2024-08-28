import React, { useState } from 'react';
import DeckListItem from '../components/DeckListItem';
import { CardDef } from '../types';

type DeckListPileProps = {
  pileName: string;
  cardsForPile: Array<CardDef>;
  incrementIncluded: (row: CardDef) => void;
  decrementIncluded: (e: React.MouseEvent, row: CardDef) => void;
  sortBy: (a: any, b: any) => number;
  collapsed?: boolean;
}

const DeckListPile: React.FC<DeckListPileProps> = ({
  pileName,
  cardsForPile,
  incrementIncluded,
  decrementIncluded,
  sortBy
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const count = cardsForPile.reduce((sum, row) => sum + row.count, 0);
  const hoverMessage = isCollapsed ? "Click to expand" : "Click to collapse";

  return (
    <div>
      <div className="flex items-center justify-between py-2">
        <span
          className="font-semibold cursor-pointer text-xl"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={hoverMessage}
        >
          {pileName} ({count})
          <span className="font-bold">&nbsp;{ isCollapsed ? '>' : 'v'}</span>
        </span>
      </div>
      {!isCollapsed && (
        <ul className="divide-y divide-solid divide-gray-300 space-y-2">
          {cardsForPile
            .sort(sortBy)
            .map((row: CardDef) => (
              <DeckListItem
                key={row.collectorsinfo}
                collectorsinfo={row.collectorsinfo}
                decrementIncluded={(e: React.MouseEvent) => decrementIncluded(e, row)}
                incrementIncluded={() => incrementIncluded(row)}
                count={row.count}
                name={row.originalName}
                imagefile={row.imagefile}
                unique={row.unique === 'y'}
              />
            ))
          }
        </ul>
      )}
    </div>
  );
}

export default DeckListPile;

import React, { useState } from 'react';
import { FaChevronRight, FaChevronDown, FaPlus } from 'react-icons/fa';
import DeckListItem from '../components/DeckListItem';
import { CardDef } from '../types';

type DeckListPileProps = {
  pileName: string;
  cardsForPile: Array<CardDef>;
  incrementIncluded: (row: CardDef) => void;
  decrementIncluded: (e: React.MouseEvent, row: CardDef) => void;
  sortBy: (a: any, b: any) => number;
  collapsed?: boolean;
  onSearch?: () => void;
}

const DeckListPile: React.FC<DeckListPileProps> = ({
  pileName,
  cardsForPile,
  incrementIncluded,
  decrementIncluded,
  sortBy,
  collapsed = true,
  onSearch,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const count = cardsForPile.reduce((sum, row) => sum + row.count, 0);
  const hoverMessage = isCollapsed ? "Click to expand" : "Click to collapse";

  return (
    <div>
      <div className="flex items-center justify-between py-2">
        <span
          className="font-semibold cursor-pointer text-xl text-text-primary"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={hoverMessage}
        >
          {pileName} ({count})
          {isCollapsed ? <FaChevronRight className="inline ml-1 font-bold" /> : <FaChevronDown className="inline ml-1 font-bold" />}
        </span>
        {onSearch && (
          <button
            onClick={(e) => { e.stopPropagation(); onSearch(); }}
            className="btn-icon text-sm ml-2"
            title={`Search ${pileName}`}
          >
            <FaPlus />
          </button>
        )}
      </div>
      {!isCollapsed && (
        <ul className="divide-y divide-solid divide-white/[0.06] space-y-2">
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

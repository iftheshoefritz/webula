import React from 'react';
import { FaPlus } from 'react-icons/fa';
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
  onSearch,
}) => {
  return (
    <div className="relative">
      {onSearch && (
        <button
          onClick={onSearch}
          className="btn-icon text-sm absolute top-0 right-0"
          title={`Search ${pileName}`}
        >
          <FaPlus />
        </button>
      )}
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
    </div>
  );
}

export default DeckListPile;

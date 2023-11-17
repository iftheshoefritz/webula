import React, { Component } from 'react';
import DeckListItem from '../components/DeckListItem';

function DeckListPile({ pileName, cardsForPile, cardCounts, incrementIncluded, decrementIncluded, sortBy }) {
  const count = cardsForPile.reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <span className="font-semibold">{pileName} ({count})</span>
      <ul>
        {cardsForPile
         .sort(sortBy)
         .map((row) => (
           <DeckListItem
             key={row.collectorsinfo}
             collectorsinfo={row.collectorsinfo}
             decrementIncluded={(e) => decrementIncluded(e, row)}
             incrementIncluded={(e) => incrementIncluded(row)}
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

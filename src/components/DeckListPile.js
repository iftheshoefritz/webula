import React, { Component } from 'react';
import DeckListItem from '../components/DeckListItem';

class DeckListPile extends Component {
  render() {
    const { pileName, cardsForPile, cardCounts, incrementIncluded, decrementIncluded } = this.props;
    return (
      <div>
        <span className="font-semibold">{pileName}</span>
        <ul>
          {
            cardsForPile.map((row) => {
              return <DeckListItem
                key={row.collectorsinfo}
                collectorsinfo={row.collectorsinfo}
                decrementIncluded={(e) => decrementIncluded(e, row)}
                incrementIncluded={(e) => incrementIncluded(row)}
                count={row.count}
                name={row.name}
              />
            })
          }
        </ul>
      </div>
    )
  }
}

export default DeckListPile;

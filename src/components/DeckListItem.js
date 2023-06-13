import React, { Component } from 'react';

class DeckListItem extends Component {
  render() {
    const { incrementIncluded, decrementIncluded, collectorsinfo, count, name } = this.props;
    return (
      <li
        className="flex gap-x-2"
      >
        <div>{count}</div>
        <div>{collectorsinfo}</div>
        <div>{name}</div>
        <div
          className="font-semibold"
          onClick={incrementIncluded}
        >+</div>
        <div
          className="font-semibold"
          onClick={decrementIncluded}
        >-</div>
      </li>
    );
  }
}

export default DeckListItem;

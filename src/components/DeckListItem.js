import React, { Component } from 'react';
import Image from 'next/image';

class DeckListItem extends Component {
  state = {
    isHovering: false
  }

  handleHover = (event) => {
    const imageHeight = 403;
    const viewportHeight = window.innerHeight;
    const liRect = event.currentTarget.getBoundingClientRect();
    const liCenter = liRect.top + liRect.height / 2;

    if (liCenter < viewportHeight / 2) {
      // If the center of the li is in the top half of the viewport,
      // position the image below the li
      this.setState({
        isHovering: true,
        imageStyle: { top: '100%', bottom: 'auto' }
      });
    } else {
      // Otherwise, position the image above the li
      this.setState({
        isHovering: true,
        imageStyle: { bottom: '100%', top: 'auto' }
      });
    }
  }

  handleUnhover = () => {
    this.setState({ isHovering: false });
  }

  render() {
    const { incrementIncluded, decrementIncluded, collectorsinfo, count, name, imagefile} = this.props;
    return (
      <li
        className="flex gap-x-2 relative"
        key={collectorsinfo}
      >
        <div>{count}x</div>
        <div
          onMouseEnter={this.handleHover}
          onMouseLeave={this.handleUnhover}
        >{name}</div>
        <div>{collectorsinfo}</div>
        <div
          className="font-semibold"
          onClick={incrementIncluded}
        >+</div>
        <div
          className="font-semibold"
          onClick={decrementIncluded}
        >-</div>
        {this.state.isHovering && (
        <div
          className='absolute left-0 z-10'
          style={this.state.imageStyle}
        >
          <Image
            src={`/cardimages/${imagefile}.jpg`}
            width={288}
            height={400}
            placeholder='blur'
            blurDataURL='/cardimages/cardback.jpg'
            alt={name}
          />
         </div>
        )}
      </li>
    );
  }
}

export default DeckListItem;

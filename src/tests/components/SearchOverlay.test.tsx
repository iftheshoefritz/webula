import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchOverlay from '../../components/SearchOverlay';

const hqOptions = [
  { label: 'Bajor', value: 'bajor' },
  { label: 'Cardassia Prime', value: 'cardassia prime' },
];

function makeAnchorRef() {
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  return { current: btn } as React.RefObject<HTMLButtonElement>;
}

describe('SearchOverlay', () => {
  it('renders the label in the header', () => {
    render(
      <SearchOverlay
        label="diplomacy"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText('diplomacy')).toBeInTheDocument();
  });

  it('renders all hqOptions as menu items', () => {
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole('menuitem', { name: 'Bajor' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cardassia Prime' })).toBeInTheDocument();
  });

  it('renders "Any HQ" as the last menu item', () => {
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const items = screen.getAllByRole('menuitem');
    expect(items[items.length - 1]).toHaveTextContent('Any HQ');
  });

  it('always renders "Playable in this deck" as a menu item, even with no hqOptions', () => {
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={[]}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole('menuitem', { name: 'Playable in this deck' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Any HQ' })).toBeInTheDocument();
  });

  it('calls onSelect with "currentDeck" when "Playable in this deck" is clicked', () => {
    const onSelect = jest.fn();
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Playable in this deck' }));
    expect(onSelect).toHaveBeenCalledWith('currentDeck');
  });

  it('calls onSelect with null when "Any HQ" is clicked', () => {
    const onSelect = jest.fn();
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Any HQ' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect with hq value when an option is clicked', () => {
    const onSelect = jest.fn();
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bajor' }));
    expect(onSelect).toHaveBeenCalledWith('bajor');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('places the active selectedHq option first in the list', () => {
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="bajor"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Bajor');
  });

  it('calls onClose when clicking outside the overlay', () => {
    const onClose = jest.fn();
    render(
      <SearchOverlay
        label="engineering"
        hqOptions={hqOptions}
        selectedHq="all"
        anchorRef={makeAnchorRef()}
        onSelect={jest.fn()}
        onClose={onClose}
      />
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

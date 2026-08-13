import React from 'react';
import { render } from '@testing-library/react';
import BookmarkletLink from '../../components/BookmarkletLink';

describe('BookmarkletLink', () => {
  it('sets a javascript: href imperatively without React blocking it', () => {
    const href = "javascript:alert('hi')";
    const { getByText } = render(<BookmarkletLink href={href}>Import</BookmarkletLink>);
    const link = getByText('Import');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', href);
  });

  it('updates the href when the prop changes', () => {
    const { getByText, rerender } = render(
      <BookmarkletLink href="javascript:1">Import</BookmarkletLink>
    );
    rerender(<BookmarkletLink href="javascript:2">Import</BookmarkletLink>);
    expect(getByText('Import')).toHaveAttribute('href', 'javascript:2');
  });
});

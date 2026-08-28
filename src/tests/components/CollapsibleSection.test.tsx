import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';

jest.mock('react-icons/fa', () =>
  new Proxy({}, { get: (_target, prop) => () => <span data-testid={`icon-${String(prop)}`} /> })
);

import CollapsibleSection from '../../components/CollapsibleSection';

describe('CollapsibleSection', () => {
  describe('title', () => {
    it('renders the title text', () => {
      render(
        <CollapsibleSection title="Personnel skills" isCollapsed={false} onToggle={jest.fn()}>
          <p>content</p>
        </CollapsibleSection>
      );
      expect(screen.getByText('Personnel skills')).toBeInTheDocument();
    });
  });

  describe('expanded state', () => {
    it('renders children when not collapsed', () => {
      render(
        <CollapsibleSection title="Section" isCollapsed={false} onToggle={jest.fn()}>
          <p>visible content</p>
        </CollapsibleSection>
      );
      expect(screen.getByText('visible content')).toBeInTheDocument();
    });

    it('shows the chevron-down icon when expanded', () => {
      render(
        <CollapsibleSection title="Section" isCollapsed={false} onToggle={jest.fn()}>
          <p>content</p>
        </CollapsibleSection>
      );
      expect(screen.getByTestId('icon-FaChevronDown')).toBeInTheDocument();
      expect(screen.queryByTestId('icon-FaChevronRight')).not.toBeInTheDocument();
    });
  });

  describe('collapsed state', () => {
    it('does not render children when collapsed', () => {
      render(
        <CollapsibleSection title="Section" isCollapsed={true} onToggle={jest.fn()}>
          <p>hidden content</p>
        </CollapsibleSection>
      );
      expect(screen.queryByText('hidden content')).not.toBeInTheDocument();
    });

    it('shows the chevron-right icon when collapsed', () => {
      render(
        <CollapsibleSection title="Section" isCollapsed={true} onToggle={jest.fn()}>
          <p>content</p>
        </CollapsibleSection>
      );
      expect(screen.getByTestId('icon-FaChevronRight')).toBeInTheDocument();
      expect(screen.queryByTestId('icon-FaChevronDown')).not.toBeInTheDocument();
    });
  });

  describe('toggle button', () => {
    it('calls onToggle when the button is clicked', () => {
      const onToggle = jest.fn();
      render(
        <CollapsibleSection title="Section" isCollapsed={false} onToggle={onToggle}>
          <p>content</p>
        </CollapsibleSection>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});

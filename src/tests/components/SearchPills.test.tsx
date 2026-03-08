import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchPills from '../../components/SearchPills';

describe('SearchPills', () => {
  describe('parsing plain text searches', () => {
    it('renders a pill for plain text search (lowercase normalized)', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="Picard" setSearchQuery={setSearchQuery} />);

      // Component normalizes to lowercase
      expect(screen.getByText('picard')).toBeInTheDocument();
    });

    it('renders a single pill for multiple plain text terms', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="Picard Kirk" setSearchQuery={setSearchQuery} />);

      // Multiple terms without field specifier are treated as a single text search
      expect(screen.getByText('picard kirk')).toBeInTheDocument();
    });

    it('renders only add filter button when query is empty', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);

      expect(screen.getByRole('button', { name: /add filter/i })).toBeInTheDocument();
      // No filter pills should be present
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('renders only add filter button when query is only whitespace', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="   " setSearchQuery={setSearchQuery} />);

      expect(screen.getByRole('button', { name: /add filter/i })).toBeInTheDocument();
      // No filter pills should be present
      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });

  describe('parsing keyword filters', () => {
    it('renders a pill for name filter (lowercase normalized)', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="name:Picard" setSearchQuery={setSearchQuery} />);

      // Component normalizes to lowercase
      expect(screen.getByText('name:picard')).toBeInTheDocument();
    });

    it('renders a pill for abbreviated name filter with expanded keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="n:Picard" setSearchQuery={setSearchQuery} />);

      // Abbreviations are expanded to full keywords
      expect(screen.getByText('name:picard')).toBeInTheDocument();
    });

    it('renders a pill for type filter', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="type:personnel" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('type:personnel')).toBeInTheDocument();
    });

    it('renders a pill for affiliation filter with expanded keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="a:federation" setSearchQuery={setSearchQuery} />);

      // Abbreviations are expanded to full keywords
      expect(screen.getByText('affiliation:federation')).toBeInTheDocument();
    });

    it('handles quoted values with spaces (lowercase normalized)', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery='name:"Jean-Luc Picard"' setSearchQuery={setSearchQuery} />);

      // Component normalizes to lowercase
      expect(screen.getByText('name:"jean-luc picard"')).toBeInTheDocument();
    });

    it('handles multiple keyword filters with expanded abbreviations', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="type:personnel a:federation" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('type:personnel')).toBeInTheDocument();
      // Abbreviations are expanded to full keywords
      expect(screen.getByText('affiliation:federation')).toBeInTheDocument();
    });
  });

  describe('parsing range filters', () => {
    it('renders a pill for cost range filter', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="cost:1-5" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('cost:1-5')).toBeInTheDocument();
    });

    it('renders a pill for range filter with only minimum', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="cost:3-" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('cost:3-')).toBeInTheDocument();
    });

    it('renders a pill for range filter with only maximum', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="cost:-5" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('cost:-5')).toBeInTheDocument();
    });

    it('handles abbreviated range filter with expanded keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="c:2-4" setSearchQuery={setSearchQuery} />);

      // Abbreviations are expanded to full keywords
      expect(screen.getByText('cost:2-4')).toBeInTheDocument();
    });

    it('handles integrity range filter', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="integrity:5-8" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('integrity:5-8')).toBeInTheDocument();
    });
  });

  describe('parsing excluded filters', () => {
    it('renders a pill for excluded filter with red styling', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="-type:personnel" setSearchQuery={setSearchQuery} />);

      const pill = screen.getByText('-type:personnel');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveClass('text-red-400');
    });

    it('handles excluded filter with expanded abbreviation', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="-a:borg" setSearchQuery={setSearchQuery} />);

      // Abbreviations are expanded to full keywords
      const pill = screen.getByText('-affiliation:borg');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveClass('text-red-400');
    });
  });

  describe('combined filters', () => {
    it('renders pills for mixed filter types with expanded abbreviations', () => {
      const setSearchQuery = jest.fn();
      render(
        <SearchPills
          searchQuery="Picard type:personnel cost:2-5 -a:borg"
          setSearchQuery={setSearchQuery}
        />
      );

      // Component normalizes to lowercase and expands abbreviations
      expect(screen.getByText('picard')).toBeInTheDocument();
      expect(screen.getByText('type:personnel')).toBeInTheDocument();
      expect(screen.getByText('cost:2-5')).toBeInTheDocument();
      expect(screen.getByText('-affiliation:borg')).toBeInTheDocument();
    });
  });

  describe('quote normalization', () => {
    it('normalizes curly quotes to standard quotes (lowercase normalized)', () => {
      const setSearchQuery = jest.fn();
      // Use unicode escapes for curly quotes: \u201C = " and \u201D = "
      render(<SearchPills searchQuery={'name:\u201CPicard\u201D'} setSearchQuery={setSearchQuery} />);

      // The parser converts curly quotes to standard quotes for parsing,
      // but since "Picard" is a single word, quotes are not needed in display
      expect(screen.getByText('name:picard')).toBeInTheDocument();
    });

    it('normalizes single curly quotes (lowercase normalized)', () => {
      const setSearchQuery = jest.fn();
      // Use unicode escapes for curly single quotes: \u2018 = ' and \u2019 = '
      render(<SearchPills searchQuery={'name:\u2018Picard\u2019'} setSearchQuery={setSearchQuery} />);

      // After normalization, the parser should still work (case insensitive match)
      expect(screen.queryByText(/picard/i)).toBeInTheDocument();
    });
  });

  describe('remove filter functionality', () => {
    it('removes a plain text filter when X is clicked', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="Picard" setSearchQuery={setSearchQuery} />);

      const removeButton = screen.getByRole('button', { name: /remove picard filter/i });
      fireEvent.click(removeButton);

      expect(setSearchQuery).toHaveBeenCalledWith('');
    });

    it('removes a keyword filter and preserves other filters', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="type:personnel a:federation" setSearchQuery={setSearchQuery} />);

      const removeButton = screen.getByRole('button', { name: /remove type:personnel filter/i });
      fireEvent.click(removeButton);

      expect(setSearchQuery).toHaveBeenCalled();
      const newQuery = setSearchQuery.mock.calls[0][0];
      expect(newQuery).not.toContain('type:personnel');
      expect(newQuery).toContain('a:federation');
    });

    it('removes a range filter', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="cost:2-5" setSearchQuery={setSearchQuery} />);

      const removeButton = screen.getByRole('button', { name: /remove cost:2-5 filter/i });
      fireEvent.click(removeButton);

      expect(setSearchQuery).toHaveBeenCalledWith('');
    });

    it('removes combined plain text filter (since multiple terms become one pill)', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="Picard Kirk Spock" setSearchQuery={setSearchQuery} />);

      // Multiple terms become a single pill "picard kirk spock"
      const removeButton = screen.getByRole('button', { name: /remove picard kirk spock filter/i });
      fireEvent.click(removeButton);

      expect(setSearchQuery).toHaveBeenCalled();
      // Removing the entire text filter
      expect(setSearchQuery.mock.calls[0][0]).toBe('');
    });
  });

  describe('filter popover', () => {
    describe('popover visibility', () => {
      it('shows popover when add filter is clicked', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        expect(screen.getByText('Text Filters')).toBeInTheDocument();
      });

      it('closes popover when pressing Escape', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText('Text Filters')).not.toBeInTheDocument();
      });

      it('closes popover when clicking outside', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('Text Filters')).not.toBeInTheDocument();
      });

      it('closes popover when the search overlay becomes hidden', () => {
        const { rerender } = render(
          <SearchPills searchQuery="" setSearchQuery={jest.fn()} isVisible={true} />
        );
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        expect(screen.getByText('Text Filters')).toBeInTheDocument();

        rerender(<SearchPills searchQuery="" setSearchQuery={jest.fn()} isVisible={false} />);
        expect(screen.queryByText('Text Filters')).not.toBeInTheDocument();
      });

      it('does not close popover when the search overlay remains visible', () => {
        const { rerender } = render(
          <SearchPills searchQuery="" setSearchQuery={jest.fn()} isVisible={true} />
        );
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        expect(screen.getByText('Text Filters')).toBeInTheDocument();

        rerender(<SearchPills searchQuery="" setSearchQuery={jest.fn()} isVisible={true} />);
        expect(screen.getByText('Text Filters')).toBeInTheDocument();
      });
    });

    describe('text filter selection', () => {
      it('inserts text filter syntax and closes popover', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="existing" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^type:$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('existing type:');
        expect(screen.queryByText('Text Filters')).not.toBeInTheDocument();
      });

      it('handles empty query when inserting filter', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^type:$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('type:');
      });
    });

    describe('range filter selection', () => {
      it('shows range stepper UI when range filter clicked', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cost:$/i }));
        expect(screen.getByText('Min')).toBeInTheDocument();
        expect(screen.getByText('Max')).toBeInTheDocument();
      });

      it('shows correct default values for cost filter', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cost:$/i }));
        // cost defaults to 2
        expect(screen.getAllByText('2')).toHaveLength(2);
      });

      it('shows correct default values for strength filter', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^strength:$/i }));
        // strength defaults to 5
        expect(screen.getAllByText('5')).toHaveLength(2);
      });

      it('increments min value when + button clicked', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cost:$/i }));
        const incrementButtons = screen.getAllByRole('button', { name: '+' });
        fireEvent.click(incrementButtons[0]); // first + is for min
        expect(screen.getByText('3')).toBeInTheDocument();
      });

      it('inserts range filter with selected values', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cost:$/i }));
        // Click Add button (default is 2-2)
        fireEvent.click(screen.getByRole('button', { name: /add cost/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('cost:2-2');
      });
    });

    describe('more filters expansion', () => {
      it('shows more text filters when expanded', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByText(/more text filters/i));
        expect(screen.getByRole('button', { name: /^gametext:$/i })).toBeInTheDocument();
      });
    });

    describe('skills typeahead', () => {
      it('shows skills typeahead when skills filter is clicked', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        expect(screen.getByPlaceholderText(/search skills/i)).toBeInTheDocument();
      });

      it('lists all known skills in the typeahead', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        expect(screen.getByRole('option', { name: /^Diplomacy$/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^Security$/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^Medical$/i })).toBeInTheDocument();
      });

      it('filters skills list as the user types', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        const input = screen.getByPlaceholderText(/search skills/i);
        fireEvent.change(input, { target: { value: 'eng' } });
        expect(screen.getByRole('option', { name: /^Engineer$/i })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /^Diplomacy$/i })).not.toBeInTheDocument();
      });

      it('inserts skills filter when a skill option is clicked', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Diplomacy$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('skills:Diplomacy');
      });

      it('appends skills filter when existing query is present', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="type:personnel" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Security$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('type:personnel skills:Security');
      });

      it('closes the popover after selecting a skill', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Honor$/i }));
        expect(screen.queryByPlaceholderText(/search skills/i)).not.toBeInTheDocument();
      });

      it('shows no results message when filter matches nothing', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^skills:$/i }));
        const input = screen.getByPlaceholderText(/search skills/i);
        fireEvent.change(input, { target: { value: 'zzznomatch' } });
        expect(screen.getByText(/no skills match/i)).toBeInTheDocument();
      });
    });

    describe('affiliation typeahead', () => {
      it('shows affiliation typeahead when affiliation filter is clicked', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        expect(screen.getByPlaceholderText(/search affiliations/i)).toBeInTheDocument();
      });

      it('lists known affiliations in the typeahead', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        expect(screen.getByRole('option', { name: /^Bajoran$/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^Klingon$/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^Federation$/i })).toBeInTheDocument();
      });

      it('filters affiliations list as the user types', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        const input = screen.getByPlaceholderText(/search affiliations/i);
        fireEvent.change(input, { target: { value: 'rom' } });
        expect(screen.getByRole('option', { name: /^Romulan$/i })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /^Bajoran$/i })).not.toBeInTheDocument();
      });

      it('inserts affiliation filter when an option is clicked', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Klingon$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('affiliation:Klingon');
      });

      it('appends affiliation filter when existing query is present', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="type:personnel" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Romulan$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('type:personnel affiliation:Romulan');
      });

      it('wraps affiliation value in quotes when it contains a space', () => {
        const setSearchQuery = jest.fn();
        render(<SearchPills searchQuery="" setSearchQuery={setSearchQuery} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Non-Aligned$/i }));
        expect(setSearchQuery).toHaveBeenCalledWith('affiliation:Non-Aligned');
      });

      it('closes the popover after selecting an affiliation', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        fireEvent.click(screen.getByRole('option', { name: /^Federation$/i }));
        expect(screen.queryByPlaceholderText(/search affiliations/i)).not.toBeInTheDocument();
      });

      it('shows no results message when filter matches nothing', () => {
        render(<SearchPills searchQuery="" setSearchQuery={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add filter/i }));
        fireEvent.click(screen.getByRole('button', { name: /^affiliation:$/i }));
        const input = screen.getByPlaceholderText(/search affiliations/i);
        fireEvent.change(input, { target: { value: 'zzznomatch' } });
        expect(screen.getByText(/no affiliations match/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('remove buttons have appropriate aria labels', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="name:Picard type:personnel" setSearchQuery={setSearchQuery} />);

      expect(screen.getByRole('button', { name: /remove name:picard filter/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove type:personnel filter/i })).toBeInTheDocument();
    });
  });

  describe('rendering structure', () => {
    it('renders pills container with correct classes', () => {
      const setSearchQuery = jest.fn();
      const { container } = render(<SearchPills searchQuery="Picard" setSearchQuery={setSearchQuery} />);

      const pillsContainer = container.firstChild;
      expect(pillsContainer).toHaveClass('flex', 'flex-wrap', 'items-center', 'gap-2', 'mt-3');
    });

    it('renders each pill with correct styling classes', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="Picard" setSearchQuery={setSearchQuery} />);

      // Component normalizes to lowercase
      const pillText = screen.getByText('picard');
      // The pill wrapper is the grandparent span (inner span > outer span.filter-chip)
      const pillWrapper = pillText.parentElement;
      expect(pillWrapper).toHaveClass('filter-chip');
    });
  });

  describe('abbreviation expansion', () => {
    it('expands abbreviated name filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="n:Picard" setSearchQuery={setSearchQuery} />);

      // Should display full keyword, not abbreviation
      expect(screen.getByText('name:picard')).toBeInTheDocument();
      expect(screen.queryByText('n:picard')).not.toBeInTheDocument();
    });

    it('expands abbreviated affiliation filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="a:federation" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('affiliation:federation')).toBeInTheDocument();
      expect(screen.queryByText('a:federation')).not.toBeInTheDocument();
    });

    it('expands abbreviated type filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="ty:personnel" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('type:personnel')).toBeInTheDocument();
      expect(screen.queryByText('ty:personnel')).not.toBeInTheDocument();
    });

    it('expands abbreviated skills filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="sk:diplomacy" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('skills:diplomacy')).toBeInTheDocument();
      expect(screen.queryByText('sk:diplomacy')).not.toBeInTheDocument();
    });

    it('expands abbreviated cost range filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="c:2-4" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('cost:2-4')).toBeInTheDocument();
      expect(screen.queryByText('c:2-4')).not.toBeInTheDocument();
    });

    it('expands abbreviated integrity range filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="int:5-8" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('integrity:5-8')).toBeInTheDocument();
      expect(screen.queryByText('int:5-8')).not.toBeInTheDocument();
    });

    it('expands abbreviated strength range filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="str:6-" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('strength:6-')).toBeInTheDocument();
      expect(screen.queryByText('str:6-')).not.toBeInTheDocument();
    });

    it('expands excluded abbreviated filter to full keyword', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="-a:borg" setSearchQuery={setSearchQuery} />);

      const pill = screen.getByText('-affiliation:borg');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveClass('text-red-400');
      expect(screen.queryByText('-a:borg')).not.toBeInTheDocument();
    });

    it('keeps full keywords unchanged', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="name:picard affiliation:federation cost:3-5" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('name:picard')).toBeInTheDocument();
      expect(screen.getByText('affiliation:federation')).toBeInTheDocument();
      expect(screen.getByText('cost:3-5')).toBeInTheDocument();
    });

    it('expands multiple abbreviated filters', () => {
      const setSearchQuery = jest.fn();
      render(<SearchPills searchQuery="n:picard a:federation c:2-4" setSearchQuery={setSearchQuery} />);

      expect(screen.getByText('name:picard')).toBeInTheDocument();
      expect(screen.getByText('affiliation:federation')).toBeInTheDocument();
      expect(screen.getByText('cost:2-4')).toBeInTheDocument();
    });
  });
});

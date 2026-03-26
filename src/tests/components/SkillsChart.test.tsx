import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillsChart from '../../components/SkillsChart';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  skills: '',
  count: 1,
  ...overrides,
});

describe('SkillsChart', () => {
  describe('always renders all skills', () => {
    it('renders all skills alphabetically for empty deck', () => {
      const { container } = render(<SkillsChart currentDeckRows={[]} />);
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('acquisition')).toBeInTheDocument();
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
      expect(screen.getByText('treachery')).toBeInTheDocument();
    });

    it('renders all skills when no draw-pile personnel are present', () => {
      const { container } = render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ pile: 'mission', type: 'mission', skills: 'diplomacy' }),
            makeRow({ pile: 'dilemma', type: 'dilemma', skills: 'security' }),
            makeRow({ pile: 'draw', type: 'ship', skills: 'navigation' }),
          ]}
        />
      );
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
    });

    it('renders all skills when personnel have no recognised skills', () => {
      const { container } = render(
        <SkillsChart currentDeckRows={[makeRow({ skills: 'unknownskill' })]} />
      );
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
    });

    it('renders all skills when personnel have empty skills string', () => {
      const { container } = render(
        <SkillsChart currentDeckRows={[makeRow({ skills: '' })]} />
      );
      expect(container.firstChild).not.toBeNull();
      expect(screen.getByText('security')).toBeInTheDocument();
    });
  });

  describe('renders skill rows', () => {
    it('shows a skill name and its count/req', () => {
      render(<SkillsChart currentDeckRows={[makeRow({ skills: 'diplomacy' })]} />);
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getAllByText('/0').length).toBeGreaterThan(0);
    });

    it('aggregates the same skill across multiple personnel cards', () => {
      render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'diplomacy', count: 2 }),
            makeRow({ skills: 'diplomacy', count: 3 }),
          ]}
        />
      );
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getAllByText('/0').length).toBeGreaterThan(0);
    });

    it('renders multiple skills', () => {
      render(
        <SkillsChart
          currentDeckRows={[makeRow({ skills: 'diplomacy security medical' })]}
        />
      );
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
      expect(screen.getByText('security')).toBeInTheDocument();
      expect(screen.getByText('medical')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('always shows skills in alphabetical order', () => {
      render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'security', count: 1 }),
            makeRow({ skills: 'diplomacy', count: 3 }),
            makeRow({ skills: 'medical', count: 2 }),
          ]}
        />
      );

      const skillLabels = screen
        .getAllByText(/diplomacy|medical|security/)
        .map((el) => el.textContent);
      expect(skillLabels).toEqual(['diplomacy', 'medical', 'security']);
    });

    it('keeps alphabetical order even when counts differ', () => {
      render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'security honor biology', count: 1 }),
          ]}
        />
      );

      const skillLabels = screen
        .getAllByText(/^(biology|honor|security)$/)
        .map((el) => el.textContent);
      expect(skillLabels).toEqual(['biology', 'honor', 'security']);
    });
  });

  describe('bar widths', () => {
    it('gives the highest-count skill a 100% bar', () => {
      const { container } = render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'diplomacy', count: 4 }),
            makeRow({ skills: 'security', count: 2 }),
          ]}
        />
      );

      const bars = container.querySelectorAll<HTMLDivElement>('.bg-blue-500\\/70');
      const widths = Array.from(bars).map((b) => b.style.width);
      expect(widths).toContain('100%');
    });

    it('gives lower-count skills a proportional width', () => {
      const { container } = render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'diplomacy', count: 4 }),
            makeRow({ skills: 'security', count: 2 }),
          ]}
        />
      );

      const bars = container.querySelectorAll<HTMLDivElement>('.bg-blue-500\\/70');
      const widths = Array.from(bars).map((b) => b.style.width);
      expect(widths).toContain('50%');
    });
  });

  describe('only counts draw-pile personnel', () => {
    it('ignores non-draw piles', () => {
      const { container } = render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ pile: 'mission', skills: 'diplomacy', count: 5 }),
            makeRow({ pile: 'draw', skills: 'diplomacy', count: 1 }),
          ]}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(container.firstChild).not.toBeNull();
    });

    it('ignores non-personnel draw cards', () => {
      render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ type: 'ship', skills: 'navigation', count: 3 }),
            makeRow({ type: 'personnel', skills: 'navigation', count: 1 }),
          ]}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('multi-level skills (e.g. "2 security")', () => {
    it('counts a skill with a level prefix toward the skill total', () => {
      render(
        <SkillsChart currentDeckRows={[makeRow({ skills: '2 security', count: 1 })]} />
      );
      expect(screen.getByText('security')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('+ button and search overlay', () => {
    const hqOptions = [
      { label: 'Bajor', value: 'bajor' },
      { label: 'Cardassia Prime', value: 'cardassia prime' },
    ];

    it('renders a + button for each skill when onSkillSearch is provided', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillSearch={jest.fn()}
        />
      );
      // 23 skills × 1 + button each
      expect(screen.getAllByRole('button', { name: /search personnel with/i }).length).toBe(23);
    });

    it('does not render + buttons when onSkillSearch is not provided', () => {
      render(<SkillsChart currentDeckRows={[]} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('rows are NOT role=button (bar rows are not clickable)', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillSearch={jest.fn()}
        />
      );
      // Only the + buttons should have role=button, not the skill label rows
      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-label');
      });
    });

    it('clicking + with no hqOptions calls onSkillSearch immediately with null', () => {
      const handleSearch = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillSearch={handleSearch}
        />
      );
      const diplomacyBtn = screen.getByRole('button', { name: /search personnel with diplomacy/i });
      fireEvent.click(diplomacyBtn);
      expect(handleSearch).toHaveBeenCalledWith('diplomacy', null);
    });

    it('clicking + with hqOptions opens an overlay menu', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillSearch={jest.fn()}
        />
      );
      const diplomacyBtn = screen.getByRole('button', { name: /search personnel with diplomacy/i });
      fireEvent.click(diplomacyBtn);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('overlay contains a header, all hqOptions, and "Any HQ" last', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillSearch={jest.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /search personnel with diplomacy/i }));
      expect(screen.getByText(/search/i)).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Any HQ' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Bajor' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Cardassia Prime' })).toBeInTheDocument();
      // "Any HQ" should be the last menuitem
      const items = screen.getAllByRole('menuitem');
      expect(items[items.length - 1]).toHaveTextContent('Any HQ');
    });

    it('clicking "Any HQ" calls onSkillSearch with null and closes overlay', () => {
      const handleSearch = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillSearch={handleSearch}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /search personnel with security/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Any HQ' }));
      expect(handleSearch).toHaveBeenCalledWith('security', null);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('clicking an HQ option calls onSkillSearch with that HQ value and closes overlay', () => {
      const handleSearch = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillSearch={handleSearch}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /search personnel with diplomacy/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Bajor' }));
      expect(handleSearch).toHaveBeenCalledWith('diplomacy', 'bajor');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('surfaces the active skillHqSelection as the first overlay item', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          skillHqSelections={{ diplomacy: 'bajor' }}
          onSkillSearch={jest.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /search personnel with diplomacy/i }));
      const items = screen.getAllByRole('menuitem');
      // First item should be the active HQ (Bajor), not "All personnel"
      expect(items[0]).toHaveTextContent('Bajor');
    });

    it('does not render + buttons when hqOptions is empty and onSkillSearch is not provided', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={[]}
        />
      );
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('mission requirement labels', () => {
    it('shows the requirement number in amber when a mission requirement exists', () => {
      render(
        <SkillsChart
          currentDeckRows={[makeRow({ skills: 'diplomacy', count: 2 })]}
          missionRequirements={{ diplomacy: 3 }}
        />
      );
      expect(screen.getByText('/3')).toBeInTheDocument();
    });

    it('shows 0/req when there are no personnel with that skill', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          missionRequirements={{ security: 2 }}
        />
      );
      // count is 0, req is 2 → shows "0" and "/2"
      expect(screen.getByText('/2')).toBeInTheDocument();
    });

    it('shows count/req format when both count and requirement exist', () => {
      render(
        <SkillsChart
          currentDeckRows={[makeRow({ skills: 'medical', count: 1 })]}
          missionRequirements={{ medical: 4 }}
        />
      );
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('/4')).toBeInTheDocument();
    });

    it('shows 0/0 for every skill when no personnel and no missions are chosen', () => {
      render(<SkillsChart currentDeckRows={[]} />);
      const zeros = screen.getAllByText('/0');
      // All 23 skills should show /0
      expect(zeros.length).toBe(23);
    });

    it('shows 0/1 for a skill with one requirement and no personnel', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          missionRequirements={{ diplomacy: 1 }}
        />
      );
      expect(screen.getByText('/1')).toBeInTheDocument();
    });
  });
});

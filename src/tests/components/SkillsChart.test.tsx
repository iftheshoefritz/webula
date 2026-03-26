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

  describe('onSkillClick', () => {
    it('calls onSkillClick with the skill name when a row is clicked', () => {
      const handleClick = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[makeRow({ skills: 'diplomacy', count: 1 })]}
          onSkillClick={handleClick}
        />
      );
      const diplomacyRow = screen.getByRole('button', { name: /diplomacy/i });
      diplomacyRow.click();
      expect(handleClick).toHaveBeenCalledWith('diplomacy');
    });

    it('calls onSkillClick when Enter is pressed on a row', () => {
      const handleClick = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillClick={handleClick}
        />
      );
      const securityRow = screen.getByRole('button', { name: /security/i });
      securityRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(handleClick).toHaveBeenCalledWith('security');
    });

    it('calls onSkillClick when Space is pressed on a row', () => {
      const handleClick = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillClick={handleClick}
        />
      );
      const medicalRow = screen.getByRole('button', { name: /medical/i });
      medicalRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(handleClick).toHaveBeenCalledWith('medical');
    });

    it('rows have role=button when onSkillClick is provided', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          onSkillClick={jest.fn()}
        />
      );
      // All 23 skills should be buttons
      expect(screen.getAllByRole('button').length).toBe(23);
    });

    it('rows do NOT have role=button when onSkillClick is not provided', () => {
      render(<SkillsChart currentDeckRows={[]} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('HQ dropdown per skill row', () => {
    const hqOptions = [
      { label: 'Bajor', value: 'bajor' },
      { label: 'Cardassia Prime', value: 'cardassia prime' },
    ];

    it('renders a dropdown for each skill when hqOptions and onSkillHqChange are provided', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillHqChange={jest.fn()}
        />
      );
      // 23 skills × 1 dropdown each
      expect(screen.getAllByRole('combobox').length).toBe(23);
    });

    it('each dropdown contains "All" and the provided HQ options', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillHqChange={jest.fn()}
        />
      );
      const firstDropdown = screen.getAllByRole('combobox')[0];
      expect(firstDropdown).toHaveDisplayValue('All');
      const options = Array.from(firstDropdown.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
      expect(options).toContain('all');
      expect(options).toContain('bajor');
      expect(options).toContain('cardassia prime');
    });

    it('dropdown shows the selected value from skillHqSelections', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          skillHqSelections={{ diplomacy: 'bajor' }}
          onSkillHqChange={jest.fn()}
        />
      );
      const diplomacyDropdown = screen.getByRole('combobox', { name: /hq filter for diplomacy/i });
      expect(diplomacyDropdown).toHaveValue('bajor');
    });

    it('dropdown defaults to "all" when skill has no entry in skillHqSelections', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          skillHqSelections={{}}
          onSkillHqChange={jest.fn()}
        />
      );
      const dropdown = screen.getByRole('combobox', { name: /hq filter for security/i });
      expect(dropdown).toHaveValue('all');
    });

    it('calls onSkillHqChange with the skill and new value when dropdown changes', () => {
      const handleChange = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillHqChange={handleChange}
        />
      );
      const dropdown = screen.getByRole('combobox', { name: /hq filter for diplomacy/i });
      fireEvent.change(dropdown, { target: { value: 'bajor' } });
      expect(handleChange).toHaveBeenCalledWith('diplomacy', 'bajor');
    });

    it('clicking the dropdown does NOT trigger onSkillClick', () => {
      const handleClick = jest.fn();
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={hqOptions}
          onSkillHqChange={jest.fn()}
          onSkillClick={handleClick}
        />
      );
      const dropdown = screen.getByRole('combobox', { name: /hq filter for diplomacy/i });
      fireEvent.click(dropdown);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('does not render dropdowns when hqOptions is empty', () => {
      render(
        <SkillsChart
          currentDeckRows={[]}
          hqOptions={[]}
          onSkillHqChange={jest.fn()}
        />
      );
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    });

    it('does not render dropdowns when hqOptions is not provided', () => {
      render(<SkillsChart currentDeckRows={[]} />);
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);
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

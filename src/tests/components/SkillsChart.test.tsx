import React from 'react';
import { render, screen } from '@testing-library/react';
import SkillsChart from '../../components/SkillsChart';

const makeRow = (overrides = {}) => ({
  pile: 'draw',
  type: 'personnel',
  skills: '',
  count: 1,
  ...overrides,
});

describe('SkillsChart', () => {
  describe('renders nothing when there are no skills', () => {
    it('returns null for empty deck', () => {
      const { container } = render(<SkillsChart currentDeckRows={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when no draw-pile personnel are present', () => {
      const { container } = render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ pile: 'mission', type: 'mission', skills: 'diplomacy' }),
            makeRow({ pile: 'dilemma', type: 'dilemma', skills: 'security' }),
            makeRow({ pile: 'draw', type: 'ship', skills: 'navigation' }),
          ]}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when personnel have no recognised skills', () => {
      const { container } = render(
        <SkillsChart currentDeckRows={[makeRow({ skills: 'unknownskill' })]} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('returns null when personnel have empty skills string', () => {
      const { container } = render(
        <SkillsChart currentDeckRows={[makeRow({ skills: '' })]} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('renders skill rows', () => {
    it('shows a skill name and its count', () => {
      render(<SkillsChart currentDeckRows={[makeRow({ skills: 'diplomacy' })]} />);
      expect(screen.getByText('diplomacy')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
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
    it('sorts skills by count descending', () => {
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

    it('breaks count ties alphabetically', () => {
      render(
        <SkillsChart
          currentDeckRows={[
            makeRow({ skills: 'security honor biology', count: 1 }),
          ]}
        />
      );

      const skillLabels = screen
        .getAllByText(/biology|honor|security/)
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
      expect(bars[0].style.width).toBe('100%');
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
      expect(bars[1].style.width).toBe('50%');
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
});

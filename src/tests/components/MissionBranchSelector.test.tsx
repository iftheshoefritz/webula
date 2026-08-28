import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import MissionBranchSelector from '../../components/MissionBranchSelector';
import type { ParsedMissionRequirements } from '../../lib/missionRequirements';

const noOrBranches: ParsedMissionRequirements = {
  mandatory: { physics: 1, treachery: 1 },
  orBranches: undefined,
};

const withOrBranches: ParsedMissionRequirements = {
  mandatory: { physics: 1 },
  orBranches: [{ diplomacy: 1 }, { treachery: 1 }],
};

const multiSkillBranches: ParsedMissionRequirements = {
  mandatory: {},
  orBranches: [{ diplomacy: 1, treachery: 1 }, { physics: 1 }],
};

describe('MissionBranchSelector', () => {
  describe('no OR branches (linear mission)', () => {
    it('renders a single skills pill showing mandatory skills', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={noOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Physics, Treachery' })).toBeInTheDocument();
    });

    it('renders a "None" button', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={noOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
    });

    it('does not render an "All" button', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={noOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    });

    it('renders exactly two buttons', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={noOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });
  });

  describe('OR branches', () => {
    it('renders an "All" button', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    });

    it('renders one button per branch combining mandatory skills', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Physics, Diplomacy' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Physics, Treachery' })).toBeInTheDocument();
    });

    it('renders a "None" button', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
    });
  });

  describe('branch labels', () => {
    it('capitalizes each skill name', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={{ mandatory: {}, orBranches: [{ physics: 1 }] }}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Physics' })).toBeInTheDocument();
    });

    it('joins multiple skills with ", "', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={multiSkillBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Diplomacy, Treachery' })).toBeInTheDocument();
    });
  });

  describe('data-testid', () => {
    it('sets data-testid to branch-selector-{missionName}', () => {
      const { container } = render(
        <MissionBranchSelector
          missionName="Mission Alpha"
          parsed={withOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(container.querySelector('[data-testid="branch-selector-Mission Alpha"]')).toBeInTheDocument();
    });
  });

  describe('aria-pressed state', () => {
    it('"All" is aria-pressed="true" when selected is null', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('"All" is aria-pressed="false" when a branch is selected', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={0}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('branch button is aria-pressed="true" when its index is selected', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={0}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Physics, Diplomacy' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Physics, Treachery' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('"None" is aria-pressed="true" when selected is -1', () => {
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={-1}
          onChange={jest.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('onChange callbacks', () => {
    it('calls onChange(null) when "All" is clicked', () => {
      const onChange = jest.fn();
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={0}
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('calls onChange(index) when a branch button is clicked', () => {
      const onChange = jest.fn();
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Physics, Treachery' }));
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('calls onChange(-1) when "None" is clicked', () => {
      const onChange = jest.fn();
      render(
        <MissionBranchSelector
          missionName="Test Mission"
          parsed={withOrBranches}
          selected={null}
          onChange={onChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'None' }));
      expect(onChange).toHaveBeenCalledWith(-1);
    });
  });
});

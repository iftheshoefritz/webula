import { costModelCoverage, costModelCoverageText } from '../../lib/costModels/coverage';

// The coverage of a deck by the cost registry (#1697), on invented cards.

describe('costModelCoverage', () => {
  const registry = new Map([['Modelled One', {}], ['Modelled Two', {}]]);

  it('counts each cost-affecting title once, the modelled and the missing apart', () => {
    const coverage = costModelCoverage(
      [
        { name: 'Zeta Pilot', type: 'personnel', gametext: 'She is cost -1.' },
        { name: 'Zeta Pilot', type: 'personnel', gametext: 'She is cost -1.' },
        { name: 'Zeta Pilot *VP', type: 'personnel', gametext: 'She is cost -1.' },
        { name: 'Alpha Event', type: 'event', gametext: 'You may spend an additional counter.' },
        // A modelled title counts even when its text matches no pattern.
        { name: 'Modelled One', type: 'personnel', gametext: 'Order - Draw a card.' },
        { name: 'Modelled Two', type: 'event', gametext: 'Each personnel is cost -2.' },
        { name: 'Plain', type: 'personnel', gametext: 'Order - Draw a card.' },
        { name: 'Dilemma Talk', type: 'event', gametext: 'When you reveal a dilemma, it is cost -1.' },
        { name: 'A Dilemma', type: 'dilemma', gametext: 'Its cost -1.' },
      ],
      registry
    );
    expect(coverage).toEqual({ modelled: ['Modelled One', 'Modelled Two'], missing: ['Alpha Event', 'Zeta Pilot'] });
    expect(costModelCoverageText(coverage)).toBe('Cost models: 2 of 4 titles');
  });

  it('reads "all" when every title has a model, and nothing for a deck with none', () => {
    const all = costModelCoverage([{ name: 'Modelled One', type: 'personnel', gametext: '' }], registry);
    expect(all.missing).toEqual([]);
    expect(costModelCoverageText(all)).toBe('Cost models: all 1 title');
    const none = costModelCoverage([{ name: 'Plain', type: 'personnel', gametext: 'Draw a card.' }], registry);
    expect(costModelCoverageText(none)).toBeNull();
  });
});

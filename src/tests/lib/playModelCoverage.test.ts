import { hasPlayEffect, playClauseOf, playModelCoverage } from '../../lib/playModels/coverage';

// The detection of the "when you play" effects of personnel and ships (#1801), on invented cards.

describe('hasPlayEffect', () => {
  it.each([
    'When you play this personnel, if you command a Pilot, she is cost -2.',
    'When you play this personnel, the next Pilot you play this turn is cost -1.',
    'When you play this ship, you may discard the top two cards of your deck to make this ship cost -1.',
    'When you play this personnel, reveal an opponent\'s hand. For each event revealed, this personnel is cost -1.',
    'When you play this ship, you may spend 3 additional counters this turn.',
    'When you play this personnel, your opponent may draw up to two cards. This personnel is cost -1 for each card drawn this way.',
    'When you play this personnel, you may spend an additional 3 counters this turn. If you do, each of your opponents may score 5 points.',
    'When you play this personnel, he is cost -1. When this personnel is facing a dilemma, you may draw a card.',
  ])('leaves out a cost-only text: %s', (text) => {
    expect(hasPlayEffect(text)).toBe(false);
  });

  it.each([
    'When you play this personnel, you may draw two cards.',
    'When you play this personnel, you may download a Pilot.',
    'When you play this personnel, discard a card from hand.',
    'When you play this ship, you may download a Pilot and play her at cost -2 aboard this ship.',
    'When you play this personnel, choose an opponent. You may draw a card for each mission he or she commands.',
    'Pilot. When you play this personnel, if you command a Pilot, you may draw up to three cards, then discard a card from hand.',
  ])('finds a draw, download or discard: %s', (text) => {
    expect(hasPlayEffect(text)).toBe(true);
  });

  it.each([
    'Order - Draw a card.',
    'When you play another Pilot, you may draw a card.',
    'When this personnel is killed, you may download a Pilot.',
    '',
  ])('leaves out a text with no "When you play this" clause: %s', (text) => {
    expect(hasPlayEffect(text)).toBe(false);
  });

  it('reads the clause up to the next trigger', () => {
    expect(playClauseOf('Pilot. When you play this personnel, choose one. Draw a card. Order - Stop her. While facing a dilemma, she is Cunning +1.')).toBe(
      'When you play this personnel, choose one. Draw a card.'
    );
  });
});

describe('playModelCoverage', () => {
  it('counts each personnel and ship title once, the modelled and the missing apart', () => {
    const coverage = playModelCoverage(
      [
        { name: 'Zeta Pilot', type: 'Personnel', gametext: 'When you play this personnel, you may draw a card.' },
        { name: 'Zeta Pilot *VP', type: 'Personnel', gametext: 'When you play this personnel, you may draw a card.' },
        { name: 'Alpha Ship', type: 'Ship', gametext: 'When you play this ship, you may download a Pilot.' },
        { name: 'Modelled One', type: 'Personnel', gametext: 'When you play this personnel, discard a card from hand.' },
        { name: 'Cheap Pilot', type: 'Personnel', gametext: 'When you play this personnel, she is cost -1.' },
        { name: 'An Event', type: 'Event', gametext: 'When you play this personnel, you may draw a card.' },
      ],
      new Set(['modelled one'])
    );
    expect(coverage).toEqual({ modelled: ['Modelled One'], missing: ['Alpha Ship', 'Zeta Pilot'] });
  });
});

import { isCommanderOf } from '../../lib/commander';
import { passesPartnerTest } from '../../lib/dilemmaBot/gains';
import { partnerTraitsOf } from '../../lib/dilemmaBot/simulator';
import { downloadTakes } from '../../lib/effectSteps';

// A card names another by its card title alone (Glossary › naming cards, p. 18), #1986. Invented cards only.
const titled = { name: 'remus watch post', title: 'remus', subtitle: 'watch post', type: 'personnel' };
const prefixed = { name: 'remus station', title: 'remus station', subtitle: '', type: 'personnel' };

describe('a named card by its card title (#1986)', () => {
  it('passesPartnerTest reads the partner\'s card title', () => {
    expect(passesPartnerTest({ title: 'remus' }, partnerTraitsOf(titled))).toBe(true);
    expect(passesPartnerTest({ title: 'remus' }, partnerTraitsOf(prefixed))).toBe(false);
  });

  it('passesPartnerTest falls back to the name less its version suffix for a row with no title', () => {
    expect(passesPartnerTest({ title: 'remus' }, partnerTraitsOf({ name: 'Remus *VP' }))).toBe(true);
    expect(passesPartnerTest({ title: 'remus' }, partnerTraitsOf({ name: 'Remus Station' }))).toBe(false);
  });

  it('downloadTakes reads the card title of the row', () => {
    expect(downloadTakes({ test: [{ titles: ['remus'] }] }, titled)).toBe(true);
    expect(downloadTakes({ test: [{ titles: ['remus'] }] }, prefixed)).toBe(false);
    expect(downloadTakes({ test: [{ titles: ['remus'] }] }, { name: 'remus', type: 'event' })).toBe(true);
  });

  it('isCommanderOf compares the keyword with the ship\'s card title', () => {
    expect(isCommanderOf('Commander: Invented Bird.', 'Invented Bird')).toBe(true);
    expect(isCommanderOf('Commander: Invented Bird.', 'Invented Bird Of Prey')).toBe(false);
  });
});

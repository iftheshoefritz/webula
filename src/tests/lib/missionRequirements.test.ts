import { missionRequirements } from '../../lib/missionRequirements';

const card = (skills: string) => ({ name: 'Test Mission', skills });

describe('missionRequirements', () => {
  describe('AND-only missions (no OR clause)', () => {
    it('extracts a single skill', () => {
      expect(missionRequirements(card('Diplomacy'))).toEqual({ diplomacy: 1 });
    });

    it('extracts multiple skills', () => {
      expect(missionRequirements(card('Physics, Treachery'))).toEqual({
        physics: 1,
        treachery: 1,
      });
    });

    it('handles numeric prefix (e.g. "2 Diplomacy")', () => {
      expect(missionRequirements(card('2 Diplomacy, Security'))).toEqual({
        diplomacy: 2,
        security: 1,
      });
    });

    it('ignores attribute requirements like Cunning>34', () => {
      expect(missionRequirements(card('Physics, Cunning>34'))).toEqual({
        physics: 1,
      });
    });

    it('ignores unrecognised words', () => {
      expect(missionRequirements(card('Diplomacy, and, or, Cunning'))).toEqual({
        diplomacy: 1,
      });
    });
  });

  describe('OR patterns observed in card data', () => {
    it('extracts all skills from a simple inline OR group: (A or B)', () => {
      // e.g. "Physics, (Astrometrics or Engineer)"
      const result = missionRequirements(card('Physics, (Astrometrics or Engineer)'));
      expect(result).toEqual({ physics: 1, astrometrics: 1, engineer: 1 });
    });

    it('extracts all skills from a grouped inline OR: (A and B or C and D)', () => {
      // e.g. "Transporters, Treachery, and (Intelligence and Leadership or Law and Officer)"
      const result = missionRequirements(
        card('Transporters, Treachery, Cunning>34, and (Intelligence and Leadership or Law and Officer)')
      );
      expect(result).toEqual({
        transporters: 1,
        treachery: 1,
        intelligence: 1,
        leadership: 1,
        law: 1,
        officer: 1,
      });
    });

    it('extracts all skills from a top-level full-set disjunction: A, B or C, D', () => {
      // e.g. "Anthropology, 2 Diplomacy, Law and Integrity>31 or Leadership, Security, 2 Treachery, and Cunning>36"
      const result = missionRequirements(
        card('Anthropology, 2 Diplomacy, Law and Integrity>31 or Leadership, Security, 2 Treachery, and Cunning>36')
      );
      expect(result).toEqual({
        anthropology: 1,
        diplomacy: 2,
        law: 1,
        leadership: 1,
        security: 1,
        treachery: 2,
      });
    });

    it('extracts all skills from a nested grouped OR: 2 Programming, and (Engineer and Officer or Intelligence and Security)', () => {
      const result = missionRequirements(
        card('2 Programming, Cunning>34, and (Engineer and Officer or Intelligence and Security)')
      );
      expect(result).toEqual({
        programming: 2,
        engineer: 1,
        officer: 1,
        intelligence: 1,
        security: 1,
      });
    });
  });
});

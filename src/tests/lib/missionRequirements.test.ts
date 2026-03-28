import { missionRequirements, parseMissionRequirements } from '../../lib/missionRequirements';

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

describe('parseMissionRequirements', () => {
  describe('no OR clause', () => {
    it('returns all skills as mandatory and null orBranches', () => {
      expect(parseMissionRequirements('Physics, Treachery')).toEqual({
        mandatory: { physics: 1, treachery: 1 },
        orBranches: null,
      });
    });

    it('handles numeric skill prefix', () => {
      expect(parseMissionRequirements('2 Diplomacy, Security')).toEqual({
        mandatory: { diplomacy: 2, security: 1 },
        orBranches: null,
      });
    });

    it('ignores attribute requirements', () => {
      expect(parseMissionRequirements('Physics, Cunning>34')).toEqual({
        mandatory: { physics: 1 },
        orBranches: null,
      });
    });
  });

  describe('simple inline OR: (A or B)', () => {
    it('splits into two branch maps and extracts mandatory skills outside parens', () => {
      expect(parseMissionRequirements('Physics, (Astrometrics or Engineer)')).toEqual({
        mandatory: { physics: 1 },
        orBranches: [{ astrometrics: 1 }, { engineer: 1 }],
      });
    });
  });

  describe('grouped inline OR: (A and B or C and D)', () => {
    it('splits paren group into branches and keeps mandatory skills outside', () => {
      // Risan Approach Abduction Plot / Callinon VII pattern
      expect(
        parseMissionRequirements(
          'Transporters, Treachery, Cunning>34, and (Intelligence and Leadership or Law and Officer)'
        )
      ).toEqual({
        mandatory: { transporters: 1, treachery: 1 },
        orBranches: [{ intelligence: 1, leadership: 1 }, { law: 1, officer: 1 }],
      });
    });

    it('handles numeric skill prefix inside OR branches', () => {
      // e.g. "2 Programming, Cunning>34, and (Engineer and Officer or Intelligence and Security)"
      expect(
        parseMissionRequirements(
          '2 Programming, Cunning>34, and (Engineer and Officer or Intelligence and Security)'
        )
      ).toEqual({
        mandatory: { programming: 2 },
        orBranches: [{ engineer: 1, officer: 1 }, { intelligence: 1, security: 1 }],
      });
    });
  });

  describe('top-level full-set disjunction: A, B or C, D', () => {
    it('produces two full branch maps with no common mandatory skills', () => {
      // Hromi Cluster Amnesty Talks pattern
      expect(
        parseMissionRequirements(
          'Anthropology, 2 Diplomacy, Law and Integrity>31 or Leadership, Security, 2 Treachery, and Cunning>36'
        )
      ).toEqual({
        mandatory: {},
        orBranches: [
          { anthropology: 1, diplomacy: 2, law: 1 },
          { leadership: 1, security: 1, treachery: 2 },
        ],
      });
    });

    it('extracts mandatory skills common to both top-level branches', () => {
      // Hypothetical: "Diplomacy, Security or Diplomacy, Honor"
      expect(parseMissionRequirements('Diplomacy, Security or Diplomacy, Honor')).toEqual({
        mandatory: { diplomacy: 1 },
        orBranches: [{ diplomacy: 1, security: 1 }, { diplomacy: 1, honor: 1 }],
      });
    });
  });

  describe('does not confuse "or" inside skill names', () => {
    it('does not split on "or" inside "Honor"', () => {
      expect(parseMissionRequirements('Honor, Security')).toEqual({
        mandatory: { honor: 1, security: 1 },
        orBranches: null,
      });
    });

    it('does not split on "or" inside "Transporters"', () => {
      expect(parseMissionRequirements('Transporters, Leadership')).toEqual({
        mandatory: { transporters: 1, leadership: 1 },
        orBranches: null,
      });
    });
  });
});

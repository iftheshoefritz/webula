import { isCommanderOf } from '../../lib/commander';

describe('isCommanderOf', () => {
  it('reads a dotted prefix other than U.S.S. and I.K.S. (#1724)', () => {
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I.S.S. Enterprise Invented Flagship')).toBe(true);
    expect(isCommanderOf('Admiral. Commander: I.S.S. Avenger.', 'I.S.S. Avenger')).toBe(true);
    expect(isCommanderOf('Commander: E.C.S. Horizon. Dissident.', 'E.C.S. Horizon')).toBe(true);
  });

  it('does not take the first letter of a prefix for the name', () => {
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I Invented Ship')).toBe(false);
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I.S.S. Avenger')).toBe(false);
  });

  it('still reads U.S.S., uss and I.K.S.', () => {
    expect(isCommanderOf('Commander: U.S.S. Defiant.', 'U.S.S. Defiant Prototype Warship')).toBe(true);
    expect(isCommanderOf('commander: uss defiant.', 'U.S.S. Defiant Prototype Warship')).toBe(true);
    expect(isCommanderOf("Commander: I.K.S. Rotarran.", "I.K.S. Rotarran Martok's Flagship")).toBe(true);
    expect(isCommanderOf('Commander: Invented Bird.', 'Invented Bird')).toBe(true);
    expect(isCommanderOf('Commander: U.S.S. Defiant.', 'U.S.S. Relativity')).toBe(false);
  });
});

describe('isCommanderOf on keywords split at each dot', () => {
  it('reads "e. c. s. horizon", as a play joins its keywords (#1724)', () => {
    expect(isCommanderOf('commander: e. c. s. horizon. dissident', 'E.C.S. Horizon')).toBe(true);
    expect(isCommanderOf('commander: i. s. s. enterprise', 'I Invented Ship')).toBe(false);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { cardTitleOf } from '../../lib/cardTitle';
import { dotless, isCommanderOf } from '../../lib/commander';

describe('isCommanderOf', () => {
  it('reads a dotted prefix other than U.S.S. and I.K.S. (#1724)', () => {
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I.S.S. Enterprise')).toBe(true);
    expect(isCommanderOf('Admiral. Commander: I.S.S. Avenger.', 'I.S.S. Avenger')).toBe(true);
    expect(isCommanderOf('Commander: E.C.S. Horizon. Dissident.', 'E.C.S. Horizon')).toBe(true);
  });

  it('does not take the first letter of a prefix for the name', () => {
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I Invented Ship')).toBe(false);
    expect(isCommanderOf('Commander: I.S.S. Enterprise.', 'I.S.S. Avenger')).toBe(false);
  });

  it('still reads U.S.S., uss and I.K.S.', () => {
    expect(isCommanderOf('Commander: U.S.S. Defiant.', 'U.S.S. Defiant')).toBe(true);
    expect(isCommanderOf('commander: uss defiant.', 'U.S.S. Defiant')).toBe(true);
    expect(isCommanderOf("Commander: I.K.S. Rotarran.", 'I.K.S. Rotarran')).toBe(true);
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

describe('isCommanderOf on the real card data (#1986)', () => {
  // The rows read by hand, as `parseCardData` normalises the keywords: Jest does not load the real d3.
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  const col = (row: string[], name: string): string => row[head.indexOf(name)] ?? '';
  const ships = rows.filter((r) => col(r, 'Type') === 'Ship');
  const commanders = rows.filter((r) => /commander:/i.test(col(r, 'Keywords')));
  const keywordsOf = (r: string[]): string => col(r, 'Keywords').toLowerCase().replace(/U\.S\.S./i, 'uss').replace(/I\.K\.S\./i, 'iks');
  // The rule before #1986: the name less its version suffix, equal to the keyword's name or starting with it.
  const byPrefix = (keywords: string, ship: string[]): boolean =>
    Array.from(keywords.replace(/\b[a-z](?:\.\s*[a-z]\b)+\./g, (p) => p.replace(/[^a-z]/g, '')).matchAll(/commander:\s*([^.;]+)/g)).some(([, name]) => {
      const lore = dotless(name);
      const title = dotless(cardTitleOf(col(ship, 'Name')));
      return lore !== '' && (title === lore || title.startsWith(`${lore} `));
    });

  it('matches every ship a "Commander:" keyword named by the prefix of its name, and no other', () => {
    expect(commanders.length).toBeGreaterThan(100);
    const differ = commanders.flatMap((p) =>
      ships
        .filter((s) => isCommanderOf(keywordsOf(p), col(s, 'Title')) !== byPrefix(keywordsOf(p), s))
        .map((s) => `${col(p, 'Name')} / ${col(s, 'Name')}`)
    );
    expect(differ).toEqual([]);
  });

  it('matches the U.S.S. Defiant and the I.K.S. ships by their card titles', () => {
    const matched = (title: string): string[] =>
      commanders.filter((p) => ships.some((s) => col(s, 'Title') === title && isCommanderOf(keywordsOf(p), col(s, 'Title')))).map((p) => col(p, 'Name'));
    expect(matched('U.S.S. Defiant').length).toBeGreaterThan(0);
    const iks = ships.filter((s) => col(s, 'Title').startsWith('I.K.S. '));
    expect(iks.some((s) => commanders.some((p) => isCommanderOf(keywordsOf(p), col(s, 'Title'))))).toBe(true);
  });
});

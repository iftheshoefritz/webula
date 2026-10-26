import { BOT_SKILLS, meetsRequirements, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import { readFileSync } from 'fs';
import { join } from 'path';

const skillsOf = (b: { skills: number[] }) =>
  Object.fromEntries(b.skills.map((n, i) => [BOT_SKILLS[i], n]).filter(([, n]) => n));

const personnel = (skills: Record<string, number>, attrs: [number, number, number] = [5, 5, 5]) => ({
  skills: BOT_SKILLS.map((s) => skills[s] ?? 0),
  attrs,
});

describe('parseRequirementBranches', () => {
  it('reads skills, counts and an attribute check', () => {
    const [b] = parseRequirementBranches('Physics, 2 Treachery, Cunning>34')!;
    expect(skillsOf(b)).toEqual({ physics: 1, treachery: 2 });
    expect(b.attrs).toEqual([-1, 34, -1]);
  });

  it('reads &gt; as >', () => {
    expect(parseRequirementBranches('2 Astrometrics, and Cunning&gt;34')![0].attrs).toEqual([-1, 34, -1]);
  });

  it('gives a top-level or lower precedence than the commas', () => {
    const branches = parseRequirementBranches(
      'Anthropology, 2 Diplomacy, Law and Integrity>31 or Leadership, Security, 2 Treachery, and Cunning>36',
    )!;
    expect(branches.map(skillsOf)).toEqual([
      { anthropology: 1, diplomacy: 2, law: 1 },
      { leadership: 1, security: 1, treachery: 2 },
    ]);
    expect(branches.map((b) => b.attrs)).toEqual([[31, -1, -1], [-1, 36, -1]]);
  });

  it('expands a group in parentheses', () => {
    const branches = parseRequirementBranches(
      'Transporters, Treachery, Cunning>34, and (Intelligence and Leadership or Law and Officer)',
    )!;
    expect(branches.map(skillsOf)).toEqual([
      { intelligence: 1, leadership: 1, transporters: 1, treachery: 1 },
      { law: 1, officer: 1, transporters: 1, treachery: 1 },
    ]);
  });

  it('reads "any attribute>32" as three alternatives', () => {
    const branches = parseRequirementBranches('Medical, and any attribute>32')!;
    expect(branches.map((b) => b.attrs)).toEqual([[32, -1, -1], [-1, 32, -1], [-1, -1, 32]]);
  });

  it('returns null for a part the bot cannot check', () => {
    expect(parseRequirementBranches('Engineer, Cunning>32, and total Weapons at this mission>10')).toBeNull();
    expect(parseRequirementBranches('')).toBeNull();
  });

  it('reads most non-headquarters missions of the card data', () => {
    // The rows are read by hand: Jest does not load the real d3, an ES module, so `loadCards` fails here.
    const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
    const col = (name: string) => head.indexOf(name);
    const missions = rows.filter((r) => r[col('Type')].toLowerCase() === 'mission' && !/h/i.test(r[col('Mission')]));
    const read = missions.filter((r) => parseRequirementBranches(r[col('Skills')]) !== null);
    expect(missions.length).toBeGreaterThan(300);
    expect(read.length / missions.length).toBeGreaterThan(0.85);
  });
});

describe('meetsRequirements', () => {
  const branches = parseRequirementBranches('Physics, 2 Science, and Cunning>12')!;

  it('needs every skill count and an attribute total above the threshold', () => {
    const group = [personnel({ physics: 1, science: 1 }), personnel({ science: 1 }, [5, 7, 5])];
    expect(meetsRequirements(branches, group)).toBe(false); // Cunning 12 is not above 12
    group[0].attrs = [5, 6, 5];
    expect(meetsRequirements(branches, group)).toBe(true);
  });

  it('counts only the personnel marked alive', () => {
    const group = [personnel({ physics: 1, science: 2 }, [5, 20, 5]), personnel({})];
    expect(meetsRequirements(branches, group, [1, 0])).toBe(true);
    expect(meetsRequirements(branches, group, [0, 1])).toBe(false);
  });
});

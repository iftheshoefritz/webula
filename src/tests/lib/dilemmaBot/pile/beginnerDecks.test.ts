import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileTable, costOf, stackCostOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botAffiliationsOf, botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { beamPileSearch, choosePileStack, isLegalPileStack, legalPileStacks } from '../../../../lib/dilemmaBot/pile/search';

// The titles of the 14 Beginner Decks (#1513): the coverage of the registry, the plays of their own, the
// assumptions of #1320 and their labels, each worked out by hand.

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/beginner-decks');
const DECKS = readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();
const deckText = (file: string) => readFileSync(join(DIR, file), 'utf-8');

function person(
  name: string,
  { attrs = [5, 5, 5] as [number, number, number], skills = {} as Record<string, number>, cost = 3, species = ['human'], affiliation = 'federation' } = {},
): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  return {
    name,
    cost,
    attrs: [...attrs] as [number, number, number],
    skills: levels,
    species,
    affiliation,
    skillDots: Object.keys(skills).length,
    hologram: species.includes('hologram'),
    printed: { skills: levels.slice(), attrs: [...attrs] as [number, number, number] },
  };
}

const SPACE = { kind: 'space' as const, points: 35, span: 2, nebula: false };

function attemptOf(
  personnel: PilePersonnel[],
  over: Partial<Omit<PileAttempt, 'requirements' | 'table'>> & { requirements?: string; table?: Partial<PileTable> } = {},
): PileAttempt {
  const { requirements = 'Cunning>0', table = {}, ...rest } = over;
  return {
    personnel,
    requirements: parseRequirementBranches(requirements)!,
    mission: { kind: 'planet', points: 35, span: 2, nebula: false },
    table: {
      headquarters: 1,
      completedMissions: 0,
      completedSpaceMission: false,
      handSize: 7,
      handHasCunning7Or11: false,
      discardCopiesMax: 0,
      missionSkills: [],
      underMission: [],
      turn: 1,
      ...table,
    },
    ...rest,
  };
}

const play = (attempt: PileAttempt, titles: string[], seed = 1): PileResult =>
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), seededRandom(seed));

const group = (n: number, opts: Parameters<typeof person>[1] = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
const ix = (skill: string) => BOT_SKILLS.indexOf(skill);
const cost = (title: string, attempt: PileAttempt) => costOf(REGISTRY.get(title)!, attempt);
const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);

describe('the registry against the beginner decks', () => {
  it('has the 14 decks', () => {
    expect(DECKS).toHaveLength(14);
  });

  it.each(DECKS)('has a model for every dilemma of %s', (file) => {
    const pile = botPileOf(deckText(file));
    expect(pile.missing).toEqual([]);
    expect(pile.played.length + pile.ignored.length).toBe(30);
  });

  it.each(DECKS)('chooses a legal stack from a draw of 12 of %s, at a planet and at a space mission', (file) => {
    const pile = botPileOf(deckText(file)).played;
    const rand = seededRandom(DECKS.indexOf(file) + 1);
    const order = pile.map((t) => ({ t, r: rand() })).sort((a, b) => a.r - b.r).map((x) => x.t);
    const drawn = order.slice(0, 12);
    const crew = [person('Doc', { skills: { medical: 1, science: 1 } }), person('Pilot', { skills: { navigation: 1 } }), ...group(6)];
    for (const mission of [undefined, SPACE]) {
      const attempt = attemptOf(crew, { requirements: 'Medical, Navigation and Cunning>30', ...(mission ? { mission } : {}) });
      const result = choosePileStack(attempt, drawn, 8, 1);
      expect(isLegalPileStack(attempt, result.best.stack, drawn, 8)).toBe(true);
    }
  });

  it('reads the affiliations of the personnel of a deck\'s Deck: section, by name and subtitle', () => {
    const lines = readFileSync(join(ROOT, 'public/cards_with_processed_columns.txt'), 'utf-8').split('\n');
    const cell = (c: string) => c.replace(/^"|"$/g, '');
    const head = lines[0].split('\t').map(cell);
    const rows = lines.slice(1).filter(Boolean).map((l) => l.split('\t').map(cell))
      .map((r) => ({ originalName: r[head.indexOf('Name')], type: r[head.indexOf('Type')], affiliation: r[head.indexOf('Affiliation')] }));
    const text = 'Deck:\n1\tData Proud Father\n1\tSoong-type Android\n2\tU.S.S. Oberth\nDilemmas:\n1\tNo Kill I\n';
    const row = (name: string) => rows.find((r) => r.originalName === name)!;
    const expected = Array.from(new Set([row('Data Proud Father').affiliation, row('Soong-type Android').affiliation].map((a) => a.toLowerCase()))).sort();
    expect(botAffiliationsOf(text, rows)).toEqual(expected);
    expect(botAffiliationsOf(deckText('Klingon Beginner Deck - Lucas Thompson.txt'), rows)).toContain('klingon');
  });
});

describe('the titles with a play of their own', () => {
  it('Casualties kills the personnel with the fewest skill dots when it has fewer than 4, and stops it otherwise', () => {
    const three = person('Three', { skills: { medical: 1, science: 1, honor: 1 } });
    const four = person('Four', { skills: { medical: 1, science: 1, honor: 1, law: 1 } });
    const five = person('Five', { skills: { medical: 1, science: 1, honor: 1, law: 1, physics: 1 } });
    expect(play(attemptOf([three, four, five]), ['Casualties'])).toMatchObject({ killed: 1, stopped: 0 });
    expect(play(attemptOf([four, five]), ['Casualties'])).toMatchObject({ killed: 0, stopped: 1 });
  });

  it('Mark of Gideon stops one with 8 left, returns 2 with 9 left, and 3 with 10 left', () => {
    expect(play(attemptOf(group(9)), ['Mark of Gideon'])).toMatchObject({ stopped: 1, returned: 0 });
    expect(play(attemptOf(group(10)), ['Mark of Gideon'])).toMatchObject({ stopped: 0, returned: 2 });
    expect(play(attemptOf(group(11)), ['Mark of Gideon'])).toMatchObject({ stopped: 0, returned: 3 });
  });

  it('Toe to Toe stops two personnel of the same cost, and kills one with no partner', () => {
    expect(play(attemptOf(group(2, { cost: 3 })), ['Toe to Toe'])).toMatchObject({ stopped: 2, killed: 0 });
    expect(play(attemptOf([person('A', { cost: 1 }), person('B', { cost: 3 })]), ['Toe to Toe'])).toMatchObject({ stopped: 0, killed: 1 });
  });

  it('The Clown: Guillotine names a skill the mission needs, kills one with an attribute above 6, else two', () => {
    const strong = [person('A', { attrs: [7, 5, 5], skills: { medical: 1 } }), person('B', { attrs: [5, 7, 5], skills: { medical: 1 } })];
    const weak = [person('A', { skills: { medical: 1 } }), person('B', { skills: { medical: 1 } })];
    const strongResult = play(attemptOf([...strong, person('C', { skills: { law: 1 } })], { requirements: 'Medical' }), ['The Clown: Guillotine']);
    expect(strongResult.killed).toBe(1);
    expect(labelsOf(strongResult)).toEqual(['Named Medical']);
    expect(play(attemptOf([...weak, ...group(2)], { requirements: 'Medical' }), ['The Clown: Guillotine']).killed).toBe(2);
    expect(REGISTRY.get('The Clown: Guillotine')!.goesUnder).toBe(false);
  });

  it('the reveal dilemmas stop the personnel when the hand holds a personnel of a skill, and kill it otherwise', () => {
    const hand = (skill: string) => ({ hand: [{ skills: [ix(skill)], strength: 5 }] });
    const space = (table: Partial<PileTable>) => attemptOf(group(3), { mission: SPACE, table });
    expect(play(attemptOf(group(3), { table: hand('geology') }), ['Compassionate Interference'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(attemptOf(group(3)), ['Compassionate Interference'])).toMatchObject({ stopped: 0, killed: 1 });
    expect(play(space(hand('navigation')), ['Hull Breach'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(space(hand('medical')), ['Hull Breach'])).toMatchObject({ stopped: 0, killed: 1 });
    expect(play(attemptOf(group(3), { table: hand('officer') }), ['Last Gasp'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(attemptOf(group(3)), ['Last Gasp'])).toMatchObject({ stopped: 0, killed: 1 });
  });

  it('The Needs of the Few kills an Engineer or Security personnel once a planet mission is complete, and stops one before', () => {
    const crew = [person('Eng', { skills: { engineer: 1 } }), ...group(2)];
    expect(play(attemptOf(crew, { mission: SPACE }), ['The Needs of the Few'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(attemptOf(crew, { mission: SPACE, table: { completedPlanetMission: true } }), ['The Needs of the Few'])).toMatchObject({ stopped: 0, killed: 1 });
  });
});

describe('the assumptions of #1320 for the beginner decks', () => {
  const attempt = attemptOf(group(6));
  const onTurn = (turn: number) => attemptOf(group(6), { table: { turn } });

  it('costs Environmental Contaminants 1 once you have a point, and the printed 4 at 0 points (#1541)', () => {
    expect(cost('Environmental Contaminants', attemptOf(group(6), { table: { score: 5 } }))).toBe(1);
    expect(cost('Environmental Contaminants', attemptOf(group(6), { table: { score: 0 } }))).toBe(4);
    expect(cost('Environmental Contaminants', attempt)).toBe(4);
  });

  it('costs Space Seed 6 on turn 1, 3 on turn 2 and 0 on turn 3: 3 × the turn Genetically Enhanced personnel', () => {
    expect([1, 2, 3].map((t) => cost('Space Seed', onTurn(t)))).toEqual([6, 3, 0]);
  });

  it('Peremptory Plea lowers the next dilemma of the stack by 3 × the turn, never below 0', () => {
    const models = (titles: string[]) => titles.map((t) => REGISTRY.get(t)!);
    expect(stackCostOf(onTurn(1), models(['Peremptory Plea', 'Space Seed']))).toBe(1 + 3);
    expect(stackCostOf(onTurn(1), models(['Space Seed', 'Peremptory Plea']))).toBe(6 + 1);
    expect(stackCostOf(onTurn(3), models(['Peremptory Plea', 'Brave Words']))).toBe(1);
  });

  it('Entanglement adds 3 to the budget of its stack', () => {
    const drawn = ['Space Seed', 'Entanglement'];
    expect(isLegalPileStack(onTurn(1), ['Space Seed'], drawn, 4)).toBe(false);
    expect(isLegalPileStack(onTurn(1), ['Space Seed', 'Entanglement'], drawn, 4)).toBe(true);
    expect(legalPileStacks(onTurn(1), drawn, 4)).toEqual(expect.arrayContaining([['Space Seed', 'Entanglement'], ['Entanglement', 'Space Seed']]));
  });

  it('finds a stack that only the discount of Peremptory Plea makes legal, and rejects the other order', () => {
    const drawn = ['Space Seed', 'Peremptory Plea'];
    expect(isLegalPileStack(onTurn(1), ['Peremptory Plea', 'Space Seed'], drawn, 4)).toBe(true);
    expect(isLegalPileStack(onTurn(1), ['Space Seed', 'Peremptory Plea'], drawn, 4)).toBe(false);
    const stacks = beamPileSearch(onTurn(1), drawn, 4, 1).ranked.map((s) => s.stack);
    expect(stacks).toContainEqual(['Peremptory Plea', 'Space Seed']);
    expect(stacks).not.toContainEqual(['Space Seed', 'Peremptory Plea']);
    expect(legalPileStacks(onTurn(1), drawn, 4)).toContainEqual(['Peremptory Plea', 'Space Seed']);
  });

  it('Brothers adds 10 to its attribute requirements: Integrity>40 with an Engineer', () => {
    const crew = (integrity: number) => [person('Eng', { attrs: [integrity, 5, 5], skills: { engineer: 1 } }), ...group(5, { attrs: [5, 5, 5] })];
    // Integrity 15 + 25 = 40 meets the printed Integrity>30 but not Integrity>40.
    const raised = play(attemptOf(crew(15), { mission: SPACE }), ['Brothers']);
    expect(raised.stopped).toBe(6);
    expect(labelsOf(raised)).toEqual(['Discarded an Android']);
    expect(play(attemptOf(crew(16), { mission: SPACE }), ['Brothers']).stopped).toBe(0);
  });
});

describe('the labels of the bot-side titles', () => {
  it('Show Trial stops a Leadership or Medical personnel, then a second: you have more points', () => {
    const result = play(attemptOf([person('Leader', { skills: { leadership: 1 } }), ...group(3)], { table: { score: 5 } }), ['Show Trial']);
    expect(result.stopped).toBe(2);
    expect(labelsOf(result)).toEqual(['You have more points']);
  });

  it('Show Trial stops no second personnel at 0 points: you are not ahead (#1541)', () => {
    const result = play(attemptOf([person('Leader', { skills: { leadership: 1 } }), ...group(3)], { table: { score: 0 } }), ['Show Trial']);
    expect(result.stopped).toBe(1);
    expect(labelsOf(result)).toEqual([]);
    expect(REGISTRY.get('Show Trial')!.assumption).toContain('at 0 points you are not ahead');
  });

  it('Brave Words: the bot chooses a personnel to be stopped', () => {
    const result = play(attemptOf(group(3)), ['Brave Words']);
    expect(result.stopped).toBe(1);
    expect(labelsOf(result)).toEqual(["Bot's missions: more span", 'Chose P0']);
  });

  it('Cardassian Processing places a personnel in the bot\'s brig unless the group meets it', () => {
    const result = play(attemptOf(group(3)), ['Cardassian Processing']);
    expect(result.brig).toBe(1);
    expect(labelsOf(result)).toEqual(['Commands Cardassia Prime']);
    const met = [person('L', { skills: { law: 1, security: 1 }, attrs: [5, 5, 31] })];
    expect(play(attemptOf(met), ['Cardassian Processing']).brig).toBe(0);
  });

  it('Know Thy Enemy: the bot reveals 1 more Strength than the personnel of the hand', () => {
    const hand = [{ skills: [], strength: 6 }, { skills: [], strength: 7 }];
    const result = play(attemptOf(group(3), { table: { hand } }), ['Know Thy Enemy']);
    expect(result).toMatchObject({ killed: 1, stopped: 2 });
    expect(labelsOf(result)).toEqual(['Revealed personnel with Strength 14']);
    expect(labelsOf(play(attemptOf(group(3)), ['Know Thy Enemy']))).toEqual(['Revealed personnel with Strength 1']);
  });

  it('Unwanted Guests: the bot discards a personnel with skills the group lacks, and all are stopped', () => {
    const result = play(attemptOf(group(3)), ['Unwanted Guests']);
    expect(result.stopped).toBe(3);
    expect(labelsOf(result)).toEqual(['Discarded a personnel with Acquisition, Anthropology']);
  });

  it('Abrasive Allies compares the affiliations with the bot deck\'s', () => {
    const result = play(attemptOf(group(3), { botAffiliations: ['bajoran', 'federation'] }), ['Abrasive Allies']);
    expect(result.stopped).toBe(1);
    expect(labelsOf(result)).toEqual(['Affiliations: Bajoran, Federation', 'Chose P0']);
    const mixed = ['federation', 'klingon', 'romulan'].map((a) => person(a, { affiliation: a }));
    expect(play(attemptOf(mixed, { botAffiliations: ['bajoran', 'federation'] }), ['Abrasive Allies']).stopped).toBe(0);
    expect(play(attemptOf(mixed), ['Abrasive Allies']).stopped).toBe(1);
  });

  it('Space Seed places two personnel in the bot\'s brig: it commands To Rule in Hell', () => {
    const result = play(attemptOf(group(4)), ['Space Seed']);
    expect(result.brig).toBe(2);
    expect(labelsOf(result)).toEqual(['Commands To Rule in Hell']);
  });

  it('Peremptory Plea names the Genetically Enhanced personnel, and stops a Biology personnel', () => {
    const result = play(attemptOf([person('Bio', { skills: { biology: 1 } }), ...group(2)], { table: { turn: 2 } }), ['Peremptory Plea']);
    expect(result.stopped).toBe(1);
    expect(labelsOf(result)).toEqual(['6 Genetically Enhanced personnel']);
  });
});

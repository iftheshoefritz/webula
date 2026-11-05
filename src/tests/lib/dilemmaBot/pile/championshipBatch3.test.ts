import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileTable, costOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';

// The Championship titles of batch 3 (#1517): the coverage of the Championship piles, the plays of their
// own, the new family, and the bot-side titles of #1320 with their assumptions and labels, each worked out
// by hand.

const ROOT = process.cwd();
const DIR = join(ROOT, 'championship-decks');
const FILES: string[] = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf-8')).map((r: { file: string }) => r.file);
const deckText = (file: string) => readFileSync(join(DIR, file), 'utf-8');

const BATCH_3 = [
  'Skeleton Crew', 'The Dreamer and the Dream', 'Spatial Interphase', 'Unfair Terms', 'The Caretaker\'s "Guests"',
  'The Clown: Go Away', 'Slightly Overbooked', 'Spatial Distortions', 'Staffing Shortage', 'Stripped Down',
  'Suspected Minority', 'The Phage', 'Zero Hour', 'Shared Hallucination', 'Telepathology', 'Simulated Prey', 'Temptation',
  'The Captain\'s "Guest"', 'The Clown: Cloaking Device', 'We\'ll Never Know', 'Shocking Betrayal', 'Tak Tak Negotiations',
  'Soul Searching', 'Suspicion', 'The First Duty', 'Unknown Microorganism', 'V\'Ger', 'Two-Dimensional Creatures',
  'Unbelievable Emergency', 'What Lies Beneath', 'Telepathic Deception', 'The Needs of the Many', 'Threading the Needle',
  'Ungracious Hosts', 'Weight of Command', 'Shields Up!', 'Shipboard Fire', 'So Many Enemies', 'Standing Trial',
  'Temporal Conduit', 'The Big Goodbye', 'The Clown: Bitter Medicine', 'The Clown: On His Throne', 'Vastly Outnumbered',
  'Vian Test', 'Warm Welcome',
];

interface PersonOptions {
  attrs?: [number, number, number];
  skills?: Record<string, number>;
  printedSkills?: Record<string, number>;
  cost?: number;
  species?: string[];
  icons?: string[];
  keywords?: string[];
  firstSkill?: string;
  affiliation?: string;
}

function person(name: string, { attrs = [5, 5, 5], skills = {}, printedSkills, cost = 3, species = ['human'], icons, keywords, firstSkill, affiliation = 'federation' }: PersonOptions = {}): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  const printed = printedSkills ? BOT_SKILLS.map((s) => printedSkills[s] ?? 0) : levels.slice();
  return {
    name,
    cost,
    attrs: [...attrs] as [number, number, number],
    skills: levels,
    species,
    affiliation,
    skillDots: Object.keys(skills).length,
    hologram: false,
    printed: { skills: printed, attrs: [...attrs] as [number, number, number] },
    ...(icons || keywords
      ? { traits: { name: name.toLowerCase(), affiliation, species, keywords: keywords ?? [], icons: icons ?? [], skills: levels.slice() } }
      : {}),
    ...(firstSkill ? { firstSkill: BOT_SKILLS.indexOf(firstSkill) } : {}),
  };
}

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

const group = (n: number, opts: PersonOptions = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
const cost = (title: string, attempt: PileAttempt) => costOf(REGISTRY.get(title)!, attempt);
const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);

describe('the registry against the Championship piles', () => {
  it('has a model of every title of batch 3', () => {
    expect(BATCH_3).toHaveLength(46);
    expect(BATCH_3.filter((t) => !REGISTRY.has(t))).toEqual([]);
  });

  it.each(FILES)('lacks no title of batch 3 in %s', (file) => {
    const pile = botPileOf(deckText(file));
    expect(pile.missing.filter((t) => BATCH_3.includes(t))).toEqual([]);
    expect(pile.played).not.toContain('Tak Tak Negotiations');
    expect(pile.played).not.toContain('Ungracious Hosts');
  });

  it('takes Tak Tak Negotiations and Ungracious Hosts out of the pile', () => {
    for (const title of ['Tak Tak Negotiations', 'Ungracious Hosts']) {
      expect(REGISTRY.get(title)!.status).toBe('ignore');
      const holding = FILES.filter((f) => new RegExp(`\\t${title}\\s*$`, 'm').test(deckText(f)));
      expect(holding.length).toBeGreaterThan(0);
      for (const file of holding) expect(botPileOf(deckText(file)).ignored).toContain(title);
    }
  });
});

describe('the bot-side titles of #1320', () => {
  it('costs Spatial Interphase, Unfair Terms and Slightly Overbooked 0: three bot missions worth 40 or more', () => {
    for (const title of ['Spatial Interphase', 'Unfair Terms', 'Slightly Overbooked']) {
      expect(cost(title, attemptOf(group(3)))).toBe(0);
      expect(REGISTRY.get(title)).toMatchObject({ printedCost: 6, category: '3' });
      expect(labelsOf(play(attemptOf(group(3, { cost: 1 })), [title]))).toEqual([]);
    }
  });

  it('Spatial Interphase kills a personnel of three or fewer skill dots', () => {
    const result = play(attemptOf([person('Four', { skills: { medical: 1, science: 1, honor: 1, law: 1 } }), person('One', { skills: { medical: 1 } })]), ['Spatial Interphase']);
    expect(result).toMatchObject({ killed: 1 });
  });

  it('Unfair Terms kills each of the three selected who costs 2 or less', () => {
    expect(play(attemptOf(group(3, { cost: 2 })), ['Unfair Terms'])).toMatchObject({ killed: 3 });
    expect(play(attemptOf(group(3, { cost: 3 })), ['Unfair Terms'])).toMatchObject({ killed: 0 });
  });

  it('Slightly Overbooked stops the cheap personnel unless three cost 4 or more', () => {
    const cheap = group(2, { cost: 1 });
    expect(play(attemptOf([...cheap, ...group(2, { cost: 4 })]), ['Slightly Overbooked'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf([...cheap, ...group(3, { cost: 4 })]), ['Slightly Overbooked'])).toMatchObject({ stopped: 0 });
  });

  it('The Clown: Cloaking Device adds 9 to each attribute requirement: 3 different equipment', () => {
    const attempt = attemptOf(group(7, { attrs: [5, 5, 5] }), { requirements: 'Cunning>30' });
    expect(play(attempt, [])).toMatchObject({ fail: false });
    const result = play(attempt, ['The Clown: Cloaking Device']);
    expect(result).toMatchObject({ fail: true, stopped: 0 });
    expect(labelsOf(result)).toEqual(['3 different equipment']);
    expect(REGISTRY.get('The Clown: Cloaking Device')).toMatchObject({ category: '5b', goesUnder: true });
    expect(play(attemptOf(group(8, { attrs: [5, 5, 5] }), { requirements: 'Cunning>30' }), ['The Clown: Cloaking Device'])).toMatchObject({ fail: false });
  });

  it('Simulated Prey kills two personnel with a required skill and labels the discard', () => {
    const attempt = attemptOf([...group(3, { skills: { medical: 1 } }), person('None')], { requirements: 'Medical' });
    const result = play(attempt, ['Simulated Prey']);
    expect(result).toMatchObject({ killed: 2, stopped: 0 });
    expect(labelsOf(result)).toEqual(['Discarded an interrupt']);
    expect(REGISTRY.get('Simulated Prey')).toMatchObject({ category: '4f' });
  });

  it('Shocking Betrayal kills a personnel of an affiliation the bot deck holds, and labels the discard', () => {
    // The player stops P0, the first whose loss keeps Cunning>0; the bot then kills the Klingon.
    const personnel = [...group(2), person('Worf', { affiliation: 'klingon' })];
    const result = play(attemptOf(personnel, { botAffiliations: ['klingon', 'non-aligned'] }), ['Shocking Betrayal']);
    expect(result).toMatchObject({ stopped: 1, killed: 1 });
    expect(labelsOf(result)).toEqual(['Discarded a Klingon personnel']);
    expect(REGISTRY.get('Shocking Betrayal')).toMatchObject({ category: '4f' });
  });

  it('Shocking Betrayal only stops with a Non-Aligned bot deck, or with no bot-deck fact', () => {
    const personnel = [...group(2), person('Worf', { affiliation: 'klingon' }), person('Quark', { affiliation: 'non-aligned' })];
    for (const attempt of [attemptOf(personnel, { botAffiliations: ['non-aligned'] }), attemptOf(personnel)]) {
      const result = play(attempt, ['Shocking Betrayal']);
      expect(result).toMatchObject({ stopped: 1, killed: 0 });
      expect(labelsOf(result)).toEqual([]);
    }
  });

  it('Standing Trial stops an Honor personnel and returns one: you have more points', () => {
    const result = play(attemptOf([person('Honor', { skills: { honor: 1 } }), ...group(2)]), ['Standing Trial']);
    expect(result).toMatchObject({ stopped: 1, returned: 1 });
    expect(labelsOf(result)).toEqual(['You have more points']);
    expect(REGISTRY.get('Standing Trial')).toMatchObject({ category: '2', assumption: 'you have more points than the bot, so a personnel returns to your hand' });
  });
});

describe('the costs and the plays of their own', () => {
  it('Warm Welcome costs 3 with six personnel and 0 with five', () => {
    expect(cost('Warm Welcome', attemptOf(group(6)))).toBe(3);
    expect(cost('Warm Welcome', attemptOf(group(5)))).toBe(0);
  });

  it('Warm Welcome removes one, counted as killed, unless 3 [Cmd] personnel or 2 Officer', () => {
    expect(play(attemptOf(group(4)), ['Warm Welcome'])).toMatchObject({ killed: 1 });
    expect(play(attemptOf(group(2, { skills: { officer: 1 } })), ['Warm Welcome'])).toMatchObject({ killed: 0 });
    expect(play(attemptOf(group(3, { icons: ['[cmd]'] })), ['Warm Welcome'])).toMatchObject({ killed: 0 });
  });

  it('The Clown: Bitter Medicine lowers the attributes of the named skill\'s holders, the final check too', () => {
    // Cunning 3×11 = 33 > 30; with Medical named every holder is Cunning 9, 27, and the attempt fails.
    const attempt = attemptOf(group(3, { attrs: [5, 11, 5], skills: { medical: 1 } }), { requirements: 'Cunning>30' });
    const result = play(attempt, ['The Clown: Bitter Medicine']);
    expect(result).toMatchObject({ fail: true, stopped: 0 });
    expect(labelsOf(result)).toEqual(['Named Medical']);
    expect(attempt.personnel.map((p) => p.attrs)).toEqual([[5, 11, 5], [5, 11, 5], [5, 11, 5]]);
    expect(play(attempt, [])).toMatchObject({ fail: false });
  });

  it('The Clown: Bitter Medicine names the most held skill when no loss breaks the requirements', () => {
    const attempt = attemptOf([person('A', { skills: { science: 1 } }), person('B', { skills: { science: 1, medical: 1 } })]);
    expect(labelsOf(play(attempt, ['The Clown: Bitter Medicine']))).toEqual(['Named Science']);
  });

  it('The Clown: On His Throne names the attribute that makes the group fail, and otherwise the lowest', () => {
    const failing = play(attemptOf(group(2, { attrs: [10, 20, 20] }), { requirements: 'Cunning>30' }), ['The Clown: On His Throne']);
    expect(failing).toMatchObject({ fail: true });
    expect(labelsOf(failing)).toEqual(['Named Integrity']);
    const holding = play(attemptOf(group(2, { attrs: [20, 18, 16] }), { requirements: 'Cunning>30' }), ['The Clown: On His Throne']);
    expect(holding).toMatchObject({ fail: false });
    expect(labelsOf(holding)).toEqual(['Named Strength']);
  });

  it('Unbelievable Emergency kills the selected holders of the named skill, for each headquarters', () => {
    const result = play(attemptOf(group(4, { skills: { security: 1 } })), ['Unbelievable Emergency']);
    expect(result).toMatchObject({ killed: 2, stopped: 0 });
    expect(labelsOf(result)).toEqual(['Named Security']);
    const two = play(attemptOf([...group(4), person('Sec', { skills: { security: 1 } })], { table: { headquarters: 2 } }), ['Unbelievable Emergency']);
    expect(two.killed + two.stopped).toBe(4);
  });

  it('The Captain\'s "Guest" names the most held keyword and stops all three when one has it', () => {
    const result = play(attemptOf(group(3, { keywords: ['admiral'] })), ['The Captain\'s "Guest"']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual(['Named Admiral']);
    const none = play(attemptOf(group(4)), ['The Captain\'s "Guest"']);
    expect(none).toMatchObject({ stopped: 1 });
    expect(labelsOf(none)).toEqual([]);
  });

  it('Suspicion: the player stops two who share a skill with the chosen personnel when that saves the attempt', () => {
    // The bot chooses Doctor, the only Medical; Ann and Bob share Science with her, and stopping them keeps Medical.
    const attempt = attemptOf([person('Doctor', { skills: { medical: 1, science: 1 } }), person('Ann', { skills: { science: 1 } }), person('Bob', { skills: { science: 1 } })], { requirements: 'Medical' });
    expect(play(attempt, ['Suspicion'])).toMatchObject({ stopped: 2, fail: false });
    // With no one sharing a skill, the chosen personnel is stopped.
    const alone = attemptOf([person('Doctor', { skills: { medical: 1 } }), ...group(2)], { requirements: 'Medical' });
    expect(play(alone, ['Suspicion'])).toMatchObject({ stopped: 1, fail: true });
  });

  it('Zero Hour adds 3 to each attribute requirement for each event in your core', () => {
    const attempt = (coreEvents?: number) => attemptOf(group(7, { attrs: [5, 5, 5] }), { requirements: 'Cunning>30', table: coreEvents === undefined ? {} : { coreEvents } });
    expect(play(attempt(), ['Zero Hour'])).toMatchObject({ fail: false });
    expect(play(attempt(0), ['Zero Hour'])).toMatchObject({ fail: false });
    expect(play(attempt(2), ['Zero Hour'])).toMatchObject({ fail: true });
  });
});

describe('the titles that fit a family', () => {
  it('Spatial Distortions and The Phage discard the player\'s choice; Vian Test places it in the brig', () => {
    expect(play(attemptOf(group(3)), ['Spatial Distortions'])).toMatchObject({ killed: 1 });
    expect(play(attemptOf(group(3)), ['The Phage'])).toMatchObject({ killed: 1 });
    expect(play(attemptOf(group(3)), ['Vian Test'])).toMatchObject({ brig: 1 });
  });

  it('Staffing Shortage stops a personnel with 2 levels of a skill, and kills one without', () => {
    expect(play(attemptOf([person('A', { skills: { security: 2 } })]), ['Staffing Shortage'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(attemptOf([person('A', { skills: { security: 1 } })]), ['Staffing Shortage'])).toMatchObject({ stopped: 0, killed: 1 });
  });

  it('Suspected Minority stops one with fewer than four species, and three otherwise', () => {
    expect(play(attemptOf(group(5)), ['Suspected Minority'])).toMatchObject({ stopped: 1 });
    const four = ['human', 'vulcan', 'bajoran', 'klingon'].map((sp) => person(sp, { species: [sp] }));
    expect(play(attemptOf(four), ['Suspected Minority'])).toMatchObject({ stopped: 3 });
  });

  it('Weight of Command stops the Officers selected and moves the unstopped Romulans', () => {
    const personnel = [person('Officer', { skills: { officer: 1 }, affiliation: 'romulan' }), person('Rom', { affiliation: 'romulan' }), person('Fed')];
    expect(play(attemptOf(personnel), ['Weight of Command'])).toMatchObject({ stopped: 1, moved: 1 });
  });

  it('So Many Enemies stops all three with a Treachery personnel, and one otherwise', () => {
    expect(play(attemptOf([person('T', { skills: { treachery: 1 } }), ...group(2)]), ['So Many Enemies'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf(group(4)), ['So Many Enemies'])).toMatchObject({ stopped: 1 });
  });

  it('The Big Goodbye kills the selected and stops all unless the group meets its requirements', () => {
    expect(play(attemptOf(group(3)), ['The Big Goodbye'])).toMatchObject({ killed: 1, stopped: 2 });
    expect(play(attemptOf(group(3, { skills: { diplomacy: 1, engineer: 1, medical: 1 } })), ['The Big Goodbye'])).toMatchObject({ killed: 0, stopped: 1 });
  });

  it('places no title of no effect in a stack', () => {
    for (const title of ['Skeleton Crew', 'The Dreamer and the Dream', 'The Clown: Go Away', 'Stripped Down', 'Temporal Conduit', 'Shipboard Fire', 'Shared Hallucination']) {
      expect(REGISTRY.get(title)!.family).toBe('no-effect');
    }
  });
});

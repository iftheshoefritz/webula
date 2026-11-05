import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileTable, costOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botPileOf, pilePersonnelOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';

// The Championship titles of batch 1 (#1515): the coverage of the Championship piles, the plays of their
// own, the new families, and the bot-side titles of #1320 with their assumptions and labels, each worked
// out by hand.

const ROOT = process.cwd();
const DIR = join(ROOT, 'championship-decks');
const FILES: string[] = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf-8')).map((r: { file: string }) => r.file);
const deckText = (file: string) => readFileSync(join(DIR, file), 'utf-8');

const BATCH_1 = [
  'Breaking the Ice', 'Causal Recursion', 'Dead Ringer', 'Frozen by Fear', 'Flare of Rage', 'A Bad Case of par\'Mach',
  'Blended', 'Arresting Display', 'A Taste of Armageddon', 'Ardent Predator', 'Divergent Goals', 'Assassination Attempt',
  'Compromised Experiment', 'Cornered', 'Dead Weight', 'Dignitaries and Witnesses', 'Distress Call', 'A Klingon Matter',
  'A Pattern of Lies', 'Adversarial Trial', 'Alluring Spy', 'Artificial Wormhole', 'Clashing Values', 'Code Forty-Seven',
  'Dangerous Liaisons', 'Edo Probe', 'Elemental Instability', 'Family', 'Formal Hearing', 'Accelerated Aging',
  'Aceton Assimilators', 'After Action Report', 'Arena', 'Bread and Circuses', 'Bynars\' Password', 'Captain\'s Holiday',
  'Conflict of Interests', 'Contaminating a Culture', 'Covert Ambush', 'Cultural Differences', 'Derelict Robot',
  'Disgraceful Assault', 'Distraction', 'Dramatis Personae', 'Exposed Power Relay', 'Ferengi Locator Bomb',
  'Financial Pitfall', 'Galileo Grounded',
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
}

function person(name: string, { attrs = [5, 5, 5], skills = {}, printedSkills, cost = 3, species = ['human'], icons, keywords, firstSkill }: PersonOptions = {}): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  const printed = printedSkills ? BOT_SKILLS.map((s) => printedSkills[s] ?? 0) : levels.slice();
  return {
    name,
    cost,
    attrs: [...attrs] as [number, number, number],
    skills: levels,
    species,
    affiliation: 'federation',
    skillDots: Object.keys(skills).length,
    hologram: false,
    printed: { skills: printed, attrs: [...attrs] as [number, number, number] },
    ...(icons || keywords
      ? { traits: { name: name.toLowerCase(), affiliation: 'federation', species, keywords: keywords ?? [], icons: icons ?? [], skills: levels.slice() } }
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

const traceOf = (attempt: PileAttempt, titles: string[], seed = 1): string[] => {
  const lines: string[] = [];
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), seededRandom(seed), (l) => lines.push(l));
  return lines;
};

const group = (n: number, opts: PersonOptions = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
const cost = (title: string, attempt: PileAttempt) => costOf(REGISTRY.get(title)!, attempt);
const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);

describe('the registry against the Championship piles', () => {
  it('has a model of every title of batch 1', () => {
    expect(BATCH_1).toHaveLength(48);
    expect(BATCH_1.filter((t) => !REGISTRY.has(t))).toEqual([]);
  });

  it.each(FILES)('lacks no title of batch 1 in %s', (file) => {
    const pile = botPileOf(deckText(file));
    expect(pile.missing.filter((t) => BATCH_1.includes(t))).toEqual([]);
    expect(pile.played).not.toContain('Edo Probe');
  });

  it('takes Edo Probe out of the pile', () => {
    expect(REGISTRY.get('Edo Probe')!.status).toBe('ignore');
    const withProbe = FILES.filter((f) => /\tEdo Probe\s*$/m.test(deckText(f)));
    expect(withProbe.length).toBeGreaterThan(0);
    for (const file of withProbe) expect(botPileOf(deckText(file)).ignored).toContain('Edo Probe');
  });
});

describe('the bot-side titles of #1320', () => {
  it('A Taste of Armageddon kills two personnel with a required skill and labels the discard', () => {
    const attempt = attemptOf([...group(3, { skills: { medical: 1 } }), person('None')], { requirements: 'Medical' });
    const result = play(attempt, ['A Taste of Armageddon']);
    expect(result).toMatchObject({ killed: 2, stopped: 0 });
    expect(labelsOf(result)).toEqual(['Discarded an interrupt']);
    expect(REGISTRY.get('A Taste of Armageddon')).toMatchObject({ category: '4f', assumption: 'the bot always discards an interrupt, so a second personnel is killed' });
  });

  it('A Taste of Armageddon does nothing, and labels nothing, when no personnel has a required skill', () => {
    const result = play(attemptOf(group(3), { requirements: 'Medical' }), ['A Taste of Armageddon']);
    expect(result).toMatchObject({ killed: 0 });
    expect(labelsOf(result)).toEqual([]);
  });

  it('Adversarial Trial stops an Anthropology personnel and returns one: you have more points', () => {
    const result = play(attemptOf([person('Anthro', { skills: { anthropology: 1 } }), ...group(2)], { table: { score: 5 } }), ['Adversarial Trial']);
    expect(result).toMatchObject({ stopped: 1, returned: 1 });
    expect(labelsOf(result)).toEqual(['You have more points']);
    expect(REGISTRY.get('Adversarial Trial')).toMatchObject({ category: '2' });
    expect(REGISTRY.get('Adversarial Trial')!.assumption).toContain('at 0 points you are not ahead');
  });

  it('Adversarial Trial returns no personnel at 0 points: you are not ahead (#1541)', () => {
    const result = play(attemptOf([person('Anthro', { skills: { anthropology: 1 } }), ...group(2)], { table: { score: 0 } }), ['Adversarial Trial']);
    expect(result).toMatchObject({ stopped: 1, returned: 0 });
    expect(labelsOf(result)).toEqual([]);
  });

  it('Aceton Assimilators stops the one personnel the player chooses, and names itself', () => {
    const result = play(attemptOf(group(4)), ['Aceton Assimilators']);
    expect(result).toMatchObject({ stopped: 1 });
    expect(labelsOf(result)).toEqual(['Named Aceton Assimilators']);
    expect(REGISTRY.get('Aceton Assimilators')).toMatchObject({ category: '3', assumption: 'the bot names Aceton Assimilators, and one copy is beneath your missions' });
  });

  it('Conflict of Interests plays its "unless" only, with no label', () => {
    const result = play(attemptOf(group(3)), ['Conflict of Interests']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual([]);
    expect(play(attemptOf(group(3, { attrs: [13, 5, 5] })), ['Conflict of Interests'])).toMatchObject({ stopped: 0 });
    expect(REGISTRY.get('Conflict of Interests')).toMatchObject({ category: '4g', assumption: 'the bot plays the "unless" only; the return to its pile is dropped' });
  });

  it('Formal Hearing costs 1: the core holds 6 events', () => {
    expect(cost('Formal Hearing', attemptOf(group(3)))).toBe(1);
    expect(REGISTRY.get('Formal Hearing')).toMatchObject({ category: '1', assumption: 'the bot\'s core holds 6 events' });
    expect(play(attemptOf(group(5)), ['Formal Hearing'])).toMatchObject({ stopped: 3 });
  });
});

describe('the costs that read the table', () => {
  it('Frozen by Fear and Flare of Rage cost 1 less for each Persistent dilemma beneath the mission', () => {
    for (const title of ['Frozen by Fear', 'Flare of Rage']) {
      expect(cost(title, attemptOf(group(3)))).toBe(5);
      expect(cost(title, attemptOf(group(3), { table: { persistentUnderMission: 2 } }))).toBe(3);
      expect(cost(title, attemptOf(group(3), { table: { persistentUnderMission: 7 } }))).toBe(0);
    }
  });

  it('Frozen by Fear removes two from the game, counted as killed', () => {
    expect(play(attemptOf(group(4)), ['Frozen by Fear'])).toMatchObject({ killed: 2 });
  });

  it('Distress Call costs 3 less for each completed mission, and stops all', () => {
    expect(cost('Distress Call', attemptOf(group(3)))).toBe(9);
    expect(cost('Distress Call', attemptOf(group(3), { table: { completedMissions: 2 } }))).toBe(3);
    expect(cost('Distress Call', attemptOf(group(3), { table: { completedMissions: 4 } }))).toBe(0);
    expect(play(attemptOf(group(3)), ['Distress Call'])).toMatchObject({ stopped: 3 });
  });

  it('After Action Report stops one per completed mission', () => {
    expect(play(attemptOf(group(4), { table: { completedMissions: 2 } }), ['After Action Report'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf(group(4)), ['After Action Report'])).toMatchObject({ stopped: 0 });
  });

  it('Compromised Experiment stops as many as the highest Decay among your events', () => {
    expect(play(attemptOf(group(4), { table: { eventDecayMax: 2 } }), ['Compromised Experiment'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf(group(4)), ['Compromised Experiment'])).toMatchObject({ stopped: 0 });
  });

  it('Cornered kills two unless a completed mission has span 4 or more', () => {
    expect(play(attemptOf(group(4)), ['Cornered'])).toMatchObject({ killed: 2 });
    expect(play(attemptOf(group(4), { table: { completedSpan4Mission: true } }), ['Cornered'])).toMatchObject({ killed: 0 });
  });

  it('Galileo Grounded stops all unless a staffed ship is at the mission', () => {
    expect(play(attemptOf(group(3)), ['Galileo Grounded'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf(group(3), { table: { staffedShipAtMission: true } }), ['Galileo Grounded'])).toMatchObject({ stopped: 0 });
  });

  it('Elemental Instability kills one per Trellium-D, then the player stops two [Cmd] personnel', () => {
    const crew = [...group(2), ...group(2, { icons: ['[cmd]'] }).map((p, k) => ({ ...p, name: `Cmd${k}` }))];
    expect(play(attemptOf(crew, { table: { trelliumD: 1 } }), ['Elemental Instability'])).toMatchObject({ killed: 1, stopped: 2 });
    expect(play(attemptOf(crew), ['Elemental Instability'])).toMatchObject({ killed: 0, stopped: 2 });
    expect(play(attemptOf(crew.map((p) => ({ ...p, skills: BOT_SKILLS.map((s) => (s === 'engineer' || s === 'science' ? 1 : 0)) }))), ['Elemental Instability']))
      .toMatchObject({ stopped: 0 });
  });

  it('Family places the personnel on the bottom of the deck, counted as killed, unless the hand reveals an Honor personnel', () => {
    expect(play(attemptOf(group(3)), ['Family'])).toMatchObject({ killed: 1, stopped: 0 });
    const hand = [{ skills: [BOT_SKILLS.indexOf('honor')], strength: 5 }];
    expect(play(attemptOf(group(3), { table: { hand } }), ['Family'])).toMatchObject({ killed: 0, stopped: 1 });
  });
});

describe('the new families', () => {
  it('select-each-without: Assassination Attempt kills the selected with no Treachery', () => {
    expect(play(attemptOf(group(2)), ['Assassination Attempt'])).toMatchObject({ killed: 2 });
    expect(play(attemptOf([person('T', { skills: { treachery: 1 } }), person('N')]), ['Assassination Attempt'])).toMatchObject({ killed: 1 });
  });

  it('select-each-without: Clashing Values and Derelict Robot stop the selected that lack both skills', () => {
    expect(play(attemptOf([person('S', { skills: { science: 1 } }), ...group(2)]), ['Clashing Values'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf([person('E', { skills: { engineer: 1 } }), ...group(2)]), ['Derelict Robot'])).toMatchObject({ stopped: 2 });
  });

  it('unless-selected: Ardent Predator reads only the two selected', () => {
    // Strength 5 + 5 = 10 is not >13, and there is no Exobiology: both are killed.
    expect(play(attemptOf(group(2)), ['Ardent Predator'])).toMatchObject({ killed: 2 });
    expect(play(attemptOf(group(2, { attrs: [5, 5, 7] })), ['Ardent Predator'])).toMatchObject({ killed: 0 });
    expect(play(attemptOf(group(2, { skills: { exobiology: 1 }, attrs: [5, 6, 5] })), ['Ardent Predator'])).toMatchObject({ killed: 0 });
  });

  it('unless-selected: Divergent Goals reads the unselected personnel too', () => {
    // Three personnel: all are selected, the unselected are none, and nobody has Anthropology.
    const skilled = { skills: { biology: 1, officer: 1, transporters: 1 } };
    expect(play(attemptOf(group(3, skilled)), ['Divergent Goals'])).toMatchObject({ stopped: 3 });
    // Five: the two unselected have Biology, Officer, and 2 Transporters.
    expect(play(attemptOf(group(5, skilled)), ['Divergent Goals'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf(group(3, { skills: { anthropology: 1, geology: 1 }, attrs: [6, 5, 5] })), ['Divergent Goals'])).toMatchObject({ stopped: 0 });
  });

  it('a skill required by this mission: Dead Weight stops every personnel with none', () => {
    const crew = [person('Doc', { skills: { medical: 1 } }), ...group(2)];
    expect(play(attemptOf(crew, { requirements: 'Medical or Navigation' }), ['Dead Weight'])).toMatchObject({ stopped: 2 });
  });
});

describe('the plays of their own', () => {
  it('A Klingon Matter kills a selected personnel with Strength<7 and stops the others; Strength 7 spares all', () => {
    expect(play(attemptOf(group(3)), ['A Klingon Matter'])).toMatchObject({ killed: 1, stopped: 2 });
    expect(play(attemptOf(group(3, { attrs: [5, 5, 7] })), ['A Klingon Matter'])).toMatchObject({ killed: 0, stopped: 0 });
  });

  it('A Pattern of Lies stops all three of one species, and one otherwise', () => {
    expect(play(attemptOf(group(3)), ['A Pattern of Lies'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf([...group(2), person('V', { species: ['vulcan'] })]), ['A Pattern of Lies'])).toMatchObject({ stopped: 1 });
  });

  it('Alluring Spy stops a Security personnel, and nothing with none', () => {
    const r = play(attemptOf([person('Sec', { skills: { security: 1 } }), ...group(2)]), ['Alluring Spy']);
    expect(r).toMatchObject({ stopped: 1 });
    expect(play(attemptOf(group(3)), ['Alluring Spy'])).toMatchObject({ stopped: 0 });
  });

  it('Artificial Wormhole reads printed skills, and moves the ship with every personnel aboard, the stopped too', () => {
    const gained = group(2, { skills: { leadership: 1, officer: 1 }, printedSkills: {} });
    expect(play(attemptOf(gained), ['Artificial Wormhole'])).toMatchObject({ moved: 2, shipLost: 0 });
    const printed = group(2, { skills: { leadership: 1, officer: 1 } });
    expect(play(attemptOf(printed), ['Artificial Wormhole'])).toMatchObject({ moved: 0 });
    // Aceton Assimilators stops one first; the ship still takes all three.
    expect(play(attemptOf(group(3)), ['Aceton Assimilators', 'Artificial Wormhole'])).toMatchObject({ stopped: 1, moved: 3 });
  });

  it('Code Forty-Seven stops one [Cmd] personnel, and nothing with none', () => {
    const crew = [person('Cmd', { icons: ['[cmd]'] }), person('Cmd2', { icons: ['[cmd]'] }), person('N')];
    expect(play(attemptOf(crew), ['Code Forty-Seven'])).toMatchObject({ stopped: 1 });
    expect(play(attemptOf(group(3)), ['Code Forty-Seven'])).toMatchObject({ stopped: 0 });
  });

  it('Dignitaries and Witnesses stops all unless an Admiral or a General attempts', () => {
    expect(play(attemptOf(group(3)), ['Dignitaries and Witnesses'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf([person('Adm', { keywords: ['admiral'] }), ...group(2)]), ['Dignitaries and Witnesses'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf(group(3, { skills: { leadership: 1 } })), ['Dignitaries and Witnesses'])).toMatchObject({ stopped: 0 });
  });

  it('Arena moves a personnel with total attributes of 18 or less, and spares one above', () => {
    expect(play(attemptOf(group(2)), ['Arena'])).toMatchObject({ moved: 1 });
    expect(play(attemptOf(group(2, { attrs: [7, 7, 5] })), ['Arena'])).toMatchObject({ moved: 0 });
  });

  it('Accelerated Aging fails a requirement only a first-listed skill met', () => {
    const doc = person('Doc', { skills: { medical: 1, science: 1 }, firstSkill: 'medical' });
    const attempt = attemptOf([doc, ...group(2)], { requirements: 'Medical' });
    expect(play(attempt, [])).toMatchObject({ fail: false });
    expect(play(attempt, ['Accelerated Aging'])).toMatchObject({ fail: true });
    const late = person('Doc', { skills: { science: 1, medical: 1 }, firstSkill: 'science' });
    expect(play(attemptOf([late], { requirements: 'Medical' }), ['Accelerated Aging'])).toMatchObject({ fail: false });
  });

  it('Accelerated Aging blocks the first-listed skill for a later dilemma too', () => {
    const geo = group(3, { skills: { geology: 1 }, firstSkill: 'geology' });
    expect(play(attemptOf(geo), ['Breaking the Ice'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf(geo), ['Accelerated Aging', 'Breaking the Ice'])).toMatchObject({ stopped: 3 });
  });

  it('pilePersonnelOf records the first-listed skill', () => {
    const row = { originalName: 'D', name: 'D', cost: '2', integrity: '6', cunning: '6', strength: '6', skills: '2 Science, Medical' };
    expect(pilePersonnelOf(row).firstSkill).toBe(BOT_SKILLS.indexOf('science'));
  });

  it('Bread and Circuses ignores the skills of a cost-1 personnel for its own check, but not for a later dilemma', () => {
    const skills = { archaeology: 1, diplomacy: 1, honor: 1 };
    expect(play(attemptOf([person('Cheap', { skills, cost: 1 })]), ['Bread and Circuses'])).toMatchObject({ stopped: 1 });
    expect(play(attemptOf([person('Dear', { skills, cost: 2 })]), ['Bread and Circuses'])).toMatchObject({ stopped: 0 });
    // The cost-3 personnel meets Bread and Circuses; the cost-1 one's 3 Geology then meets Breaking the Ice.
    const crew = [person('Dear', { skills }), person('Cheap', { skills: { geology: 3 }, cost: 1 })];
    expect(play(attemptOf(crew), ['Bread and Circuses', 'Breaking the Ice'])).toMatchObject({ stopped: 0 });
  });

  it('Bynars\' Password: the bot stops an Engineer, with none all are stopped, and a 2 Engineer personnel prevents it', () => {
    expect(play(attemptOf([person('E', { skills: { engineer: 1 } }), ...group(2)]), ['Bynars\' Password'])).toMatchObject({ stopped: 1 });
    expect(play(attemptOf(group(3)), ['Bynars\' Password'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf([person('E', { skills: { engineer: 2 } }), ...group(2)]), ['Bynars\' Password'])).toMatchObject({ stopped: 0 });
  });

  it('Disgraceful Assault kills one and stops all, or only stops one with Biology and 2 Medical', () => {
    expect(play(attemptOf(group(3)), ['Disgraceful Assault'])).toMatchObject({ killed: 1, stopped: 2 });
    const medical = [person('Bio', { skills: { biology: 1 } }), ...group(2, { skills: { medical: 1 } })];
    expect(play(attemptOf(medical), ['Disgraceful Assault'])).toMatchObject({ killed: 0, stopped: 1 });
    expect(play(attemptOf([person('S', { skills: { security: 2, transporters: 1 } })]), ['Disgraceful Assault'])).toMatchObject({ killed: 0, stopped: 0 });
  });

  it('Distraction stops personnel until their costs total 4, or all of them', () => {
    expect(play(attemptOf(group(3, { cost: 2 })), ['Distraction'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf(group(2, { cost: 1 })), ['Distraction'])).toMatchObject({ stopped: 2 });
  });

  it('Dramatis Personae: the bot kills the worse of the fewest-[SD] and the lowest-attributes personnel', () => {
    const strong = person('Strong', { skills: { medical: 1 }, attrs: [9, 9, 9] });
    const weak = person('Weak', { skills: { medical: 1, honor: 1, law: 1 }, attrs: [2, 2, 2] });
    const mid = person('Mid', { skills: { medical: 1, honor: 1, law: 1 } });
    const attempt = attemptOf([strong, weak, mid]);
    expect(play(attempt, ['Dramatis Personae'])).toMatchObject({ killed: 1 });
    expect(traceOf(attempt, ['Dramatis Personae'])).toContain('  kills Strong');
  });

  it('Exposed Power Relay stops one with 8 left, kills 2 with 9 left, and 3 with 10 left', () => {
    expect(play(attemptOf(group(9)), ['Exposed Power Relay'])).toMatchObject({ stopped: 1, killed: 0 });
    expect(play(attemptOf(group(10)), ['Exposed Power Relay'])).toMatchObject({ killed: 2 });
    expect(play(attemptOf(group(11)), ['Exposed Power Relay'])).toMatchObject({ killed: 3 });
  });

  it('Dead Ringer stops all: your discard pile is not on the table', () => {
    expect(play(attemptOf(group(3)), ['Dead Ringer'])).toMatchObject({ stopped: 3 });
  });
});

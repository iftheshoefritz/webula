import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileShip, PileTable, costOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { isLegalPileStack } from '../../../../lib/dilemmaBot/pile/search';

// The Championship titles of batch 2 (#1516): the coverage of the Championship piles, the plays of their
// own, the new families, and the bot-side titles of #1320 with their assumptions and labels, each worked
// out by hand.

const ROOT = process.cwd();
const DIR = join(ROOT, 'championship-decks');
const FILES: string[] = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf-8')).map((r: { file: string }) => r.file);
const deckText = (file: string) => readFileSync(join(DIR, file), 'utf-8');

const BATCH_2 = [
  'Rapid Progress', 'Morphogenic Virus', 'Gorgan', 'Overindulgence', 'Pivotal Destiny', 'Infestation', 'Prisoner of the Exile',
  'New Face', 'Neurogenic Field', 'If Shoe Fits, Wear It!', 'Night Terrors', 'Local Trouble', 'Infinite Diversity',
  'Parallel Romance', 'Greater Needs', 'Hazardous Materials', 'Organ Theft', 'Overwhelmed', 'Interstellar Exigence',
  'Reflections', 'Picking Up the Pieces', 'Psychokinetic Control', 'Rush Job', 'Malfunctioning Generator', 'Revealed',
  'Hall of Mirrors', 'Isolated Detachment', 'Lending a Hand', 'Mr. Tricorder', 'Mugato', 'Murder Investigation',
  'Pest Control', 'Rascals', 'Heart to Heart', 'Information Extraction', 'Journey to the Past', 'Lack of Preparation',
  'Left Behind', 'Logical Solution', 'Macrovirus', 'Manufactured Triumph', 'Name and Shame', 'Neural Parasites',
  'Nose to Nose', 'Oh No!', 'Ostensible Malfunction', 'Pattern Loss', 'Quarren Labor Shortage',
];

interface PersonOptions {
  attrs?: [number, number, number];
  skills?: Record<string, number>;
  printedSkills?: Record<string, number>;
  cost?: number;
  species?: string[];
  affiliation?: string;
}

function person(name: string, { attrs = [5, 5, 5], skills = {}, printedSkills, cost = 3, species = ['human'], affiliation = 'federation' }: PersonOptions = {}): PilePersonnel {
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

const ship = (over: Partial<PileShip> = {}): PileShip => ({ name: 'Ship', range: 8, weapons: 6, shields: 6, ...over });
const space = (personnel: PilePersonnel[], over: Parameters<typeof attemptOf>[1] = {}) =>
  attemptOf(personnel, { mission: { kind: 'space', points: 35, span: 2, nebula: false }, ship: ship(), ...over });

const play = (attempt: PileAttempt, titles: string[], seed = 1): PileResult =>
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), seededRandom(seed));

const group = (n: number, opts: PersonOptions = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
const cost = (title: string, attempt: PileAttempt) => costOf(REGISTRY.get(title)!, attempt);
const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);

describe('the registry against the Championship piles', () => {
  it('has a model of every title of batch 2', () => {
    expect(BATCH_2).toHaveLength(48);
    expect(BATCH_2.filter((t) => !REGISTRY.has(t))).toEqual([]);
  });

  it.each(FILES)('lacks no title of batch 2 in %s', (file) => {
    expect(botPileOf(deckText(file)).missing.filter((t) => BATCH_2.includes(t))).toEqual([]);
  });
});

describe('Infestation', () => {
  it('lets a stack hold two copies when two were drawn, and no other title', () => {
    const attempt = attemptOf(group(4));
    expect(isLegalPileStack(attempt, ['Infestation', 'Infestation'], ['Infestation', 'Infestation'], 9)).toBe(true);
    expect(isLegalPileStack(attempt, ['Infestation', 'Infestation'], ['Infestation'], 9)).toBe(false);
    expect(isLegalPileStack(attempt, ['Gorgan', 'Gorgan'], ['Gorgan', 'Gorgan'], 9)).toBe(false);
  });

  it('stops the personnel the player chooses, once per copy', () => {
    expect(play(attemptOf(group(4)), ['Infestation', 'Infestation'])).toMatchObject({ stopped: 2 });
  });
});

describe('the bot-side titles of #1320', () => {
  it('Rapid Progress names the first 2 nameable skills the group lacks, and stops all', () => {
    const result = play(attemptOf(group(3)), ['Rapid Progress']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual(['Removed 2 card types. Named Anthropology, Archaeology']);
    expect(REGISTRY.get('Rapid Progress')).toMatchObject({ category: '6', assumption: 'the bot removes 2 card types and names 2 skills you lack' });
  });

  it('Gorgan stops all and labels a card one more than the dearest in the hand', () => {
    const result = play(attemptOf(group(3), { table: { handCostMax: 6 } }), ['Gorgan']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual(['Discarded a card of cost 7']);
    expect(labelsOf(play(attemptOf(group(3)), ['Gorgan']))).toEqual(['Discarded a card']);
    expect(REGISTRY.get('Gorgan')).toMatchObject({ category: '4d', assumption: 'the bot discards a card one more than the dearest card in your hand, so all are stopped' });
  });

  it('Infinite Diversity names a skill the group lacks and stops all', () => {
    const attempt = attemptOf([person('A', { skills: { anthropology: 1, science: 1 } }), ...group(2)]);
    const result = play(attempt, ['Infinite Diversity']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual(['Discarded 2 cards. Named Archaeology']);
    expect(REGISTRY.get('Infinite Diversity')).toMatchObject({ category: '4b', assumption: 'the bot always discards 2 cards and names a skill you lack' });
  });

  it('Infinite Diversity has no effect on a group with Anthropology and every skill', () => {
    const every = Object.fromEntries(BOT_SKILLS.map((s) => [s, 1]));
    const result = play(attemptOf([person('All', { skills: every }), ...group(2)]), ['Infinite Diversity']);
    expect(result).toMatchObject({ stopped: 0 });
    expect(labelsOf(result)).toEqual(['Discarded 2 cards. Named Anthropology']);
  });

  it('Manufactured Triumph discards one more species than the group has, up to 3', () => {
    const one = play(attemptOf(group(3)), ['Manufactured Triumph']);
    expect(one).toMatchObject({ stopped: 3 });
    expect(labelsOf(one)).toEqual(['Discarded 2 personnel: Acamarian, Aenar']);
    const two = play(attemptOf([...group(2), person('V', { species: ['vulcan'] })]), ['Manufactured Triumph']);
    expect(labelsOf(two)).toEqual(['Discarded 3 personnel: Acamarian, Aenar, Alien']);
    const three = play(attemptOf([...group(2), person('V', { species: ['vulcan'] }), person('B', { species: ['bajoran'] })]), ['Manufactured Triumph']);
    expect(three).toMatchObject({ stopped: 0 });
    expect(labelsOf(three)).toEqual([]);
    expect(REGISTRY.get('Manufactured Triumph')).toMatchObject({ category: '4b', assumption: 'the bot discards one more species than you have, up to 3' });
  });

  it('Hazardous Materials kills two for 2 Trellium-D', () => {
    const result = play(space(group(4)), ['Hazardous Materials']);
    expect(result).toMatchObject({ killed: 2 });
    expect(labelsOf(result)).toEqual(['2 Trellium-D']);
    expect(REGISTRY.get('Hazardous Materials')).toMatchObject({ category: '5b', assumption: 'the bot commands 2 Trellium-D, so two personnel are killed' });
  });

  it('Organ Theft kills one only when a copy is on the mission', () => {
    expect(play(attemptOf(group(3), { table: { onMission: ['Organ Theft'] } }), ['Organ Theft'])).toMatchObject({ killed: 1 });
    const none = play(attemptOf(group(3)), ['Organ Theft']);
    expect(none).toMatchObject({ killed: 0, stopped: 0 });
    expect(labelsOf(none)).toEqual([]);
    expect(REGISTRY.get('Organ Theft')).toMatchObject({ category: '8', status: 'play', family: 'random-select' });
  });

  it('Macrovirus kills the selected personnel, or only stops it with 2 Exobiology and 2 Science', () => {
    expect(play(attemptOf(group(3)), ['Macrovirus'])).toMatchObject({ killed: 1, stopped: 0 });
    const scientists = group(2, { skills: { exobiology: 1, science: 1 } });
    expect(play(attemptOf([...scientists, person('C')]), ['Macrovirus'])).toMatchObject({ killed: 0, stopped: 1 });
    expect(REGISTRY.get('Macrovirus')).toMatchObject({ category: '8', assumption: 'the stop and the kill only' });
  });

  it('Interstellar Exigence stops the Law personnel and two more for 2 headquarters', () => {
    const result = play(attemptOf([person('Law', { skills: { law: 1 } }), ...group(3)]), ['Interstellar Exigence']);
    expect(result).toMatchObject({ stopped: 3 });
    expect(labelsOf(result)).toEqual(['2 headquarters']);
    expect(play(attemptOf(group(4)), ['Interstellar Exigence'])).toMatchObject({ stopped: 2 });
    expect(REGISTRY.get('Interstellar Exigence')).toMatchObject({ category: '3', assumption: 'the bot commands 2 headquarters missions' });
  });

  it('Information Extraction stops one and adds 10 to an attribute requirement for 5 points', () => {
    // Three personnel of Cunning 5 meet Cunning>10 with two left, but not Cunning>20.
    const attempt = attemptOf(group(3, { skills: { medical: 1 } }), { requirements: 'Medical and Cunning>10' });
    const result = play(attempt, ['Information Extraction']);
    expect(result).toMatchObject({ stopped: 1, fail: true });
    expect(labelsOf(result)).toEqual(['Lost 5 points']);
    expect(REGISTRY.get('Information Extraction')).toMatchObject({ category: '2', assumption: 'the bot loses 5 points whenever the mission has an attribute requirement' });
  });

  it('Information Extraction takes no option with no attribute requirement, and reads no gained skill', () => {
    const noAttr = play(attemptOf(group(3, { skills: { medical: 1 } }), { requirements: 'Medical' }), ['Information Extraction']);
    expect(noAttr).toMatchObject({ stopped: 1, fail: false });
    expect(labelsOf(noAttr)).toEqual([]);
    const printed = person('Spy', { skills: { intelligence: 1, officer: 1, programming: 1 } });
    expect(play(attemptOf([printed, ...group(2)]), ['Information Extraction'])).toMatchObject({ stopped: 0 });
    const gained = person('Spy', { skills: { intelligence: 1, officer: 1, programming: 1 }, printedSkills: {} });
    expect(play(attemptOf([gained, ...group(2)]), ['Information Extraction'])).toMatchObject({ stopped: 1 });
  });

  it('Reflections reveals 3 cards per turn and stops one per event or interrupt', () => {
    const all = play(space(group(12), { table: { turn: 3, drawDeck: { size: 20, eventsAndInterrupts: 20 } } }), ['Reflections']);
    expect(all).toMatchObject({ stopped: 9 });
    expect(labelsOf(all)).toEqual(['9 [AU] cards', 'Chose P0, P1, P2, P3, P4, P5, P6, P7, P8']);
    expect(play(space(group(12), { table: { turn: 3, drawDeck: { size: 20, eventsAndInterrupts: 0 } } }), ['Reflections'])).toMatchObject({ stopped: 0 });
    expect(REGISTRY.get('Reflections')).toMatchObject({ category: '5b', assumption: 'the bot commands 3 [AU] cards for each turn of the game' });
  });

  it('Revealed stops the two the player chooses with a ship at the mission, and kills them with none', () => {
    const result = play(attemptOf(group(4)), ['Revealed']);
    expect(result).toMatchObject({ stopped: 2, killed: 0 });
    expect(labelsOf(result)).toEqual(['Revealed a personnel with 2 Treachery']);
    expect(play(attemptOf(group(4), { table: { shipAtMission: false } }), ['Revealed'])).toMatchObject({ stopped: 0, killed: 2 });
    expect(REGISTRY.get('Revealed')).toMatchObject({ category: '5c', assumption: 'the bot reveals a personnel with 2 Treachery' });
  });
});

describe('the plays of their own', () => {
  // Pest Control: unless 2 Engineer and 2 Exobiology or Transporters, 2 Treachery, and Cunning>34.
  const pestGroup = () => [
    person('T', { skills: { transporters: 1 }, attrs: [5, 12, 5] }),
    person('R', { skills: { treachery: 2 }, attrs: [5, 12, 5] }),
    person('C', { attrs: [5, 12, 5] }),
  ];

  it('Pattern Loss makes a later Transporters check need one more level of each skill', () => {
    expect(play(space(pestGroup()), ['Pest Control'])).toMatchObject({ stopped: 0 });
    expect(play(space(pestGroup()), ['Pattern Loss', 'Pest Control'])).toMatchObject({ stopped: 2 });
    expect(play(space(pestGroup(), { table: { onMission: ['Pattern Loss'] } }), ['Pest Control'])).toMatchObject({ stopped: 2 });
  });

  it('Psychokinetic Control removes a gained skill from a later check', () => {
    const medic = person('M', { skills: { biology: 2, medical: 2 }, printedSkills: {} });
    expect(play(attemptOf([medic, ...group(2)]), ['Mugato'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf([medic, ...group(2)]), ['Psychokinetic Control', 'Mugato'])).toMatchObject({ stopped: 2 });
  });

  it('Parallel Romance raises every attribute by the personnel it stopped', () => {
    // Two of Cunning 5 left: 10 with no bonus, 14 with +2.
    const result = play(attemptOf(group(4), { requirements: 'Cunning>12' }), ['Parallel Romance']);
    expect(result).toMatchObject({ stopped: 2, fail: false });
    expect(play(attemptOf(group(4), { requirements: 'Cunning>12' }), ['Psychokinetic Control', 'Parallel Romance'])).toMatchObject({ fail: true });
  });

  it('Lack of Preparation ends the stack unless the group has the skills of the mission', () => {
    const lacking = play(attemptOf(group(3), { requirements: 'Medical and Cunning>100', table: { handCostMax: 2 } }), ['Lack of Preparation', 'Gorgan']);
    expect(lacking).toMatchObject({ stopped: 0, fail: true });
    expect(labelsOf(lacking)).toEqual([]);
    const ready = play(attemptOf(group(3, { skills: { medical: 1 } }), { requirements: 'Medical and Cunning>100' }), ['Lack of Preparation', 'Gorgan']);
    expect(ready).toMatchObject({ stopped: 3 });
  });

  it('Left Behind moves the two selected unless the others meet a branch', () => {
    expect(play(space(group(2)), ['Left Behind'])).toMatchObject({ moved: 2 });
    expect(play(space(group(4, { skills: { biology: 1, medical: 1 } })), ['Left Behind'])).toMatchObject({ moved: 0 });
    const navigators = group(4, { skills: { navigation: 1, transporters: 1 } });
    expect(play(space(navigators, { ship: ship({ shields: 9 }) }), ['Left Behind'])).toMatchObject({ moved: 0 });
    expect(play(space(navigators, { ship: ship({ shields: 8 }) }), ['Left Behind'])).toMatchObject({ moved: 2 });
  });

  it('Isolated Detachment reads the three selected, then the others', () => {
    const diplomats = group(3, { skills: { diplomacy: 1, programming: 1 }, attrs: [5, 6, 5] });
    expect(play(space(diplomats), ['Isolated Detachment'])).toMatchObject({ stopped: 0 });
    expect(play(space(group(3)), ['Isolated Detachment'])).toMatchObject({ stopped: 3 });
    const engineers = group(6, { skills: { engineer: 1, physics: 1, security: 1 } });
    expect(play(space(engineers), ['Isolated Detachment'])).toMatchObject({ stopped: 0 });
  });

  it('Logical Solution discards the hand, else loses the personnel with the most skill dots, else stops all', () => {
    const crew = [person('Many', { skills: { medical: 1, science: 1, biology: 1 } }), person('Some', { skills: { science: 1 } }), person('None')];
    expect(play(space(crew), ['Logical Solution'])).toMatchObject({ stopped: 0, killed: 0 });
    expect(play(space(crew, { table: { handSize: 0 } }), ['Logical Solution'])).toMatchObject({ stopped: 0, killed: 1 });
    expect(play(space(crew, { requirements: 'Medical', table: { handSize: 0 } }), ['Logical Solution'])).toMatchObject({ stopped: 3, killed: 0 });
  });

  it('Rush Job stops one more for fewer than four icons, and the bot one more with no [Cmd]', () => {
    const staffed = (staffing: string[]) => play(space(group(6), { ship: ship({ staffing }) }), ['Rush Job']);
    expect(play(space(group(6)), ['Rush Job'])).toMatchObject({ stopped: 1 });
    expect(staffed(['[cmd]', '[stf]', '[stf]', '[stf]'])).toMatchObject({ stopped: 1 });
    expect(staffed(['[cmd]', '[stf]'])).toMatchObject({ stopped: 2 });
    expect(staffed(['[stf]', '[stf]', '[stf]', '[stf]'])).toMatchObject({ stopped: 2 });
    expect(staffed(['[stf]'])).toMatchObject({ stopped: 3 });
  });

  it('Mr. Tricorder places the bot\'s choice aboard when the rest still meet the requirements', () => {
    expect(play(attemptOf(group(4)), ['Mr. Tricorder'])).toMatchObject({ stopped: 1 });
    const medic = person('Medic', { skills: { medical: 1 } });
    expect(play(attemptOf([medic, ...group(3)], { requirements: 'Medical' }), ['Mr. Tricorder'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf(group(4), { table: { shipAtMission: false } }), ['Mr. Tricorder'])).toMatchObject({ stopped: 2 });
  });

  it('Overwhelmed stops the personnel whose skills pass a later check', () => {
    const crew = () => [person('B', { skills: { biology: 2 } }), person('M', { skills: { medical: 2 } }), ...group(2)];
    expect(play(attemptOf(crew()), ['Mugato'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf(crew()), ['Overwhelmed', 'Mugato'])).toMatchObject({ stopped: 2 });
  });
});

describe('the new families and the other titles', () => {
  it('New Face stops all three when one has an attribute above 7, else the one the player chooses', () => {
    expect(play(attemptOf([person('Strong', { attrs: [5, 5, 8] }), ...group(2)]), ['New Face'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf(group(3)), ['New Face'])).toMatchObject({ stopped: 1 });
  });

  it('Murder Investigation stops all three when one has Security, else a random one', () => {
    expect(play(attemptOf([person('Sec', { skills: { security: 1 } }), ...group(2)]), ['Murder Investigation'])).toMatchObject({ stopped: 3 });
    expect(play(attemptOf(group(3)), ['Murder Investigation'])).toMatchObject({ stopped: 1 });
  });

  it('Prisoner of the Exile and If Shoe Fits, Wear It! place one personnel in the bot\'s brig', () => {
    expect(play(attemptOf(group(3)), ['Prisoner of the Exile'])).toMatchObject({ brig: 1 });
    expect(play(space(group(3)), ['If Shoe Fits, Wear It!'])).toMatchObject({ brig: 1 });
  });

  it('Heart to Heart and Nose to Nose stop both when they share a skill or a cost', () => {
    expect(play(attemptOf(group(2, { skills: { medical: 1 } })), ['Heart to Heart'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf([person('A', { skills: { medical: 1 } }), person('B', { skills: { science: 1 } })]), ['Heart to Heart'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf(group(2)), ['Nose to Nose'])).toMatchObject({ stopped: 2 });
    expect(play(attemptOf([person('A', { cost: 2 }), person('B', { cost: 3 })]), ['Nose to Nose'])).toMatchObject({ stopped: 0 });
  });

  it('Quarren Labor Shortage stops all unless half the personnel are not [NA]', () => {
    const na = (n: number) => group(n, { affiliation: 'non-aligned' });
    expect(play(attemptOf([...na(2), ...group(2)]), ['Quarren Labor Shortage'])).toMatchObject({ stopped: 0 });
    expect(play(attemptOf([...na(3), ...group(1)]), ['Quarren Labor Shortage'])).toMatchObject({ stopped: 4 });
  });

  it('Rascals kills one per headquarters unless the total cost is under 17', () => {
    expect(play(attemptOf(group(5), { table: { headquarters: 2 } }), ['Rascals'])).toMatchObject({ killed: 0 });
    expect(play(attemptOf(group(6), { table: { headquarters: 2 } }), ['Rascals'])).toMatchObject({ killed: 2 });
  });

  it('Local Trouble reads the ship\'s Weapons and a headquarters in another quadrant', () => {
    const armed = ship({ weapons: 8 });
    expect(play(space(group(4), { ship: armed, table: { headquartersOtherQuadrant: true } }), ['Local Trouble'])).toMatchObject({ killed: 0 });
    expect(play(space(group(4), { ship: armed }), ['Local Trouble'])).toMatchObject({ killed: 2 });
  });

  it('Overindulgence names the skill the group holds most and stops all at five', () => {
    const five = play(attemptOf(group(5, { skills: { medical: 1 } })), ['Overindulgence']);
    expect(five).toMatchObject({ stopped: 5 });
    expect(labelsOf(five)).toEqual(['Named Medical']);
    expect(play(attemptOf(group(4, { skills: { medical: 1 } })), ['Overindulgence'])).toMatchObject({ stopped: 0 });
  });

  it('Name and Shame stops every personnel of the title the bot names', () => {
    const data = () => person('Data', { attrs: [8, 12, 8] });
    const result = play(attemptOf([data(), data(), person('Other')]), ['Name and Shame']);
    expect(result).toMatchObject({ stopped: 2 });
    expect(labelsOf(result)).toEqual(['Named Data']);
  });

  it('Pivotal Destiny and Ostensible Malfunction are drawn and never stacked', () => {
    for (const title of ['Pivotal Destiny', 'Ostensible Malfunction']) expect(REGISTRY.get(title)).toMatchObject({ family: 'no-effect', status: 'play', goesUnder: false });
  });
});

describe('the variable costs', () => {
  it('Name and Shame costs 3', () => {
    expect(cost('Name and Shame', attemptOf(group(3)))).toBe(3);
  });

  it('Morphogenic Virus costs 4 with six non-Dominion personnel, else 0', () => {
    expect(cost('Morphogenic Virus', attemptOf(group(6)))).toBe(4);
    expect(cost('Morphogenic Virus', attemptOf(group(5)))).toBe(0);
    expect(cost('Morphogenic Virus', attemptOf([...group(5), person('Vorta', { affiliation: 'dominion' })]))).toBe(0);
  });

  it('Hall of Mirrors and Malfunctioning Generator cost 1 less per completed mission', () => {
    for (const title of ['Hall of Mirrors', 'Malfunctioning Generator']) {
      expect(cost(title, attemptOf(group(3)))).toBe(4);
      expect(cost(title, attemptOf(group(3), { table: { completedMissions: 1 } }))).toBe(3);
    }
  });

  it('Neural Parasites costs 3 more per completed mission', () => {
    expect(cost('Neural Parasites', attemptOf(group(3)))).toBe(2);
    expect(cost('Neural Parasites', attemptOf(group(3), { table: { completedMissions: 1 } }))).toBe(5);
  });
});

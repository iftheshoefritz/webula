import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, costOf, lastingDamage } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY, discardCap, modelOf, pileTitleOf } from '../../../../lib/dilemmaBot/pile/registry';
import {
  beamPileSearch,
  choosePileStack,
  countPileStacks,
  fullPileSearch,
  isLegalPileStack,
  legalPileStacks,
  rankPileScores,
} from '../../../../lib/dilemmaBot/pile/search';

const ROOT = process.cwd();
const THINK_TANK = "championship-decks/2026 Trek Masters - Think Tank 50's - Matt S.txt";
const CARDASSIAN = 'championship-decks/2026 European Continental - Cardassian in Gamma Quadrant for EM 2026 - Matthias Weller.txt';
const pileText = (file: string) => readFileSync(join(ROOT, file), 'utf-8');

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

function attemptOf(personnel: PilePersonnel[], over: Partial<Omit<PileAttempt, 'requirements'>> & { requirements?: string } = {}): PileAttempt {
  const { requirements = 'Cunning>0', ...rest } = over;
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
    },
    ...rest,
  };
}

const play = (attempt: PileAttempt, titles: string[], seed = 1): PileResult =>
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), seededRandom(seed));

const group = (n: number, opts: Parameters<typeof person>[1] = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));

describe('the registry against the pilot piles', () => {
  it('has a model for every title of Think Tank 50\'s and Cardassian in Gamma Quadrant', () => {
    for (const file of [THINK_TANK, CARDASSIAN]) {
      const pile = botPileOf(pileText(file));
      expect(pile.missing).toEqual([]);
      expect(pile.ignored).toEqual([]);
    }
    expect(botPileOf(pileText(THINK_TANK)).played).toHaveLength(68);
    expect(botPileOf(pileText(CARDASSIAN)).played).toHaveLength(60);
  });

  it('maps every version of a title to one model', () => {
    expect(pileTitleOf('Sylvia *VP')).toBe('Sylvia');
    expect(pileTitleOf('In Development (IDR)')).toBe('In Development');
    expect(pileTitleOf('Outclassed *A')).toBe('Outclassed');
    expect(pileTitleOf("Dragon's Teeth (FOW)")).toBe("Dragon's Teeth");
    expect(pileTitleOf('In Development (SS)')).toBe('In Development');
    expect(pileTitleOf('Timescape (Promo)')).toBe('Timescape');
    expect(pileTitleOf('Stripped Down *AP')).toBe('Stripped Down');
    expect(pileTitleOf('"Rapid Progress"')).toBe('Rapid Progress');
    expect(modelOf('Hard Time *VP')).toBe(REGISTRY.get('Hard Time'));
    const titles = new Set(botPileOf(pileText(THINK_TANK)).played);
    expect(titles.size).toBe(45);
  });

  it('gives each model the type and the printed cost of its card', () => {
    // The dilemma rows of the card data: name, type, dilemma type and cost, read as the TSV stores them.
    const lines = readFileSync(join(ROOT, 'public/cards_with_processed_columns.txt'), 'utf-8').split('\n');
    const cell = (c: string) => c.replace(/^"|"$/g, '');
    const head = lines[0].split('\t').map(cell);
    const at = (name: string) => head.indexOf(name);
    const rows = lines.slice(1).filter(Boolean).map((l) => l.split('\t').map(cell));
    const data = rows
      .filter((r) => r[at('Type')] === 'Dilemma')
      .map((r) => ({ originalName: r[at('Name')], dilemmatype: r[at('DilemmaType')].toLowerCase(), cost: r[at('Cost')] }));
    const kinds: Record<string, string> = { p: 'planet', s: 'space', d: 'dual' };
    for (const model of REGISTRY.values()) {
      const card = data.find((c) => pileTitleOf(c.originalName) === model.title);
      expect(card).toBeDefined();
      expect([model.title, model.kind]).toEqual([model.title, kinds[card!.dilemmatype]]);
      expect([model.title, model.printedCost]).toEqual([model.title, Number(card!.cost)]);
    }
  });
});

describe('the assumptions of #1320', () => {
  const attempt = attemptOf(group(6));

  it('costs Tsiolkovsky Infection, Whisper in the Dark, Sylvia and The Killing Game 2: the core holds 6 events', () => {
    for (const t of ['Tsiolkovsky Infection', 'Whisper in the Dark', 'Sylvia', 'The Killing Game']) expect(costOf(REGISTRY.get(t)!, attempt)).toBe(2);
  });

  it('costs Inequitable Exchange 6 (the bot\'s brig is empty) and Shaken Confidence 4 (no Paranoia event)', () => {
    expect(costOf(REGISTRY.get('Inequitable Exchange')!, attempt)).toBe(6);
    expect(costOf(REGISTRY.get('Shaken Confidence')!, attempt)).toBe(4);
  });

  it('caps the discards of Excalbian Drama at 3 with no completed mission, and 6 with one', () => {
    expect(discardCap(attempt)).toBe(3);
    expect(discardCap({ ...attempt, table: { ...attempt.table, completedMissions: 1 } })).toBe(6);
  });

  it('Excalbian Drama: the bot discards the fewest cards that make the group fail, and says how many', () => {
    // Integrity 6 × 6 = 36: 2 discards make the requirement Integrity>40.
    const result = play(attemptOf(group(6, { attrs: [6, 5, 5] })), ['Excalbian Drama']);
    expect(result.stopped).toBe(6);
    expect(result.labels).toEqual([{ title: 'Excalbian Drama', label: 'Discarded 2 cards' }]);
  });

  it('Excalbian Drama: no discard within the cap of 3 beats Integrity 50, so nothing happens', () => {
    const result = play(attemptOf(group(10, { attrs: [5, 5, 5] })), ['Excalbian Drama']);
    expect(result.stopped).toBe(0);
    expect(result.labels).toEqual([]);
  });
});

describe('the variable costs that read the attempt and the player\'s table', () => {
  it('The Alien\'s Graveyard costs 1 less for each attempting personnel of cost 2 or less', () => {
    const model = REGISTRY.get("The Alien's Graveyard")!;
    expect(costOf(model, attemptOf([...group(2, { cost: 1 }), ...group(3)]))).toBe(4);
  });

  it('Polywater Intoxication costs 3 with six or more personnel, 0 with fewer', () => {
    const model = REGISTRY.get('Polywater Intoxication')!;
    expect(costOf(model, attemptOf(group(6)))).toBe(3);
    expect(costOf(model, attemptOf(group(5)))).toBe(0);
  });

  it('In Development costs 1 less for each headquarters of the player', () => {
    const base = attemptOf(group(4));
    expect(costOf(REGISTRY.get('In Development')!, { ...base, table: { ...base.table, headquarters: 2 } })).toBe(4);
  });
});

describe('the lasting damage', () => {
  it('counts a kill, a hold in the core, a move, the brig and a lost ship personnel 1 each, a return 0.75, a stop 0', () => {
    expect(lastingDamage({ killed: 1, heldInCore: 1, moved: 1, brig: 1, returned: 1, shipLost: 3 })).toBe(7.75);
    expect(lastingDamage({ killed: 0, heldInCore: 0, moved: 0, brig: 0, returned: 0, shipLost: 0 })).toBe(0);
  });
});

describe('the plays, worked out by hand', () => {
  it('An Old Debt kills a Leadership personnel unless the group meets it', () => {
    const leader = person('Leader', { skills: { leadership: 1 } });
    const result = play(attemptOf([leader, ...group(3)]), ['An Old Debt']);
    expect(result.killed).toBe(1);
    const met = play(attemptOf([leader, person('Doc', { skills: { intelligence: 1, medical: 2 } })]), ['An Old Debt']);
    expect(met.killed).toBe(0);
  });

  it('Personal Duty stops all but one of the Leadership or Officer personnel, and all with none', () => {
    expect(play(attemptOf(group(3, { skills: { officer: 1 } })), ['Personal Duty']).stopped).toBe(2);
    expect(play(attemptOf(group(3)), ['Personal Duty']).stopped).toBe(3);
  });

  it('Where No One Has Gone Before loses the ship with every personnel aboard', () => {
    const result = play(attemptOf(group(4), { mission: { kind: 'space', points: 35, span: 2, nebula: false } }), ['Where No One Has Gone Before']);
    expect(result.shipLost).toBe(4);
    expect(lastingDamage(result)).toBe(4);
  });

  it('Where No One Has Gone Before takes every personnel aboard, the stopped ones too', () => {
    const space = { kind: 'space' as const, points: 35, span: 2, nebula: false };
    const result = play(attemptOf(group(4, { skills: { officer: 1 } }), { mission: space }), ['Personal Duty', 'Where No One Has Gone Before']);
    expect(result.stopped).toBe(3);
    expect(result.shipLost).toBe(4);
  });

  it('Dereliction of Duty leaves the printed profile: a gained skill no longer meets the requirements', () => {
    const gained = person('Gained');
    gained.skills[BOT_SKILLS.indexOf('medical')] = 1;
    const attempt = attemptOf([gained], { requirements: 'Medical' });
    expect(play(attempt, []).fail).toBe(false);
    expect(play(attempt, ['Dereliction of Duty']).fail).toBe(true);
  });

  it('Insurrection adds 10 to each attribute requirement below 32 at a mission worth 30 or more', () => {
    const attempt = attemptOf(group(5, { attrs: [5, 5, 5] }), { requirements: 'Cunning>20' });
    expect(play(attempt, ['Insurrection']).fail).toBe(true);
    expect(play({ ...attempt, mission: { ...attempt.mission, points: 25 } }, ['Insurrection']).fail).toBe(false);
  });

  it('Counterinsurgency Program names up to 2 skills the group lacks, says so, and stops all', () => {
    const result = play(attemptOf(group(3)), ['Counterinsurgency Program']);
    expect(result.stopped).toBe(3);
    expect(result.labels).toEqual([{ title: 'Counterinsurgency Program', label: 'Discarded 2 events. Named Anthropology, Archaeology' }]);
  });

  it('Well-Prepared Defenses: the bot chooses the personnel whose stop fails the attempt', () => {
    const doc = person('Doc', { skills: { medical: 1 } });
    const result = play(attemptOf([...group(3), doc], { requirements: 'Medical' }), ['Well-Prepared Defenses']);
    expect(result.fail).toBe(true);
    expect(result.labels[0].label).toBe("Bot's missions: more points");
  });

  it('Triage: the player stops a Medical personnel the mission does not need, else a kill', () => {
    const docs = [person('Doc A', { skills: { medical: 1 } }), person('Doc B', { skills: { medical: 1 } })];
    const result = play(attemptOf(docs, { requirements: 'Medical' }), ['Triage']);
    expect([result.stopped, result.killed, result.fail]).toEqual([1, 0, false]);
    expect(play(attemptOf(group(2)), ['Triage']).killed).toBe(1);
  });
});

describe('legality', () => {
  const planet = attemptOf(group(8));
  const space = attemptOf(group(8), { mission: { kind: 'space', points: 35, span: 2, nebula: false } });

  it('fails a planet dilemma at a space mission, and a space dilemma at a planet mission', () => {
    expect(isLegalPileStack(space, ['Hard Time'], ['Hard Time'], 9)).toBe(false);
    expect(isLegalPileStack(planet, ['Personal Duty'], ['Personal Duty'], 9)).toBe(false);
    expect(isLegalPileStack(space, ['Personal Duty'], ['Personal Duty'], 9)).toBe(true);
  });

  it('fails two copies of a title that does not allow it', () => {
    expect(isLegalPileStack(planet, ['Hard Time', 'Hard Time'], ['Hard Time', 'Hard Time'], 9)).toBe(false);
  });

  it('counts a variable cost at its value for the attempt', () => {
    // Sylvia costs 2 here, not its printed 8.
    expect(isLegalPileStack(planet, ['Sylvia', 'Hard Time'], ['Sylvia', 'Hard Time'], 5)).toBe(true);
    expect(isLegalPileStack(planet, ['Sylvia', 'Hard Time'], ['Sylvia', 'Hard Time'], 4)).toBe(false);
  });

  it('counts the stacks without building them', () => {
    const drawn = ['Hard Time', 'Sylvia', 'Discommendation', 'Polywater Intoxication', 'Personal Duty'];
    for (const n of [2, 4, 6, 9]) expect(countPileStacks(planet, drawn, n)).toBe(legalPileStacks(planet, drawn, n).length);
  });

  it('returns only legal stacks from the search', () => {
    const drawn = botPileOf(pileText(THINK_TANK)).played.slice(0, 9);
    const attempt = attemptOf(group(9, { skills: { medical: 1 } }), { requirements: '2 Medical' });
    const result = choosePileStack(attempt, drawn, 6, 3);
    for (const s of result.ranked) expect(isLegalPileStack(attempt, s.stack, drawn, 6)).toBe(true);
  });

  it('leaves out a title that has no effect during the attempt: it would only add a dilemma beneath the mission', () => {
    expect(legalPileStacks(planet, ['Timescape', 'Hard Time'], 9)).toEqual([[], ['Hard Time']]);
  });

  it('ranks several hundred thousand scores, as the fast search does at N = 12', () => {
    const scores = Array.from({ length: 300000 }, (_, i) => ({ stack: [], pFail: (i % 7) / 10, damage: 0, under: 0, stopped: 0, plays: 1 }));
    expect(rankPileScores(scores).ranked[0].pFail).toBe(0.6);
  });
});

describe('the beam search', () => {
  const pile = botPileOf(pileText(THINK_TANK)).played;
  const attempt = attemptOf(
    [person('Doc', { skills: { medical: 1, science: 1 } }), person('Pilot', { skills: { navigation: 1 } }), ...group(7)],
    { requirements: 'Medical, Navigation and Cunning>30' },
  );

  it('returns legal stacks only, the best first', () => {
    const drawn = pile.slice(0, 12);
    const result = beamPileSearch(attempt, drawn, 9, 1);
    expect(result.method).toBe('beam');
    for (const s of result.ranked) expect(isLegalPileStack(attempt, s.stack, drawn, 9)).toBe(true);
  });

  it('finds a stack as likely to fail as the full search\'s on a small draw', () => {
    const drawn = pile.slice(10, 16);
    const full = fullPileSearch(attempt, legalPileStacks(attempt, drawn, 6), 300, 2, drawn.length);
    const beam = beamPileSearch(attempt, drawn, 6, 2);
    expect(beam.best.pFail).toBeGreaterThanOrEqual(full.best.pFail - 0.05);
  });

  it('scores at most width × titles stacks at each length, however many stacks are legal', () => {
    const drawn = pile.slice(0, 14);
    const legal = countPileStacks(attempt, drawn, 12);
    const result = beamPileSearch(attempt, drawn, 12, 1, { width: 5 });
    expect(legal).toBeGreaterThan(result.stackCount);
    const titles = new Set(drawn).size;
    expect(result.stackCount).toBeLessThanOrEqual(1 + titles + 12 * 5 * titles);
  });

  it('is what choosePileStack uses for every draw, small or large', () => {
    expect(choosePileStack(attempt, pile.slice(0, 2), 2, 1).method).toBe('beam');
    const drawn = pile.slice(0, 14);
    expect(countPileStacks(attempt, drawn, 12)).toBeGreaterThan(500);
    expect(choosePileStack(attempt, drawn, 12, 1).method).toBe('beam');
  });

  it('finds a stack whose first dilemma only sets up the next, as Dereliction of Duty does', () => {
    // The crew meets Where No One Has Gone Before only with the Physics they gain from their game text.
    const space = { kind: 'space' as const, points: 35, span: 2, nebula: false };
    const crew = group(6, { attrs: [6, 6, 6] }).map((p, k) => {
      const skills = { astrometrics: k === 0, navigation: k === 1, physics: k === 2 };
      const levels = BOT_SKILLS.map((name) => (skills[name as keyof typeof skills] ? 1 : 0));
      const printed = levels.slice();
      if (k === 2) printed[BOT_SKILLS.indexOf('physics')] = 0;
      return { ...p, skills: levels, printed: { ...p.printed, skills: printed } };
    });
    const attempt = attemptOf(crew, { mission: space, requirements: 'Cunning>0' });
    const drawn = ['Where No One Has Gone Before', 'Dereliction of Duty', 'Old Differences', 'Cutting Remark', 'Personal Duty'];
    const best = beamPileSearch(attempt, drawn, 6, 1, { width: 2 }).best;
    expect(best.stack.indexOf('Dereliction of Duty')).toBeLessThan(best.stack.indexOf('Where No One Has Gone Before'));
    expect(best.damage).toBe(6);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { DilemmaModel, PileAttempt, PilePersonnel, PileResult, PileTable, stackCostOf } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { beamPileSearch, choosePileStack } from '../../../../lib/dilemmaBot/pile/search';

// Issue #1555: a dilemma revealed over the cost the bot may spend, and every one after it, is overcome
// at once; a fetching dilemma fetches only a dilemma that fits that cost and helps.

function person(name: string, skills: Record<string, number> = {}): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  return {
    name,
    cost: 3,
    attrs: [5, 5, 5],
    skills: levels,
    species: ['human'],
    affiliation: 'federation',
    skillDots: Object.keys(skills).length,
    hologram: false,
    printed: { skills: levels.slice(), attrs: [5, 5, 5] },
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

const group = (n: number) => Array.from({ length: n }, (_, k) => person(`P${k}`));
const model = (title: string) => REGISTRY.get(title)!;

function play(attempt: PileAttempt, stack: Array<string | DilemmaModel>, seed = 1): { result: PileResult; lines: string[] } {
  const lines: string[] = [];
  const result = playPileStack(attempt, stack.map((t) => (typeof t === 'string' ? model(t) : t)), seededRandom(seed), (l) => lines.push(l));
  return { result, lines };
}

const overcome = (lines: string[]) => lines.filter((l) => l.endsWith('overcome, over the cost the bot may spend')).map((l) => l.split(':')[0]);

describe('the cost the bot may spend at reveal (#1555)', () => {
  it('faces the dilemma Vault of Tomorrow fetches within N, and overcomes the dilemma after it that goes over', () => {
    // N 3: Vault of Tomorrow (1), then No Kill I (2). Cultural Differences (1) is revealed at 2 and kills
    // one; No Kill I then takes the total to 4, over 3, and is overcome: it stops no one.
    const attempt = attemptOf(group(3), { spend: 3, botPile: ['Cultural Differences', 'Unconventional Consideration'] });
    const { result, lines } = play(attempt, ['Vault of Tomorrow', 'No Kill I']);
    expect(result.labels).toEqual([{ title: 'Vault of Tomorrow', label: 'Added Cultural Differences' }]);
    expect([result.killed, result.stopped]).toEqual([1, 0]);
    expect(overcome(lines)).toEqual(['No Kill I']);
    // With no spend there is no cost rule: No Kill I stops the other two.
    const free = play({ ...attempt, spend: undefined }, ['Vault of Tomorrow', 'No Kill I']).result;
    expect([free.killed, free.stopped]).toEqual([1, 2]);
  });

  it('faces a fetched dilemma of cost 2 at a total of 3', () => {
    const attempt = attemptOf(group(3), { spend: 3, botPile: ['Nose to Nose', 'Unconventional Consideration'] });
    // Unconventional Consideration (2) stops all, revealed at 3: within N, it is faced.
    const { result, lines } = play(attempt, ['Vault of Tomorrow', 'Unconventional Consideration']);
    expect(lines).toContain('Unconventional Consideration:');
    expect(result.stopped).toBe(3);
  });

  it('keeps the cost left at each reveal equal to N less the stackCostOf of the dilemmas revealed', () => {
    const seen: number[] = [];
    const probe = (cost: number): DilemmaModel => ({
      ...model('Temporal Conduit'),
      title: `Probe ${cost}`,
      printedCost: cost,
      cost: undefined,
      play: (s) => {
        seen.push(s.costLeft);
      },
    });
    const stack = [probe(2), model('Peremptory Plea'), probe(2), probe(1)];
    const spend = stackCostOf(attemptOf(group(3)), stack);
    const attempt = attemptOf(group(3), { spend });
    const { lines } = play(attempt, stack);
    expect(overcome(lines)).toEqual([]);
    expect(model('Peremptory Plea').discountsNext!(attempt)).toBeGreaterThan(0);
    expect(seen).toEqual([0, 2, 3].map((i) => spend - stackCostOf(attempt, stack.slice(0, i + 1))));
  });

  it('faces every dilemma of a legal stack at a spend equal to its stackCostOf, Entanglement late too', () => {
    const titles = ['No Kill I', 'Cultural Differences', 'Peremptory Plea', 'Organ Theft', 'Entanglement'];
    const stack = titles.map(model);
    const attempt = attemptOf([...group(6), person('Lawyer', { law: 1, biology: 1 })], { spend: stackCostOf(attemptOf(group(1)), stack) });
    const { lines } = play(attempt, stack);
    expect(overcome(lines)).toEqual([]);
    // One less and the last costly title is overcome.
    expect(overcome(play({ ...attempt, spend: attempt.spend! - 1 }, stack).lines)).not.toEqual([]);
  });

  it('has Vault of Tomorrow fetch a dilemma that fits the cost left over a more harmful one that does not', () => {
    // Temporal Conduit (2) then Vault of Tomorrow (1) at N 3: nothing is left. Nose to Nose (0) fits and
    // stops 2; No Kill I (2) would stop 3 but is overcome.
    const attempt = attemptOf(group(3), { spend: 3, botPile: ['No Kill I', 'Nose to Nose'] });
    const { result } = play(attempt, ['Temporal Conduit', 'Vault of Tomorrow']);
    expect(result.labels).toEqual([{ title: 'Vault of Tomorrow', label: 'Added Nose to Nose' }]);
    expect(result.stopped).toBe(2);
    expect(play({ ...attempt, spend: undefined }, ['Temporal Conduit', 'Vault of Tomorrow']).result.labels[0].label).toBe('Added No Kill I');
  });

  it('fetches nothing when no candidate fits the cost left, or none helps', () => {
    const tooDear = play(attemptOf(group(3), { spend: 3, botPile: ['No Kill I'] }), ['Temporal Conduit', 'Vault of Tomorrow']).result;
    expect([tooDear.fetchedNothing, tooDear.stopped, tooDear.labels]).toEqual([1, 0, []]);
    // Unconventional Consideration stops the three that No Kill I stops anyway: it does not help.
    const noHelp = play(attemptOf(group(3), { spend: 3, botPile: ['Unconventional Consideration'] }), ['Vault of Tomorrow', 'No Kill I']).result;
    expect([noHelp.fetchedNothing, noHelp.stopped, noHelp.labels]).toEqual([1, 3, []]);
    const talosian = play(attemptOf(group(3), { spend: 3, table: { underPlayerMissions: [] } }), ['Talosian Trial']).result;
    expect(talosian.fetchedNothing).toBe(1);
  });
});

describe('the search and a fetch of nothing (#1555)', () => {
  const holds = (stacks: { stack: string[] }[], title: string) => stacks.some((s) => s.stack.includes(title));

  it('never puts Vault of Tomorrow or Talosian Trial in a stack where they would fetch nothing', () => {
    const drawn = ['Vault of Tomorrow', 'Talosian Trial', 'Cultural Differences', 'No Kill I'];
    // At N 2 Hard Time (3) never fits the cost left, and Vault of Tomorrow cannot take it at all.
    const attempt = attemptOf(group(3), { botPile: ['Hard Time'], table: { underPlayerMissions: ['Hard Time'] } });
    const result = beamPileSearch(attempt, drawn, 2, 1, { plays: 8, finalPlays: 40 });
    expect(holds(result.ranked, 'Vault of Tomorrow')).toBe(false);
    expect(holds(result.ranked, 'Talosian Trial')).toBe(false);
    expect(result.ranked.every((s) => s.fetchedNothing === 0)).toBe(true);
  });

  it('can put Vault of Tomorrow in the stack with a fitting, harmful candidate', () => {
    const attempt = attemptOf(group(3), { botPile: ['Cultural Differences'] });
    const result = beamPileSearch(attempt, ['Vault of Tomorrow', 'Triage'], 2, 1, { plays: 8, finalPlays: 40 });
    expect(holds(result.ranked, 'Vault of Tomorrow')).toBe(true);
  });

  it('chooses at N 12 from a pile that holds Vault of Tomorrow in about a second', () => {
    // #1503 measured the slowest search at N 12 under a second; this one takes about 0.7 s on a CI runner.
    // `yarn test` instruments the code for coverage, which makes it about three times slower, so the bound
    // only catches a search that grows out of hand.
    const file = "championship-decks/2026 Trek Masters - Think Tank 50's - Matt S.txt";
    const pile = botPileOf(readFileSync(join(process.cwd(), file), 'utf8')).played;
    expect(pile).toContain('Vault of Tomorrow');
    const drawn = ['Vault of Tomorrow', ...pile.filter((t) => t !== 'Vault of Tomorrow').slice(0, 13)];
    const attempt = attemptOf([person('Doc', { medical: 1, science: 1 }), person('Pilot', { navigation: 1 }), ...group(7)], {
      requirements: 'Medical, Navigation and Cunning>30',
      botPile: pile,
    });
    const start = performance.now();
    choosePileStack(attempt, drawn, 12, 1);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

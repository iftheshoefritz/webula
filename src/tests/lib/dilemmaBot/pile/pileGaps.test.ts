import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PilePersonnel, PileResult, PileTable } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { scorePileStack } from '../../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

// Issue #1518: the gaps of the pilot's dilemma models, closed with the owner's answers recorded on the
// issue; and the facts the practice table now fills for the Championship titles.

interface PersonOptions {
  attrs?: [number, number, number];
  skills?: Record<string, number>;
  cost?: number;
}

function person(name: string, { attrs = [5, 5, 5], skills = {}, cost = 3 }: PersonOptions = {}): PilePersonnel {
  const levels = BOT_SKILLS.map((s) => skills[s] ?? 0);
  return {
    name,
    cost,
    attrs: [...attrs] as [number, number, number],
    skills: levels,
    species: ['human'],
    affiliation: 'federation',
    skillDots: Object.keys(skills).length,
    hologram: false,
    printed: { skills: levels.slice(), attrs: [...attrs] as [number, number, number] },
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

const SPACE = { kind: 'space' as const, points: 35, span: 2, nebula: false };
const group = (n: number, opts: PersonOptions = {}) => Array.from({ length: n }, (_, k) => person(`P${k}`, opts));
const model = (title: string) => REGISTRY.get(title)!;
const play = (attempt: PileAttempt, titles: string[], seed = 1): PileResult =>
  playPileStack(attempt, titles.map((t) => model(t)), seededRandom(seed));
const labelsOf = (r: PileResult) => r.labels.map((l) => l.label);

const HAND_PHASER = { name: 'Hand Phaser', keywords: ['hand weapon'] };
const TRICORDER = { name: 'Tricorder', keywords: [] };

describe('the closed gaps (#1518)', () => {
  it('leaves no gap on the titles it closes', () => {
    const closed = [
      'Vault of Tomorrow', 'Talosian Trial', 'Outmatched', 'Secret Identity', 'Center of Attention', 'Rogue Borg Ambush',
      'Adopted Authority', 'Occupational Hazards', 'The Dal\'Rok', 'Restricted Area', 'Artistic License', 'Alternatives to Fighting',
    ];
    expect(closed.filter((t) => model(t).gap)).toEqual([]);
  });

  it('Vault of Tomorrow puts the most harmful dilemma of cost 2 or less from the bot\'s pile on top, and returns', () => {
    const attempt = attemptOf(group(3), { botPile: ['Cultural Differences', 'No Kill I', 'Distress Call'] });
    const r = play(attempt, ['Vault of Tomorrow']);
    expect(labelsOf(r)).toEqual(['Added No Kill I']);
    expect([r.stopped, r.backToPile]).toEqual([3, 1]);
    // Nothing in the pile: no dilemma added.
    const none = play(attemptOf(group(3), { botPile: [] }), ['Vault of Tomorrow']);
    expect([none.stopped, none.labels]).toEqual([0, []]);
  });

  it('Vault of Tomorrow faces the added dilemma before the rest of the stack', () => {
    // Cultural Differences kills one when no one has Acquisition or Anthropology; then No Kill I stops the rest.
    const attempt = attemptOf(group(3), { botPile: ['Cultural Differences'] });
    const r = play(attempt, ['Vault of Tomorrow', 'No Kill I']);
    expect([r.killed, r.stopped]).toEqual([1, 2]);
  });

  it('Talosian Trial adds a planet dilemma beneath the player\'s missions, never a space one', () => {
    const r = play(attemptOf(group(3), { table: { underPlayerMissions: ['Night Terrors', 'No Kill I'] } }), ['Talosian Trial']);
    expect([labelsOf(r), r.stopped]).toEqual([['Added No Kill I'], 3]);
    expect(play(attemptOf(group(3), { table: { underPlayerMissions: ['Night Terrors'] } }), ['Talosian Trial']).stopped).toBe(0);
  });

  it('Outmatched consumes from the bot\'s pile as many dilemmas as make Cunning>15 fail', () => {
    const crew = group(5); // Cunning 25: one dilemma consumed makes it Cunning>25, which fails
    const r = play(attemptOf(crew, { botPile: ['A', 'B'] }), ['Outmatched']);
    expect([labelsOf(r), r.stopped]).toEqual([['Consumed 1 dilemma'], 5]);
    // Cunning 40 needs 3 consumed; a pile of 2 cannot pay it.
    expect(play(attemptOf(group(8), { botPile: ['A', 'B'] }), ['Outmatched']).labels).toEqual([]);
    expect(play(attemptOf(group(8), { botPile: ['A', 'B', 'C'] }), ['Outmatched']).stopped).toBe(8);
    expect(play(attemptOf(crew, { botPile: [] }), ['Outmatched']).stopped).toBe(0);
    // Cunning 10: no dilemma needed.
    const low = play(attemptOf(group(2), { botPile: [] }), ['Outmatched']);
    expect([low.labels, low.stopped]).toEqual([[], 2]);
  });

  it('Secret Identity changes nothing: the player replaces the personnel with an identical copy', () => {
    expect(model('Secret Identity')).toMatchObject({ family: 'no-effect' });
    const r = play(attemptOf(group(3)), ['Secret Identity']);
    expect([r.stopped, r.killed]).toEqual([0, 0]);
  });

  it('Center of Attention and Rogue Borg Ambush read the attempt\'s Hand Weapon', () => {
    const crew = [person('T', { skills: { treachery: 1 } }), ...group(5)]; // Cunning 30, Strength 30
    expect(play(attemptOf(crew), ['Center of Attention']).killed).toBe(1);
    expect(play(attemptOf(crew, { equipment: [HAND_PHASER] }), ['Center of Attention']).killed).toBe(0);
    expect(play(attemptOf(crew, { equipment: [TRICORDER] }), ['Center of Attention']).killed).toBe(1);
    const strong = group(4, { attrs: [5, 5, 9] }); // Strength 36
    expect(play(attemptOf(strong), ['Rogue Borg Ambush']).killed).toBe(1);
    expect(play(attemptOf(strong, { equipment: [HAND_PHASER] }), ['Rogue Borg Ambush']).killed).toBe(0);
  });

  it('Occupational Hazards, The Dal\'Rok and Adopted Authority return to the pile only on the branch that says so', () => {
    expect(play(attemptOf(group(3)), ['Occupational Hazards']).backToPile).toBe(1);
    expect(play(attemptOf(group(3, { skills: { treachery: 2 } })), ['Occupational Hazards']).backToPile ?? 0).toBe(0);
    expect(play(attemptOf(group(3)), ['The Dal\'Rok']).backToPile).toBe(1);
    expect(play(attemptOf(group(6)), ['The Dal\'Rok']).backToPile ?? 0).toBe(0);
    expect(play(attemptOf(group(3)), ['Adopted Authority']).backToPile).toBe(1);
    expect(play(attemptOf(group(3, { attrs: [4, 5, 5] })), ['Adopted Authority']).backToPile ?? 0).toBe(0);
  });

  it('counts a dilemma that returned to the pile out of the stack\'s dilemmas beneath the mission', () => {
    expect(scorePileStack(attemptOf(group(3)), ['Occupational Hazards', 'No Kill I'], 20, 1).under).toBe(1);
    expect(scorePileStack(attemptOf(group(3, { skills: { treachery: 2 } })), ['Occupational Hazards'], 20, 1).under).toBe(1);
  });

  it('Alternatives to Fighting stops all when the player has no Nebula mission to go to', () => {
    expect(play(attemptOf(group(3), { mission: SPACE }), ['Alternatives to Fighting']).moved).toBe(3);
    const r = play(attemptOf(group(3), { mission: SPACE, table: { nebulaMission: false } }), ['Alternatives to Fighting']);
    expect([r.moved, r.stopped]).toEqual([0, 3]);
  });
});

describe('the table facts of #1518', () => {
  it('fills the attempt\'s equipment, the other Nebula mission and the dilemmas beneath every mission', () => {
    const missionRow = (name: string, keywords = '') => ({ type: 'mission', name: name.toLowerCase(), originalName: name, missiontype: 'p', skills: 'Science', points: 35, span: 2, keywords });
    const attempted = missionRow('Moab IV');
    const { attempt } = pileAttemptOf({
      cards: [
        { card: { type: 'equipment', originalName: 'Hand Phaser', keywords: 'Hand Weapon.' } as never },
        { card: { type: 'equipment', originalName: 'Tricorder', keywords: '' } as never },
      ],
      mission: attempted,
      placedOn: [],
      underMission: [],
      missions: [
        { mission: attempted, under: [{ originalName: 'No Kill I' }] },
        { mission: missionRow('Mutara Nebula', 'Nebula.'), under: [{ originalName: 'Triage' }] },
      ],
      hand: [],
      discard: [],
      turn: 1,
    });
    expect(attempt.equipment).toEqual([HAND_PHASER, TRICORDER]);
    expect(attempt.table).toMatchObject({ nebulaMission: true, underPlayerMissions: ['No Kill I', 'Triage'] });
  });
});

describe('the facts the practice table fills for the Championship titles', () => {
  const missionRow = (missiontype: string, extra: Record<string, unknown> = {}) => ({
    type: 'mission', originalName: `M ${missiontype}`, missiontype, skills: 'Science', points: 35, span: 2, quadrant: 'a', ...extra,
  });
  const attempted = missionRow('s');
  const { attempt } = pileAttemptOf({
    cards: [],
    mission: attempted,
    ship: { type: 'ship', originalName: 'S', staff: '[Cmd][Stf]', range: 7, weapons: 7, shields: 7 },
    placedOn: [{ originalName: 'Organ Theft' }],
    underMission: [{ originalName: 'Breaking the Ice', keywords: 'Persistent.' }, { originalName: 'Blended' }],
    missions: [{ mission: attempted }, { mission: missionRow('p', { span: 4 }), completed: true }, { mission: missionRow('h', { quadrant: 'd' }) }],
    hand: [{ type: 'event', cost: 2 }, { type: 'personnel', cost: 5 }],
    discard: [],
    turn: 1,
    core: [{ type: 'event', keywords: 'Decay: 3.' }, { type: 'event', keywords: 'Decay: 1.' }, { type: 'interrupt' }],
    commanded: [{ type: 'equipment', originalName: 'Trellium-D *VP' }, { type: 'equipment', originalName: 'Tricorder' }],
    shipsAtMission: [{ staffed: true }],
    drawDeck: [{ type: 'event' }, { type: 'interrupt' }, { type: 'personnel' }],
  });

  it('fills each fact from the table', () => {
    expect(attempt.table).toMatchObject({
      persistentUnderMission: 1,
      completedSpan4Mission: true,
      staffedShipAtMission: true,
      shipAtMission: true,
      eventDecayMax: 3,
      trelliumD: 1,
      handCostMax: 5,
      onMission: ['Organ Theft'],
      headquartersOtherQuadrant: true,
      drawDeck: { size: 3, eventsAndInterrupts: 2 },
      coreEvents: 2,
    });
    expect(attempt.ship?.staffing).toEqual(['[cmd]', '[stf]']);
  });

  it('leaves the ship facts to their defaults when the table does not give the ships', () => {
    const bare = pileAttemptOf({ cards: [], mission: attempted, placedOn: [], underMission: [], missions: [{ mission: attempted }], hand: [], discard: [], turn: 1 }).attempt;
    expect(bare.table.shipAtMission).toBeUndefined();
    expect(bare.table.staffedShipAtMission).toBeUndefined();
    expect(bare.table.handCostMax).toBeUndefined();
  });

  it('reaches the plays: Frozen by Fear costs 1 less, and Organ Theft kills', () => {
    expect(model('Frozen by Fear').cost!(attempt)).toBe(4);
    const crew = { ...attempt, personnel: group(3) };
    expect(play(crew, ['Organ Theft']).killed).toBe(1);
  });
});

// Issue #1534: a dilemma that goes elsewhere only when its effect fires goes beneath the mission when the
// group meets its "unless".
describe('the dilemmas a play places elsewhere', () => {
  const explorers = [
    person('Astro', { skills: { astrometrics: 1 }, attrs: [5, 6, 5] }),
    person('Nav', { skills: { navigation: 1 }, attrs: [5, 6, 5] }),
    person('Phys', { skills: { physics: 1 }, attrs: [5, 6, 5] }),
    ...group(4, { attrs: [5, 6, 5] }),
  ];
  const WHERE = 'Where No One Has Gone Before';

  it('counts Where No One Has Gone Before under the mission when the group meets it, and not when it fires', () => {
    const meets = attemptOf(explorers, { mission: SPACE });
    expect(play(meets, [WHERE]).notUnder ?? 0).toBe(0);
    expect(scorePileStack(meets, [WHERE], 20, 1).under).toBe(1);

    const fails = attemptOf(group(7), { mission: SPACE });
    const r = play(fails, [WHERE]);
    expect([r.notUnder, r.shipLost]).toEqual([1, 7]);
    expect(scorePileStack(fails, [WHERE], 20, 1).under).toBe(0);
  });

  it('records Covert Ambush as placed in the core only without a personnel with 2 Engineer or 2 Programming', () => {
    expect(play(attemptOf(group(3), { mission: SPACE }), ['Covert Ambush']).notUnder).toBe(1);
    const engineer = [person('Eng', { skills: { engineer: 2 } }), ...group(2)];
    expect(play(attemptOf(engineer, { mission: SPACE }), ['Covert Ambush']).notUnder ?? 0).toBe(0);
    const split = [person('A', { skills: { engineer: 1 } }), person('B', { skills: { engineer: 1 } })];
    expect(play(attemptOf(split, { mission: SPACE }), ['Covert Ambush']).notUnder).toBe(1);
  });

  it('keeps a static goesUnder: false only for the titles that never go beneath this mission', () => {
    const never = [...REGISTRY.values()].filter((m) => !m.goesUnder).map((m) => m.title).sort();
    expect(never).toEqual([
      'All-Consuming Evil',
      'Causal Recursion',
      'Chula: The Game',
      'Hard Time',
      'Inferiority',
      'Ingenious Jury-rig',
      'Insurrection',
      'Ostensible Malfunction',
      'Overwhelmed',
      'Pattern Loss',
      'Pivotal Destiny',
      'Polywater Intoxication',
      'Skeleton Crew',
      'Soul Searching',
      'The Clown: Bitter Medicine',
      'The Clown: Celebration',
      'The Clown: Fear Incarnate',
      'The Clown: Go Away',
      'The Clown: Guillotine',
      'The Clown: On His Throne',
      'Timescape',
      'Tragic Turn',
      'Zero Hour',
    ]);
  });
});

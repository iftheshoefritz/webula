import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { SPACE, attemptOf, championshipPiles, cost, group, labelsOf, model, person, play } from './championshipHelpers';

// The Championship titles of batch 3 (#1517): the coverage of the registry, and the plays worked out by
// hand. With it, the registry covers every title of the 52 Championship piles (#1514).

const BATCH_3 = [
  'Skeleton Crew', 'The Dreamer and the Dream', 'Spatial Interphase', 'Unfair Terms', 'The Caretaker\'s "Guests"', 'The Clown: Go Away',
  'Slightly Overbooked', 'Spatial Distortions', 'Staffing Shortage', 'Stripped Down', 'Suspected Minority', 'The Phage', 'Zero Hour',
  'Shared Hallucination', 'Telepathology', 'Simulated Prey', 'Temptation', 'The Captain\'s "Guest"', 'The Clown: Cloaking Device',
  'We\'ll Never Know', 'Shocking Betrayal', 'Tak Tak Negotiations', 'Soul Searching', 'Suspicion', 'The First Duty',
  'Unknown Microorganism', 'V\'Ger', 'Two-Dimensional Creatures', 'Unbelievable Emergency', 'What Lies Beneath',
  'Telepathic Deception', 'The Needs of the Many', 'Threading the Needle', 'Ungracious Hosts', 'Weight of Command', 'Shields Up!',
  'Shipboard Fire', 'So Many Enemies', 'Standing Trial', 'Temporal Conduit', 'The Big Goodbye', 'The Clown: Bitter Medicine',
  'The Clown: On His Throne', 'Vastly Outnumbered', 'Vian Test', 'Warm Welcome',
];

const PILES = championshipPiles();

describe('batch 3 against the Championship piles (#1517)', () => {
  it('has the 46 titles, each with a model', () => {
    expect(new Set(BATCH_3).size).toBe(46);
    expect(BATCH_3.filter((t) => !model(t))).toEqual([]);
  });

  it.each(PILES.map((p) => [p.file, p.text]))('leaves no title of batch 3 missing from %s', (_file, text) => {
    expect(botPileOf(text).missing.filter((t) => BATCH_3.includes(t))).toEqual([]);
  });

  it('lists Tak Tak Negotiations and Ungracious Hosts under ignored', () => {
    expect(botPileOf('Dilemmas:\n1\tTak Tak Negotiations\n2\tUngracious Hosts\n3\tThe Phage\n')).toEqual({
      played: ['The Phage', 'The Phage', 'The Phage'],
      ignored: ['Tak Tak Negotiations', 'Ungracious Hosts', 'Ungracious Hosts'],
      missing: [],
    });
  });

  it('reads the quoted titles of a deck file', () => {
    expect(botPileOf('Dilemmas:\n1\tThe Captain\'s "Guest"\n1\tThe Caretaker\'s "Guests" *VP\n').played).toEqual([
      'The Captain\'s "Guest"', 'The Caretaker\'s "Guests"',
    ]);
  });
});

describe('the registry covers every Championship pile (#1514)', () => {
  it.each(PILES.map((p) => [p.file, p.text]))('has a model for every dilemma of %s', (_file, text) => {
    expect(botPileOf(text).missing).toEqual([]);
  });

  it('ignores exactly the three titles #1320 decided', () => {
    expect([...REGISTRY.values()].filter((m) => m.status === 'ignore').map((m) => m.title).sort()).toEqual([
      'Edo Probe', 'Tak Tak Negotiations', 'Ungracious Hosts',
    ]);
  });
});

describe('the bot-side titles of batch 3 (#1517)', () => {
  it('Spatial Interphase, Unfair Terms and Slightly Overbooked cost 0', () => {
    for (const t of ['Spatial Interphase', 'Unfair Terms', 'Slightly Overbooked']) {
      expect(cost(t, attemptOf(group(3)))).toBe(0);
      expect(model(t)).toMatchObject({ category: '3' });
    }
  });

  it('Simulated Prey kills two with a required skill, and labels the discard', () => {
    const crew = group(3, { skills: { navigation: 1 } });
    const r = play(attemptOf(crew, { mission: SPACE, requirements: 'Navigation' }), ['Simulated Prey']);
    expect([r.killed, labelsOf(r)]).toEqual([2, ['Discarded an interrupt']]);
    expect(model('Simulated Prey')).toMatchObject({ category: '4f' });
  });

  it('Shocking Betrayal kills a personnel of an affiliation the bot deck holds', () => {
    // The player stops one personnel first, the first Klingon here, and the bot kills the other.
    const crew = [person('K1', { affiliation: 'klingon' }), person('K2', { affiliation: 'klingon' }), ...group(3)];
    const r = play(attemptOf(crew, { botAffiliations: ['klingon'] }), ['Shocking Betrayal']);
    expect([r.stopped, r.killed, labelsOf(r)]).toEqual([1, 1, ['Discarded a Klingon personnel']]);
    expect(play(attemptOf(crew, { botAffiliations: ['non-aligned'] }), ['Shocking Betrayal']).killed).toBe(0);
    expect(play(attemptOf(crew), ['Shocking Betrayal']).killed).toBe(0);
    expect(model('Shocking Betrayal')).toMatchObject({ category: '4f' });
  });

  it('The Clown: Cloaking Device turns Cunning>30 into Cunning>39', () => {
    const crew = group(7); // Cunning 35
    expect(play(attemptOf(crew, { requirements: 'Cunning>30' }), []).fail).toBe(false);
    const r = play(attemptOf(crew, { requirements: 'Cunning>30' }), ['The Clown: Cloaking Device']);
    expect([r.fail, labelsOf(r)]).toEqual([true, ['3 different equipment']]);
    expect(model('The Clown: Cloaking Device')).toMatchObject({ category: '5b', goesUnder: false });
  });

  it('Standing Trial stops one, returns one, as the player has more points', () => {
    const r = play(attemptOf([person('H', { skills: { honor: 1 } }), ...group(3)]), ['Standing Trial']);
    expect([r.stopped, r.returned, labelsOf(r)]).toEqual([1, 1, ['You have more points']]);
    expect(model('Standing Trial')).toMatchObject({ category: '2' });
  });
});

describe('the plays of batch 3, worked out by hand (#1517)', () => {
  it('Warm Welcome costs 3 with 6 personnel and 0 with 5, and takes one unless 2 Officer', () => {
    expect(cost('Warm Welcome', attemptOf(group(6)))).toBe(3);
    expect(cost('Warm Welcome', attemptOf(group(5)))).toBe(0);
    expect(play(attemptOf(group(3)), ['Warm Welcome']).killed).toBe(1);
    expect(play(attemptOf(group(2, { skills: { officer: 1 } })), ['Warm Welcome']).killed).toBe(0);
  });

  it('The Clown: Bitter Medicine lowers the holders of the named skill, and leaves the attempt as it was', () => {
    const attempt = attemptOf(group(4, { skills: { science: 1 } }), { requirements: 'Cunning>15' });
    const r = play(attempt, ['The Clown: Bitter Medicine']);
    expect([labelsOf(r), r.fail]).toEqual([['Named Science'], true]); // Cunning 4 × 3 = 12
    expect(attempt.personnel[0].attrs).toEqual([5, 5, 5]);
    expect(play(attempt, []).fail).toBe(false);
  });

  it('The Clown: On His Throne moves each attribute requirement to the attribute the group fails', () => {
    const crew = [person('A', { attrs: [9, 9, 2] }), person('B', { attrs: [9, 9, 2] })];
    const r = play(attemptOf(crew, { requirements: 'Integrity>15' }), ['The Clown: On His Throne']);
    expect([labelsOf(r), r.fail]).toEqual([['Named Strength'], true]);
  });

  it('Unbelievable Emergency kills the selected holders of the named skill and stops the others', () => {
    const crew = [person('S1', { skills: { science: 1 } }), person('S2', { skills: { science: 1 } }), person('X')];
    const r = play(attemptOf(crew, { mission: SPACE, table: { headquarters: 1 } }), ['Unbelievable Emergency']);
    expect(labelsOf(r)).toEqual(['Named Science']);
    expect(r.killed + r.stopped).toBe(2);
  });

  it('The Captain\'s "Guest" names the keyword most personnel have', () => {
    const crew = group(3, { keywords: ['smuggler'] });
    const r = play(attemptOf(crew), ['The Captain\'s "Guest"']);
    expect([labelsOf(r), r.stopped]).toEqual([['Named Smuggler'], 3]);
    expect(play(attemptOf(group(3)), ['The Captain\'s "Guest"']).stopped).toBe(1);
  });

  it('Suspicion stops two who share a skill when that saves the requirements', () => {
    const key = person('Key', { skills: { science: 1, physics: 1 } });
    const helpers = [person('H1', { skills: { science: 1 } }), person('H2', { skills: { science: 1 } })];
    const r = play(attemptOf([key, ...helpers], { requirements: 'Physics' }), ['Suspicion']);
    expect(r.stopped).toBe(2);
    expect(r.fail).toBe(false);
    expect(play(attemptOf(group(3)), ['Suspicion']).stopped).toBe(1);
  });

  it('Zero Hour adds 3 to each attribute requirement per event in the core', () => {
    const crew = group(4); // Cunning 20
    expect(play(attemptOf(crew, { requirements: 'Cunning>15' }), ['Zero Hour']).fail).toBe(false);
    expect(play(attemptOf(crew, { requirements: 'Cunning>15', table: { coreEvents: 2 } }), ['Zero Hour']).fail).toBe(true);
  });

  it('Staffing Shortage kills unless the selected personnel has 2 of a skill', () => {
    expect(play(attemptOf(group(1)), ['Staffing Shortage']).killed).toBe(1);
    expect(play(attemptOf(group(1, { skills: { science: 2 } })), ['Staffing Shortage']).stopped).toBe(1);
  });

  it('Suspected Minority stops 3 with four species or more, else 1', () => {
    const four = ['a', 'b', 'c', 'd'].map((x) => person(x, { species: [x] }));
    expect(play(attemptOf(four), ['Suspected Minority']).stopped).toBe(3);
    expect(play(attemptOf(group(4)), ['Suspected Minority']).stopped).toBe(1);
  });

  it('Weight of Command stops the Officers and moves the unstopped Romulans', () => {
    const crew = [person('O', { skills: { officer: 1 } }), person('R', { affiliation: 'romulan' }), person('F')];
    const r = play(attemptOf(crew), ['Weight of Command']);
    expect([r.stopped, r.moved]).toEqual([1, 1]);
  });

  it('Shields Up! stops a second when the first has Navigation', () => {
    expect(play(attemptOf(group(3, { skills: { navigation: 1 } }), { mission: SPACE }), ['Shields Up!']).stopped).toBe(2);
    expect(play(attemptOf(group(3), { mission: SPACE }), ['Shields Up!']).stopped).toBe(1);
  });

  it('Slightly Overbooked stops the cheap personnel unless three cost 4 or more', () => {
    const crew = [...group(2, { cost: 2 }), ...group(2, { cost: 4 })];
    expect(play(attemptOf(crew, { mission: SPACE }), ['Slightly Overbooked']).stopped).toBe(2);
    expect(play(attemptOf([...crew, person('D', { cost: 5 })], { mission: SPACE }), ['Slightly Overbooked']).stopped).toBe(0);
  });

  it('The Needs of the Many kills a [Cmd] or Science personnel', () => {
    expect(play(attemptOf([person('C', { icons: ['[cmd]'] }), ...group(2)]), ['The Needs of the Many']).killed).toBe(1);
    expect(play(attemptOf(group(3)), ['The Needs of the Many']).killed).toBe(0);
  });

  it('Two-Dimensional Creatures needs 2 Science or Telepathy', () => {
    expect(play(attemptOf(group(2, { skills: { science: 2 } }), { mission: SPACE }), ['Two-Dimensional Creatures']).stopped).toBe(1);
    expect(play(attemptOf(group(2, { skills: { science: 1 } }), { mission: SPACE }), ['Two-Dimensional Creatures']).stopped).toBe(0);
  });
});

describe('the table facts of batch 3 (#1517)', () => {
  it('counts the events of the core', () => {
    const missionRow = { type: 'mission', originalName: 'M', missiontype: 'p', skills: 'Science', points: 35, span: 2 };
    const { attempt } = pileAttemptOf({
      cards: [],
      mission: missionRow,
      placedOn: [],
      underMission: [],
      missions: [{ mission: missionRow }],
      hand: [],
      discard: [],
      turn: 1,
      core: [{ type: 'event' }, { type: 'event' }, { type: 'interrupt' }],
    });
    expect(attempt.table.coreEvents).toBe(2);
  });
});

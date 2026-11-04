import { botPileOf, pilePersonnelOf } from '../../../../lib/dilemmaBot/pile/pile';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { BOT_SKILLS } from '../../../../lib/dilemmaBot/requirements';
import { SPACE, attemptOf, championshipPiles, cost, group, labelsOf, model, person, play } from './championshipHelpers';

// The Championship titles of batch 1 (#1515): the coverage of the registry, and the plays worked out by hand.

const BATCH_1 = [
  'A Bad Case of par\'Mach', 'A Klingon Matter', 'A Pattern of Lies', 'A Taste of Armageddon', 'Accelerated Aging',
  'Aceton Assimilators', 'Adversarial Trial', 'After Action Report', 'Alluring Spy', 'Ardent Predator', 'Arena',
  'Arresting Display', 'Artificial Wormhole', 'Assassination Attempt', 'Blended', 'Bread and Circuses', 'Breaking the Ice',
  'Bynars\' Password', 'Captain\'s Holiday', 'Causal Recursion', 'Clashing Values', 'Code Forty-Seven', 'Compromised Experiment',
  'Conflict of Interests', 'Contaminating a Culture', 'Cornered', 'Covert Ambush', 'Cultural Differences', 'Dangerous Liaisons',
  'Dead Ringer', 'Dead Weight', 'Derelict Robot', 'Dignitaries and Witnesses', 'Divergent Goals', 'Disgraceful Assault',
  'Distress Call', 'Distraction', 'Dramatis Personae', 'Edo Probe', 'Elemental Instability', 'Exposed Power Relay', 'Family',
  'Ferengi Locator Bomb', 'Financial Pitfall', 'Flare of Rage', 'Formal Hearing', 'Frozen by Fear', 'Galileo Grounded',
];

describe('batch 1 against the Championship piles (#1515)', () => {
  it('has the 48 titles, each with a model', () => {
    expect(new Set(BATCH_1).size).toBe(48);
    expect(BATCH_1.filter((t) => !model(t))).toEqual([]);
  });

  it.each(championshipPiles().map((p) => [p.file, p.text]))('leaves no title of batch 1 missing from %s', (_file, text) => {
    const pile = botPileOf(text);
    expect(pile.missing.filter((t) => BATCH_1.includes(t))).toEqual([]);
    expect(pile.played).not.toContain('Edo Probe');
  });

  it('lists Edo Probe under ignored', () => {
    expect(botPileOf('Dilemmas:\n2\tEdo Probe\n').ignored).toEqual(['Edo Probe', 'Edo Probe']);
  });
});

describe('the bot-side titles of batch 1 (#1515)', () => {
  it('A Taste of Armageddon kills two personnel with a required skill, and labels the discard', () => {
    const crew = [person('Sci1', { skills: { science: 1 } }), person('Sci2', { skills: { science: 1 } }), ...group(4)];
    const r = play(attemptOf(crew, { requirements: 'Science' }), ['A Taste of Armageddon']);
    expect(r.killed).toBe(2);
    expect(labelsOf(r)).toEqual(['Discarded an interrupt']);
    expect(model('A Taste of Armageddon')).toMatchObject({ category: '4f' });
    // No personnel with a required skill: no kill and no label.
    const none = play(attemptOf(group(4), { requirements: 'Science' }), ['A Taste of Armageddon']);
    expect([none.killed, none.labels]).toEqual([0, []]);
  });

  it('Adversarial Trial stops one and returns one, as the player has more points', () => {
    const crew = [person('Anth', { skills: { anthropology: 1 } }), ...group(3)];
    const r = play(attemptOf(crew), ['Adversarial Trial']);
    expect([r.stopped, r.returned]).toEqual([1, 1]);
    expect(labelsOf(r)).toEqual(['You have more points']);
    expect(model('Adversarial Trial')).toMatchObject({ category: '2' });
  });

  it('Aceton Assimilators names itself and the player stops one', () => {
    const r = play(attemptOf(group(3)), ['Aceton Assimilators']);
    expect(r.stopped).toBe(1);
    expect(labelsOf(r)).toEqual(['Named Aceton Assimilators']);
    expect(model('Aceton Assimilators')).toMatchObject({ category: '3' });
  });

  it('Conflict of Interests plays its "unless" only', () => {
    expect(play(attemptOf(group(3)), ['Conflict of Interests']).stopped).toBe(3);
    expect(play(attemptOf(group(8)), ['Conflict of Interests']).stopped).toBe(0); // Integrity 40>36
    expect(model('Conflict of Interests')).toMatchObject({ category: '4g', goesUnder: true });
  });

  it('Formal Hearing costs 1, the bot\'s core holding 6 events', () => {
    expect(cost('Formal Hearing', attemptOf(group(3)))).toBe(1);
    expect(model('Formal Hearing')).toMatchObject({ category: '1' });
  });
});

describe('the plays of batch 1, worked out by hand (#1515)', () => {
  it('Assassination Attempt kills both selected when neither has Treachery', () => {
    expect(play(attemptOf(group(2)), ['Assassination Attempt']).killed).toBe(2);
    expect(play(attemptOf(group(2, { skills: { treachery: 1 } })), ['Assassination Attempt']).killed).toBe(0);
  });

  it('Clashing Values and Derelict Robot stop the selected personnel that lack the skills', () => {
    const crew = [person('Sci', { skills: { science: 1 } }), ...group(2)];
    expect(play(attemptOf(crew), ['Clashing Values']).stopped).toBe(2);
    expect(play(attemptOf(group(3, { skills: { engineer: 1 } })), ['Derelict Robot']).stopped).toBe(0);
  });

  it('Ardent Predator reads only the two selected personnel', () => {
    expect(play(attemptOf(group(2, { attrs: [5, 5, 7] })), ['Ardent Predator']).killed).toBe(0); // Strength 14>13
    expect(play(attemptOf(group(2)), ['Ardent Predator']).killed).toBe(2);
  });

  it('Divergent Goals holds when the unselected personnel have Biology, Officer and 2 Transporters', () => {
    const rest = [person('Bio', { skills: { biology: 1, officer: 1, transporters: 2 } })];
    // With 4 personnel, three are selected; the requirement of the unselected holds only when Bio is left out.
    expect(play(attemptOf(group(3)), ['Divergent Goals']).stopped).toBe(3);
    const r = play(attemptOf([...rest]), ['Divergent Goals']);
    expect(r.stopped).toBe(1); // Bio alone is selected, and lacks Anthropology and Geology
  });

  it('Distress Call costs 3 less per completed mission', () => {
    expect(cost('Distress Call', attemptOf(group(3), { table: { completedMissions: 2 } }))).toBe(3);
    expect(cost('Distress Call', attemptOf(group(3), { table: { completedMissions: 4 } }))).toBe(0);
  });

  it('Frozen by Fear and Flare of Rage cost 1 less per Persistent dilemma beneath the mission', () => {
    expect(cost('Frozen by Fear', attemptOf(group(3), { table: { persistentUnderMission: 2 } }))).toBe(3);
    expect(cost('Frozen by Fear', attemptOf(group(3)))).toBe(5);
    expect(cost('Flare of Rage', attemptOf(group(3), { table: { persistentUnderMission: 1 } }))).toBe(4);
    expect(play(attemptOf(group(3)), ['Frozen by Fear']).killed).toBe(2);
  });

  it('After Action Report stops one per completed mission, and Compromised Experiment one per Decay', () => {
    expect(play(attemptOf(group(5), { table: { completedMissions: 2 } }), ['After Action Report']).stopped).toBe(2);
    expect(play(attemptOf(group(5)), ['Compromised Experiment']).stopped).toBe(0);
    expect(play(attemptOf(group(5), { table: { highestDecay: 3 } }), ['Compromised Experiment']).stopped).toBe(3);
  });

  it('Accelerated Aging fails a requirement that only a first-listed skill met', () => {
    const crew = [person('Sci', { skills: { science: 1, physics: 1 }, firstSkill: 'science' }), ...group(2)];
    expect(play(attemptOf(crew, { requirements: 'Science' }), []).fail).toBe(false);
    expect(play(attemptOf(crew, { requirements: 'Science' }), ['Accelerated Aging']).fail).toBe(true);
    expect(play(attemptOf(crew, { requirements: 'Physics' }), ['Accelerated Aging']).fail).toBe(false);
  });

  it('Bread and Circuses ignores the skills of a cost-1 personnel for its own check only', () => {
    const cheap = person('Cheap', { cost: 1, skills: { archaeology: 1, diplomacy: 1, honor: 1 } });
    expect(play(attemptOf([cheap, ...group(2)]), ['Bread and Circuses']).stopped).toBe(3);
    const dear = person('Dear', { cost: 2, skills: { archaeology: 1, diplomacy: 1, honor: 1 } });
    expect(play(attemptOf([dear, ...group(2)]), ['Bread and Circuses']).stopped).toBe(0);
    // A later dilemma reads the cost-1 personnel's skills again.
    const later = play(attemptOf([person('Cheap', { cost: 1, skills: { diplomacy: 1 } }), ...group(2)]), ['Bread and Circuses', 'Blended']);
    expect(later.stopped).toBe(3);
    expect(play(attemptOf([person('Cheap', { cost: 1, skills: { diplomacy: 1 } }), ...group(2)]), ['Blended']).stopped).toBe(0);
  });

  it('Arena moves a personnel off the attempt unless its attributes total more than 18', () => {
    expect(play(attemptOf(group(1)), ['Arena']).moved).toBe(1);
    expect(play(attemptOf(group(1, { attrs: [7, 7, 5] })), ['Arena']).moved).toBe(0);
  });

  it('Artificial Wormhole moves the ship and everyone aboard, unless the printed skills meet it', () => {
    const crew = group(3);
    const r = play(attemptOf(crew, { mission: SPACE }), ['Artificial Wormhole']);
    expect([r.moved, r.shipLost]).toEqual([3, 0]);
    const officers = [person('A', { skills: { leadership: 1, officer: 1 } }), person('B', { skills: { leadership: 1, officer: 1 } })];
    expect(play(attemptOf(officers, { mission: SPACE }), ['Artificial Wormhole']).moved).toBe(0);
    // A skill gained only (not printed) does not count.
    const gained = officers.map((p) => ({ ...p, printed: { ...p.printed, skills: BOT_SKILLS.map(() => 0) } }));
    expect(play(attemptOf(gained, { mission: SPACE }), ['Artificial Wormhole']).moved).toBe(2);
  });

  it('A Klingon Matter kills a personnel under Strength 7 and stops the others', () => {
    const r = play(attemptOf(group(3)), ['A Klingon Matter']);
    expect([r.killed, r.stopped]).toEqual([1, 2]);
    expect(play(attemptOf(group(3, { attrs: [5, 5, 7] })), ['A Klingon Matter']).killed).toBe(0);
  });

  it('A Pattern of Lies stops all three of one species, else one', () => {
    expect(play(attemptOf(group(3)), ['A Pattern of Lies']).stopped).toBe(3);
    const mixed = [person('V', { species: ['vulcan'] }), ...group(2)];
    expect(play(attemptOf(mixed), ['A Pattern of Lies']).stopped).toBe(1);
  });

  it('Code Forty-Seven and Elemental Instability stop [Cmd] personnel only', () => {
    const crew = [person('Cmd', { icons: ['[cmd]'] }), ...group(2)];
    expect(play(attemptOf(crew), ['Code Forty-Seven']).stopped).toBe(1);
    expect(play(attemptOf(group(3)), ['Code Forty-Seven']).stopped).toBe(0);
    const r = play(attemptOf([...crew, person('Cmd2', { icons: ['[cmd]'] })], { table: { trelliumD: 1 } }), ['Elemental Instability']);
    expect([r.killed, r.stopped]).toEqual([1, r.stopped]);
    expect(r.stopped).toBeGreaterThanOrEqual(1);
  });

  it('Dignitaries and Witnesses holds with an Admiral', () => {
    expect(play(attemptOf([person('Adm', { keywords: ['admiral'] }), ...group(2)]), ['Dignitaries and Witnesses']).stopped).toBe(0);
    expect(play(attemptOf(group(3)), ['Dignitaries and Witnesses']).stopped).toBe(3);
  });

  it('Bynars\' Password needs one personnel with 2 Engineer, else the bot stops an Engineer, else all', () => {
    expect(play(attemptOf([person('E', { skills: { engineer: 2 } }), ...group(2)]), ['Bynars\' Password']).stopped).toBe(0);
    expect(play(attemptOf([person('E', { skills: { engineer: 1 } }), ...group(2)]), ['Bynars\' Password']).stopped).toBe(1);
    expect(play(attemptOf(group(3)), ['Bynars\' Password']).stopped).toBe(3);
  });

  it('Disgraceful Assault kills one and stops the rest, or only stops one with Biology and 2 Medical', () => {
    const r = play(attemptOf(group(3)), ['Disgraceful Assault']);
    expect([r.killed, r.stopped]).toEqual([1, 2]);
    const medics = [person('M', { skills: { biology: 1, medical: 2 } }), ...group(2)];
    const m = play(attemptOf(medics), ['Disgraceful Assault']);
    expect([m.killed, m.stopped]).toEqual([0, 1]);
  });

  it('Distraction stops personnel until their costs reach 4', () => {
    expect(play(attemptOf(group(5, { cost: 2 })), ['Distraction']).stopped).toBe(2);
    expect(play(attemptOf(group(1, { cost: 2 })), ['Distraction']).stopped).toBe(1);
  });

  it('Dramatis Personae kills one personnel unless the requirements hold', () => {
    expect(play(attemptOf(group(3)), ['Dramatis Personae']).killed).toBe(1);
    expect(play(attemptOf(group(3, { skills: { medical: 1, science: 1 } })), ['Dramatis Personae']).killed).toBe(0);
  });

  it('Exposed Power Relay kills two of ten, three of eleven, and stops one of fewer', () => {
    expect(play(attemptOf(group(9)), ['Exposed Power Relay']).stopped).toBe(1);
    expect(play(attemptOf(group(10)), ['Exposed Power Relay']).killed).toBe(2);
    expect(play(attemptOf(group(12)), ['Exposed Power Relay']).killed).toBe(3);
  });

  it('Cornered and Galileo Grounded read the table', () => {
    expect(play(attemptOf(group(3)), ['Cornered']).killed).toBe(2);
    expect(play(attemptOf(group(3), { table: { completedSpan4Mission: true } }), ['Cornered']).killed).toBe(0);
    expect(play(attemptOf(group(3)), ['Galileo Grounded']).stopped).toBe(3);
    expect(play(attemptOf(group(3), { table: { staffedShipAtMission: true } }), ['Galileo Grounded']).stopped).toBe(0);
  });

  it('Family kills (to the bottom of the deck) unless the hand reveals Honor or Treachery', () => {
    expect(play(attemptOf(group(3)), ['Family']).killed).toBe(1);
    const hand = [{ skills: [BOT_SKILLS.indexOf('honor')], strength: 5 }];
    const r = play(attemptOf(group(3), { table: { hand } }), ['Family']);
    expect([r.killed, r.stopped]).toEqual([0, 1]);
  });

  it('Dead Weight stops every personnel without a required skill', () => {
    const crew = [person('Sci', { skills: { science: 1 } }), ...group(3)];
    expect(play(attemptOf(crew, { requirements: 'Science' }), ['Dead Weight']).stopped).toBe(3);
  });
});

describe('the table facts of batch 1 (#1515)', () => {
  const missionRow = (missiontype: string, span: number) => ({ type: 'mission', originalName: `M ${missiontype}`, missiontype, skills: 'Science', points: 35, span });
  const base = {
    cards: [{ card: { type: 'personnel', name: 'a', originalName: 'A', skills: 'Science, Physics', integrity: 5, cunning: 5, strength: 5, cost: 2 } }],
    mission: missionRow('p', 2),
    placedOn: [],
    hand: [],
    discard: [],
    turn: 1,
  };

  it('fills the Persistent dilemmas beneath, the span-4 completed mission, the staffed ship, the Decay and the Trellium-D', () => {
    const { attempt } = pileAttemptOf({
      ...base,
      underMission: [{ originalName: 'Breaking the Ice', keywords: 'Persistent.' }, { originalName: 'Blended' }],
      missions: [{ mission: missionRow('p', 2) }, { mission: missionRow('s', 4), completed: true }],
      core: [{ type: 'event', originalName: 'E', keywords: 'Decay: 3.' }, { type: 'event', originalName: 'F', keywords: 'Decay: 1.' }],
      commanded: [{ type: 'equipment', originalName: 'Trellium-D *VP' }, { type: 'equipment', originalName: 'Tricorder' }],
      staffedShipAtMission: true,
    });
    expect(attempt.table).toMatchObject({
      persistentUnderMission: 1,
      completedSpan4Mission: true,
      staffedShipAtMission: true,
      highestDecay: 3,
      trelliumD: 1,
    });
  });

  it('reads the first-listed skill of a personnel', () => {
    const p = pilePersonnelOf({ name: 'a', originalName: 'A', skills: '2 Physics, Science', integrity: 5, cunning: 5, strength: 5, cost: 2 } as never);
    expect(p.firstSkill).toBe(BOT_SKILLS.indexOf('physics'));
  });
});

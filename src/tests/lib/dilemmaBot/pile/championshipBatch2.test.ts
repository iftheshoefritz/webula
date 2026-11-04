import { botPileOf } from '../../../../lib/dilemmaBot/pile/pile';
import { isLegalPileStack } from '../../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { BOT_SKILLS } from '../../../../lib/dilemmaBot/requirements';
import { SPACE, attemptOf, championshipPiles, cost, group, labelsOf, model, person, play } from './championshipHelpers';

// The Championship titles of batch 2 (#1516): the coverage of the registry, and the plays worked out by hand.

const BATCH_2 = [
  'Rapid Progress', 'Morphogenic Virus', 'Gorgan', 'Overindulgence', 'Pivotal Destiny', 'Infestation', 'Prisoner of the Exile',
  'New Face', 'Neurogenic Field', 'If Shoe Fits, Wear It!', 'Night Terrors', 'Local Trouble', 'Infinite Diversity',
  'Parallel Romance', 'Greater Needs', 'Hazardous Materials', 'Organ Theft', 'Overwhelmed', 'Interstellar Exigence',
  'Reflections', 'Picking Up the Pieces', 'Psychokinetic Control', 'Rush Job', 'Malfunctioning Generator', 'Revealed',
  'Hall of Mirrors', 'Isolated Detachment', 'Lending a Hand', 'Mr. Tricorder', 'Mugato', 'Murder Investigation', 'Pest Control',
  'Rascals', 'Heart to Heart', 'Information Extraction', 'Journey to the Past', 'Lack of Preparation', 'Left Behind',
  'Logical Solution', 'Macrovirus', 'Manufactured Triumph', 'Name and Shame', 'Neural Parasites', 'Nose to Nose', 'Oh No!',
  'Ostensible Malfunction', 'Pattern Loss', 'Quarren Labor Shortage',
];

describe('batch 2 against the Championship piles (#1516)', () => {
  it('has the 48 titles, each with a model', () => {
    expect(new Set(BATCH_2).size).toBe(48);
    expect(BATCH_2.filter((t) => !model(t))).toEqual([]);
  });

  it.each(championshipPiles().map((p) => [p.file, p.text]))('leaves no title of batch 2 missing from %s', (_file, text) => {
    expect(botPileOf(text).missing.filter((t) => BATCH_2.includes(t))).toEqual([]);
  });

  it('lets two Infestations into one stack, and not two copies of another title', () => {
    const attempt = attemptOf(group(6));
    expect(isLegalPileStack(attempt, ['Infestation', 'Infestation'], ['Infestation', 'Infestation'], 4)).toBe(true);
    expect(isLegalPileStack(attempt, ['Night Terrors', 'Night Terrors'], ['Night Terrors', 'Night Terrors'], 4)).toBe(false);
    expect(play(attempt, ['Infestation', 'Infestation']).stopped).toBe(2);
  });
});

describe('the bot-side titles of batch 2 (#1516)', () => {
  it('Rapid Progress names 2 skills the group lacks', () => {
    const r = play(attemptOf(group(3)), ['Rapid Progress']);
    expect(labelsOf(r)).toEqual(['Removed 2 card types. Named Anthropology, Archaeology']);
    expect(r.stopped).toBe(3);
    expect(model('Rapid Progress')).toMatchObject({ category: '6' });
  });

  it('Gorgan discards one more than the dearest card in the hand', () => {
    const r = play(attemptOf(group(2), { table: { handMaxCost: 6 } }), ['Gorgan']);
    expect([labelsOf(r), r.stopped]).toEqual([['Discarded a card of cost 7'], 2]);
    expect(model('Gorgan')).toMatchObject({ category: '4d' });
  });

  it('Infinite Diversity names a skill the group lacks', () => {
    const r = play(attemptOf(group(2, { skills: { anthropology: 1 } })), ['Infinite Diversity']);
    expect(labelsOf(r)).toEqual(['Discarded 2 cards. Named Archaeology']);
    expect(r.stopped).toBe(2);
    expect(model('Infinite Diversity')).toMatchObject({ category: '4b' });
  });

  it('Manufactured Triumph discards one species more than the group has', () => {
    const r = play(attemptOf(group(3)), ['Manufactured Triumph']);
    expect(labelsOf(r)).toEqual(['Discarded 2 personnel: Klingon, Vulcan']);
    expect(r.stopped).toBe(3);
    const many = [person('A', { species: ['vulcan'] }), person('B', { species: ['klingon'] }), person('C')];
    expect(play(attemptOf(many), ['Manufactured Triumph']).stopped).toBe(0);
  });

  it('Hazardous Materials kills two, with 2 Trellium-D', () => {
    const r = play(attemptOf(group(3), { mission: SPACE }), ['Hazardous Materials']);
    expect([labelsOf(r), r.killed]).toEqual([['2 Trellium-D'], 2]);
    expect(model('Hazardous Materials')).toMatchObject({ category: '5b' });
  });

  it('Organ Theft kills only when a copy is on the mission', () => {
    expect(play(attemptOf(group(3)), ['Organ Theft']).killed).toBe(0);
    expect(play(attemptOf(group(3), { table: { onMission: ['Organ Theft'] } }), ['Organ Theft']).killed).toBe(1);
    expect(model('Organ Theft')).toMatchObject({ category: '8' });
  });

  it('Macrovirus kills unless 2 Exobiology and 2 Science', () => {
    expect(play(attemptOf(group(3)), ['Macrovirus']).killed).toBe(1);
    const r = play(attemptOf(group(2, { skills: { exobiology: 1, science: 1 } })), ['Macrovirus']);
    expect([r.killed, r.stopped]).toEqual([0, 1]);
  });

  it('Interstellar Exigence stops a Law personnel and two more', () => {
    const r = play(attemptOf([person('L', { skills: { law: 1 } }), ...group(4)]), ['Interstellar Exigence']);
    expect([labelsOf(r), r.stopped]).toEqual([['2 headquarters'], 3]);
    expect(model('Interstellar Exigence')).toMatchObject({ category: '3' });
  });

  it('Information Extraction loses 5 points only when the mission has an attribute requirement', () => {
    const r = play(attemptOf(group(4), { requirements: 'Cunning>15' }), ['Information Extraction']);
    expect(labelsOf(r)).toEqual(['Lost 5 points']);
    expect(r.stopped).toBe(1);
    expect(r.fail).toBe(true); // Cunning 15 is not more than 25
    expect(labelsOf(play(attemptOf(group(4), { requirements: 'Science' }), ['Information Extraction']))).toEqual([]);
    expect(model('Information Extraction')).toMatchObject({ category: '2' });
  });

  it('Reflections stops the draw deck\'s share of 3 [AU] cards per turn', () => {
    const r = play(attemptOf(group(6), { table: { turn: 3, drawDeckSize: 30, drawDeckEventsOrInterrupts: 10 } }), ['Reflections']);
    expect([labelsOf(r), r.stopped]).toEqual([['9 [AU] cards'], 3]);
    expect(model('Reflections')).toMatchObject({ category: '5b' });
  });

  it('Revealed stops two with a ship at the mission, and kills them without one', () => {
    const r = play(attemptOf(group(3)), ['Revealed']);
    expect([labelsOf(r), r.stopped]).toEqual([['Revealed a personnel with 2 Treachery'], 2]);
    expect(play(attemptOf(group(3), { table: { shipAtMission: false } }), ['Revealed']).killed).toBe(2);
    expect(model('Revealed')).toMatchObject({ category: '5c' });
  });
});

describe('the plays of batch 2, worked out by hand (#1516)', () => {
  it('the variable costs', () => {
    expect(cost('Name and Shame', attemptOf(group(3)))).toBe(3);
    expect(cost('Morphogenic Virus', attemptOf(group(6)))).toBe(4);
    expect(cost('Morphogenic Virus', attemptOf(group(5)))).toBe(0);
    expect(cost('Morphogenic Virus', attemptOf(group(6, { affiliation: 'dominion' })))).toBe(0);
    expect(cost('Hall of Mirrors', attemptOf(group(3)))).toBe(4);
    expect(cost('Malfunctioning Generator', attemptOf(group(3), { table: { completedMissions: 1 } }))).toBe(3);
    expect(cost('Neural Parasites', attemptOf(group(3)))).toBe(2);
    expect(cost('Neural Parasites', attemptOf(group(3), { table: { completedMissions: 1 } }))).toBe(5);
  });

  it('Pattern Loss makes a later Transporters check fail', () => {
    const crew = [person('T', { skills: { transporters: 1, science: 1 } }), ...group(2)];
    // Mugato's second branch needs Transporters; Pest Control's needs Transporters, 2 Treachery, and Cunning>34.
    const team = [person('T', { skills: { transporters: 1, treachery: 2 } }), ...group(6)];
    expect(play(attemptOf(team), ['Pest Control']).stopped).toBe(0);
    expect(play(attemptOf(team), ['Pattern Loss', 'Pest Control']).stopped).toBe(2);
    expect(play(attemptOf(crew), ['Pattern Loss']).stopped).toBe(0);
  });

  it('Psychokinetic Control removes a gained skill for the rest of the attempt', () => {
    const gained = { ...person('G', { skills: { science: 1 } }), printed: { skills: BOT_SKILLS.map(() => 0), attrs: [5, 5, 5] as [number, number, number] } };
    expect(play(attemptOf([gained], { requirements: 'Science' }), []).fail).toBe(false);
    expect(play(attemptOf([gained], { requirements: 'Science' }), ['Psychokinetic Control']).fail).toBe(true);
  });

  it('Parallel Romance gives each personnel +1 per personnel stopped', () => {
    // Four personnel of Cunning 5: two are stopped, the other two have Cunning 7 each, 14>13.
    const r = play(attemptOf(group(4), { requirements: 'Cunning>13' }), ['Parallel Romance']);
    expect([r.stopped, r.fail]).toEqual([2, false]);
    expect(play(attemptOf(group(2), { requirements: 'Cunning>13' }), []).fail).toBe(true);
  });

  it('Lack of Preparation ends the stack unless the group has the mission\'s skills', () => {
    const r = play(attemptOf(group(3), { requirements: 'Science' }), ['Lack of Preparation', 'Prisoner of the Exile']);
    expect(r.brig).toBe(0);
    const sci = play(attemptOf(group(3, { skills: { science: 1 } }), { requirements: 'Science' }), ['Lack of Preparation', 'Prisoner of the Exile']);
    expect(sci.brig).toBe(1);
  });

  it('Left Behind moves two personnel, unless the others have 2 Biology and 2 Medical', () => {
    expect(play(attemptOf(group(4), { mission: SPACE }), ['Left Behind']).moved).toBe(2);
    expect(play(attemptOf(group(4, { skills: { biology: 1, medical: 1 } }), { mission: SPACE }), ['Left Behind']).moved).toBe(0);
    // The selected personnel's own skills do not count.
    expect(play(attemptOf(group(2, { skills: { biology: 1, medical: 1 } }), { mission: SPACE }), ['Left Behind']).moved).toBe(2);
  });

  it('Isolated Detachment stops all unless the selected or the others meet their requirements', () => {
    expect(play(attemptOf(group(4), { mission: SPACE }), ['Isolated Detachment']).stopped).toBe(4);
    const smart = group(3, { attrs: [5, 6, 5], skills: { diplomacy: 1, programming: 1 } });
    expect(play(attemptOf(smart, { mission: SPACE }), ['Isolated Detachment']).stopped).toBe(0);
  });

  it('Logical Solution: the hand, a kill that keeps the requirements, or all stopped', () => {
    expect(play(attemptOf(group(3)), ['Logical Solution']).stopped).toBe(0);
    const k = play(attemptOf(group(3), { table: { handSize: 0 } }), ['Logical Solution']);
    expect([k.killed, k.stopped]).toEqual([1, 0]);
    const all = play(attemptOf(group(3), { requirements: 'Cunning>14', table: { handSize: 0 } }), ['Logical Solution']);
    expect([all.killed, all.stopped]).toEqual([0, 3]);
  });

  it('Rush Job stops one, then one more without four icons, then the bot one more without [Cmd]', () => {
    const at = (staffing?: string[]) => attemptOf(group(5), { mission: SPACE, ship: { name: 'S', range: 7, weapons: 7, shields: 7, ...(staffing ? { staffing } : {}) } });
    expect(play(at(), ['Rush Job']).stopped).toBe(1);
    expect(play(at(['[cmd]', '[stf]', '[stf]', '[stf]']), ['Rush Job']).stopped).toBe(1);
    expect(play(at(['[cmd]', '[stf]']), ['Rush Job']).stopped).toBe(2);
    expect(play(at(['[stf]', '[stf]']), ['Rush Job']).stopped).toBe(3);
  });

  it('Mr. Tricorder beams the bot\'s choice aboard when the rest still meet the requirements', () => {
    expect(play(attemptOf(group(4)), ['Mr. Tricorder']).stopped).toBe(1);
    expect(play(attemptOf(group(4), { requirements: 'Cunning>19' }), ['Mr. Tricorder']).stopped).toBe(2);
  });

  it('Overwhelmed stops the personnel who use their skills for a later "unless"', () => {
    const crew = [person('Bio', { skills: { biology: 2, medical: 2 } }), ...group(3)];
    expect(play(attemptOf(crew), ['Mugato']).stopped).toBe(0);
    expect(play(attemptOf(crew), ['Overwhelmed', 'Mugato']).stopped).toBe(1);
  });

  it('Overindulgence stops all when the group has 5 of the named skill', () => {
    const r = play(attemptOf(group(5, { skills: { science: 1 } })), ['Overindulgence']);
    expect([labelsOf(r), r.stopped]).toEqual([['Named Science'], 5]);
    expect(play(attemptOf(group(4, { skills: { science: 1 } })), ['Overindulgence']).stopped).toBe(0);
  });

  it('New Face and Murder Investigation stop all three or one', () => {
    expect(play(attemptOf(group(3)), ['New Face']).stopped).toBe(1);
    expect(play(attemptOf([person('S', { attrs: [8, 5, 5] }), ...group(2)]), ['New Face']).stopped).toBe(3);
    expect(play(attemptOf([person('S', { skills: { security: 1 } }), ...group(2)]), ['Murder Investigation']).stopped).toBe(3);
    expect(play(attemptOf(group(3)), ['Murder Investigation']).stopped).toBe(1);
  });

  it('Heart to Heart and Nose to Nose stop two that share a skill or a cost', () => {
    expect(play(attemptOf(group(2, { skills: { science: 1 } })), ['Heart to Heart']).stopped).toBe(2);
    expect(play(attemptOf(group(2)), ['Heart to Heart']).stopped).toBe(0);
    expect(play(attemptOf(group(2)), ['Nose to Nose']).stopped).toBe(2);
    expect(play(attemptOf([person('A', { cost: 1 }), person('B', { cost: 2 })]), ['Nose to Nose']).stopped).toBe(0);
  });

  it('Prisoner of the Exile places one in the brig, and Quarren Labor Shortage reads [NA]', () => {
    expect(play(attemptOf(group(3)), ['Prisoner of the Exile']).brig).toBe(1);
    expect(play(attemptOf(group(3, { affiliation: 'non-aligned' })), ['Quarren Labor Shortage']).stopped).toBe(3);
    expect(play(attemptOf(group(3)), ['Quarren Labor Shortage']).stopped).toBe(0);
  });

  it('Local Trouble reads the ship and a headquarters in another quadrant', () => {
    const ship = { name: 'S', range: 7, weapons: 8, shields: 7 };
    expect(play(attemptOf(group(3), { mission: SPACE, ship }), ['Local Trouble']).killed).toBe(2);
    expect(play(attemptOf(group(3), { mission: SPACE, ship, table: { headquartersOtherQuadrant: true } }), ['Local Trouble']).killed).toBe(0);
  });

  it('Rascals kills one per headquarters unless the total cost is under 17', () => {
    expect(play(attemptOf(group(6), { table: { headquarters: 2 } }), ['Rascals']).killed).toBe(2);
    expect(play(attemptOf(group(5)), ['Rascals']).killed).toBe(0);
  });
});

describe('the table facts of batch 2 (#1516)', () => {
  it('fills the hand\'s dearest card, the cards on the mission, the other-quadrant headquarters, the ship and the draw deck', () => {
    const missionRow = (missiontype: string, quadrant: string) => ({ type: 'mission', originalName: `M ${missiontype}${quadrant}`, missiontype, quadrant, skills: 'Science', points: 35, span: 2 });
    const { attempt } = pileAttemptOf({
      cards: [],
      mission: missionRow('s', 'a'),
      ship: { type: 'ship', originalName: 'S', staff: '[Cmd][Stf]', range: 7, weapons: 7, shields: 7 },
      placedOn: [{ originalName: 'Organ Theft' }],
      underMission: [],
      missions: [{ mission: missionRow('s', 'a') }, { mission: missionRow('h', 'd') }],
      hand: [{ type: 'event', cost: 2 }, { type: 'personnel', cost: 5 }],
      discard: [],
      turn: 1,
      shipAtMission: false,
      drawDeck: [{ type: 'event' }, { type: 'interrupt' }, { type: 'personnel' }],
    });
    expect(attempt.table).toMatchObject({
      handMaxCost: 5,
      onMission: ['Organ Theft'],
      headquartersOtherQuadrant: true,
      shipAtMission: false,
      drawDeckSize: 3,
      drawDeckEventsOrInterrupts: 2,
    });
    expect(attempt.ship?.staffing).toEqual(['[cmd]', '[stf]']);
  });
});

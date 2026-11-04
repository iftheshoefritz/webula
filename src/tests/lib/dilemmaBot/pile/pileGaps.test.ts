import { scorePileStack } from '../../../../lib/dilemmaBot/pile/search';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { SPACE, attemptOf, group, labelsOf, model, person, play } from './championshipHelpers';

// Issue #1518: the gaps of the pilot's dilemma models, closed with the owner's answers recorded on the issue.

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

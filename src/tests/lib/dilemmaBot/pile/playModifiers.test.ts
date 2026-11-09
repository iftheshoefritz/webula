// Issue #1597: the modifiers a resolved dilemma leaves for the rest of the attempt. A play starts from
// them, the play reports them once the first dilemma is faced, and the Resolve returns them by card id.
import { SKILL_INDEX } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PlayModifiers } from '../../../../lib/dilemmaBot/pile/model';
import { PlayState, playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { req } from '../../../../lib/dilemmaBot/pile/families';
import { modelOf } from '../../../../lib/dilemmaBot/pile/registry';
import { pileModifiersOf, pileResolveOf, playModifiersOf } from '../../../../lib/dilemmaBot/pile/resolve';
import { PileCardRow, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

const person = (name: string, skills = 'Physics') => ({
  type: 'personnel',
  name: name.toLowerCase(),
  originalName: name,
  skills,
  integrity: 5,
  cunning: 5,
  strength: 5,
  cost: 2,
});

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const IDS = NAMES.map((_, i) => `card-${i + 1}`);

// The four personnel together have Physics x4, and 20 of each attribute: the mission needs Physics and
// Integrity > 19, which they meet with 1 to spare.
function setup(skills = 'Physics x2, Medical', missionSkills = 'Physics and Integrity>19') {
  const mission: PileCardRow = { type: 'mission', name: 'mission p', originalName: 'Mission p', missiontype: 'p', skills: missionSkills, points: 35, span: 3 };
  return pileAttemptOf({
    cards: NAMES.map((name, i) => ({ card: person(name, skills), id: IDS[i] })),
    mission,
    placedOn: [],
    underMission: [],
    missions: [{ mission }],
    hand: [],
    discard: [],
    turn: 3,
  });
}

const stateOf = (attempt: PileAttempt, modifiers?: PlayModifiers) =>
  new PlayState({ attempt: modifiers ? { ...attempt, modifiers } : attempt, rand: seededRandom(1) });

const PHYSICS = SKILL_INDEX.physics;

describe('a play seeded with the modifiers (#1597)', () => {
  it('fails a check that needs a blocked skill', () => {
    const { attempt } = setup();
    expect(stateOf(attempt).has(req('Physics'))).toBe(true);
    expect(stateOf(attempt, { blockedSkills: [PHYSICS] }).has(req('Physics'))).toBe(false);
  });

  it('changes the requirement check with each modifier', () => {
    const { attempt } = setup();
    expect(stateOf(attempt).meetsWithout()).toBe(true);
    // Each personnel loses 1 Integrity: 16, not over 19.
    expect(stateOf(attempt, { attrLoss: [0, 1, 2, 3].map((k) => ({ k, loss: 1 })) }).meetsWithout()).toBe(false);
    // Without Delta, 15 Integrity; +2 to each attribute makes it 21.
    expect(stateOf(attempt).meetsWithout([3])).toBe(false);
    expect(stateOf(attempt, { attrBonus: 2 }).meetsWithout([3])).toBe(true);
    // With abilities off, the bonus does not count.
    expect(stateOf(attempt, { attrBonus: 2, abilitiesOff: true }).meetsWithout([3])).toBe(false);
    // Changed requirements replace the mission's.
    expect(stateOf(attempt, { requirements: req('Diplomacy') }).meetsWithout()).toBe(false);
  });

  it('takes away the first-listed skill', () => {
    // Physics is each personnel's first-listed skill.
    const { attempt } = setup('Physics, Medical', 'Physics');
    expect(stateOf(attempt).meetsWithout()).toBe(true);
    expect(stateOf(attempt, { firstSkillOff: true }).meetsWithout()).toBe(false);
  });

  it('reports the modifiers after the first title only, and a seeded play starts from them', () => {
    const { attempt } = setup();
    const reports: PlayModifiers[] = [];
    const stack = [modelOf('Accelerated Aging')!, modelOf('Dereliction of Duty')!];
    playPileStack(attempt, stack, seededRandom(1), undefined, 0, { modifiers: (m) => reports.push(m) });
    expect(reports).toEqual([{ firstSkillOff: true }]);

    const seeded: PlayModifiers[] = [];
    playPileStack({ ...attempt, modifiers: { attrBonus: 1 } }, [stack[1]], seededRandom(1), undefined, 0, { modifiers: (m) => seeded.push(m) });
    expect(seeded).toEqual([{ attrBonus: 1, abilitiesOff: true }]);
  });

  it('reports nothing from a play without the reporter, as the search and the label run it', () => {
    const { attempt } = setup();
    expect(() => playPileStack(attempt, [modelOf('Accelerated Aging')!], seededRandom(1))).not.toThrow();
  });
});

describe('the modifiers by card id (#1597)', () => {
  it('maps attrLoss from personnel index to card id and back, following the ids when the row changes', () => {
    const play: PlayModifiers = { attrBonus: 1, attrLoss: [{ k: 1, loss: 2 }, { k: 3, loss: 4 }] };
    const saved = pileModifiersOf(play, IDS);
    expect(saved).toEqual({ attrBonus: 1, attrLoss: { 'card-2': 2, 'card-4': 4 } });
    // card-1 left the row and the rest moved up; card-4 is now index 0.
    expect(playModifiersOf(saved, ['card-4', 'card-3', 'card-2'])).toEqual({ attrBonus: 1, attrLoss: [{ k: 0, loss: 4 }, { k: 2, loss: 2 }] });
    // A card no longer in the group is left out.
    expect(playModifiersOf(saved, ['card-3'])).toEqual({ attrBonus: 1 });
  });
});

describe('pileResolveOf and the modifiers (#1597)', () => {
  const resolve = (title: string, modifiers?: PlayModifiers, rand?: () => number) => {
    const { attempt, personnelIds } = setup();
    return pileResolveOf({ originalName: title }, modifiers ? { ...attempt, modifiers } : attempt, {
      personnelIds,
      snapshotIds: IDS,
      where: () => ({ at: 'row', stopped: false }),
      ...(rand ? { rand } : {}),
    });
  };

  it('returns the modifiers a dilemma sets, and none when it changes nothing', () => {
    const r = resolve('Accelerated Aging', undefined, () => 0);
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.modifiers).toEqual({ firstSkillOff: true });
    const again = resolve('Accelerated Aging', { firstSkillOff: true }, () => 0);
    if (!again.resolvable) throw new Error(again.reason);
    expect(again.modifiers).toBeUndefined();
    const plain = resolve('Environmental Contaminants', undefined, () => 0);
    if (!plain.resolvable) throw new Error(plain.reason);
    expect(plain.modifiers).toBeUndefined();
  });

  it('returns the whole modifiers, the earlier ones too, so two Parallel Romances add up', () => {
    const first = resolve('Parallel Romance', { abilitiesOff: true }, () => 0);
    if (!first.resolvable) throw new Error(first.reason);
    expect(first.modifiers).toEqual({ abilitiesOff: true, attrBonus: 2 });
    const second = resolve('Parallel Romance', { abilitiesOff: true, attrBonus: 2 }, () => 0);
    if (!second.resolvable) throw new Error(second.reason);
    expect(second.modifiers).toEqual({ abilitiesOff: true, attrBonus: 4 });
  });
});

// Issues #1597 and #1598: the modifiers a resolved dilemma leaves for the rest of the attempt. A play starts from
// them, the play reports them once the first dilemma is faced, and the Resolve returns them by card id.
import { SKILL_INDEX } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PlayModifiers } from '../../../../lib/dilemmaBot/pile/model';
import { PlayState, playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { req } from '../../../../lib/dilemmaBot/pile/families';
import { modelOf } from '../../../../lib/dilemmaBot/pile/registry';
import { modifiersClause, modifiersText, pileModifiersOf, pileResolveOf, pileRevealPicksOf, playModifiersOf } from '../../../../lib/dilemmaBot/pile/resolve';
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
    const played = modifiers ? { ...attempt, modifiers } : attempt;
    // The roll the reveal keeps (#1628), for a title that selects at random.
    const revealPicks = rand ? pileRevealPicksOf({ originalName: title }, played, { personnelIds, rand }) : undefined;
    return pileResolveOf({ originalName: title }, played, {
      personnelIds,
      snapshotIds: IDS,
      where: () => ({ at: 'row', stopped: false }),
      ...(revealPicks ? { revealPicks } : {}),
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

describe('the text of the modifiers (#1598)', () => {
  const names: Record<string, string> = { 'card-1': 'Data', 'card-2': 'Worf', 'card-3': 'Troi' };
  const nameOf = (id: string) => names[id] ?? 'A personnel';

  it('names each modifier, and none for none', () => {
    expect(modifiersText(undefined, nameOf)).toBe('');
    expect(modifiersText({}, nameOf)).toBe('');
    expect(modifiersText({ abilitiesOff: true }, nameOf)).toBe('Abilities off');
    expect(modifiersText({ firstSkillOff: true }, nameOf)).toBe('First skill off');
    expect(modifiersText({ blockedSkills: [SKILL_INDEX.navigation, PHYSICS] }, nameOf)).toBe('Navigation, Physics blocked');
    expect(modifiersText({ attrBonus: 1 }, nameOf)).toBe('+1 attributes');
    expect(modifiersText({ attrLoss: { 'card-1': 2, 'card-2': 2, 'card-3': 1 } }, nameOf)).toBe('\u22121 attributes: Troi \u00b7 \u22122 attributes: Data, Worf');
    expect(modifiersText({ overwhelmed: true }, nameOf)).toBe('Overwhelmed');
    expect(modifiersText({ requirements: req('Diplomacy') }, nameOf)).toBe('Requirements changed');
    expect(modifiersText({ abilitiesOff: true, overwhelmed: true, attrBonus: 2 }, nameOf)).toBe('Abilities off \u00b7 +2 attributes \u00b7 Overwhelmed');
  });

  it('names only what a Resolve adds, for the rest of the attempt', () => {
    expect(modifiersClause({}, { firstSkillOff: true }, nameOf)).toBe('first skill off for the rest of the attempt');
    expect(modifiersClause({ abilitiesOff: true }, { abilitiesOff: true, attrBonus: 4 }, nameOf)).toBe('+4 attributes for the rest of the attempt');
    expect(modifiersClause({ attrBonus: 2 }, { attrBonus: 4 }, nameOf)).toBe('+2 attributes for the rest of the attempt');
    expect(modifiersClause({ attrLoss: { 'card-1': 1 } }, { attrLoss: { 'card-1': 3 } }, nameOf)).toBe('\u22122 attributes: Data for the rest of the attempt');
    expect(modifiersClause({ abilitiesOff: true }, { abilitiesOff: true }, nameOf)).toBe('');
    expect(modifiersClause({}, undefined, nameOf)).toBe('');
  });
});

describe('the Resolve names the modifiers (#1598)', () => {
  it('previews a modifier-only dilemma by its modifier, not "No effect"', () => {
    const { attempt, personnelIds } = setup();
    const where = () => ({ at: 'row' as const, stopped: false });
    const r = pileResolveOf({ originalName: 'Accelerated Aging' }, attempt, { personnelIds, snapshotIds: IDS, where });
    if (!r.resolvable) throw new Error(r.reason);
    expect(r.preview).toBe('First skill off for the rest of the attempt');
    expect(r.modifiersClause).toBe('first skill off for the rest of the attempt');
    const again = pileResolveOf({ originalName: 'Accelerated Aging' }, { ...attempt, modifiers: { firstSkillOff: true } }, { personnelIds, snapshotIds: IDS, where });
    if (!again.resolvable) throw new Error(again.reason);
    expect(again.preview).toBe('No effect');
    expect(again.modifiersClause).toBeUndefined();
  });

  it('stops the skill users of a passing check under a seeded Overwhelmed, and previews them as Overwhelmed', () => {
    // An Old Debt: unless Biology, Physics, and Cunning>32 or Intelligence and 2 Medical.
    const { attempt, personnelIds } = setup('Intelligence, Medical');
    const where = () => ({ at: 'row' as const, stopped: false });
    const input = { personnelIds, snapshotIds: IDS, where };
    const plain = pileResolveOf({ originalName: 'An Old Debt' }, attempt, input);
    if (!plain.resolvable) throw new Error(plain.reason);
    expect(plain.preview).toBe('No effect');
    const overwhelmed = pileResolveOf({ originalName: 'An Old Debt' }, { ...attempt, modifiers: { overwhelmed: true } }, input);
    if (!overwhelmed.resolvable) throw new Error(overwhelmed.reason);
    expect(overwhelmed.preview).toMatch(/^Stops \w+, \w+ \(Overwhelmed\)$/);
    expect(overwhelmed.changes).toEqual([{ op: 'stop', ids: expect.arrayContaining([expect.any(String)]) }]);
    expect(overwhelmed.changes[0].ids).toHaveLength(2);
  });
});

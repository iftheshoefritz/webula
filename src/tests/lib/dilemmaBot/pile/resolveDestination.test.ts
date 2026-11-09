// Issue #1599: where a resolved dilemma goes. The press play's records decide a `returnsToPile` or a
// `notPlacedUnder`, and a model with `goesUnder: false` goes to its `placement`.
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { modelOf } from '../../../../lib/dilemmaBot/pile/registry';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';

import { pileResolveOf } from '../../../../lib/dilemmaBot/pile/resolve';
import { PileCardRow, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const IDS = NAMES.map((_, i) => `card-${i + 1}`);

function setup(strength = 5, missionSkills = 'Physics') {
  const mission: PileCardRow = { type: 'mission', name: 'mission p', originalName: 'Mission p', missiontype: 'p', skills: missionSkills, points: 35, span: 3 };
  return pileAttemptOf({
    cards: NAMES.map((name, i) => ({
      card: { type: 'personnel', name: name.toLowerCase(), originalName: name, skills: 'Physics', integrity: 5, cunning: 5, strength, cost: 2 },
      id: IDS[i],
    })),
    mission,
    placedOn: [],
    underMission: [],
    missions: [{ mission }],
    hand: [],
    discard: [],
    turn: 3,
  });
}

function resolve(title: string, strength = 5, missionSkills = 'Physics') {
  const { attempt, personnelIds } = setup(strength, missionSkills);
  const input = { personnelIds, snapshotIds: IDS, where: () => ({ at: 'row' as const, stopped: false }) };
  const preview = pileResolveOf({ originalName: title }, attempt, input);
  const press = pileResolveOf({ originalName: title }, attempt, { ...input, rand: seededRandom(3) });
  if (!preview.resolvable) throw new Error(preview.reason);
  if (!press.resolvable) throw new Error(press.reason);
  return { preview, press };
}

describe('the destination of a resolved dilemma (#1599)', () => {
  it('sends a plain title under the mission, and keeps its preview', () => {
    const { preview, press } = resolve('Environmental Contaminants');
    expect(preview.destination).toBe('under');
    expect(press.destination).toBe('under');
    expect(preview.preview).not.toMatch(/goes|returns|placed/);
  });

  it('returns Adopted Authority to the dilemma pile when its effect fires, and sends it under when it does not', () => {
    // Every attribute 5 or more: it stops two and returns.
    const fired = resolve('Adopted Authority');
    expect(fired.press.destination).toBe('pileBottom');
    expect(fired.preview.preview).toMatch(/; returns to the dilemma pile$/);
    // Strength 4: it stops the one selected and goes under.
    const plain = resolve('Adopted Authority', 4);
    expect(plain.press.destination).toBe('under');
    expect(plain.preview.preview).not.toMatch(/returns/);
  });

  it('sends a notPlacedUnder title to the core', () => {
    // Covert Ambush: unless a personnel with 2 Engineer or 2 Programming, it goes to your core.
    const { preview, press } = resolve('Covert Ambush');
    expect(press.destination).toBe('core');
    expect(preview.preview).toBe('No effect; goes to your core');
  });

  it.each([
    ['Hard Time', 'core', 'goes to your core'],
    ['Pattern Loss', 'placedOn', 'is placed on the mission'],
    ['Ostensible Malfunction', 'pileBottom', 'returns to the dilemma pile'],
    ['All-Consuming Evil', 'pileTop', 'goes on top of the dilemma pile'],
  ])('sends %s, which never goes under, to its placement', (title, destination, words) => {
    const { preview, press } = resolve(title);
    expect(press.destination).toBe(destination);
    expect(preview.preview.endsWith(`; ${words}`)).toBe(true);
  });

  it('gives a placement to every model that never goes under the mission', () => {
    const missing = Array.from(REGISTRY.values())
      .filter((m) => !m.goesUnder && !m.placement)
      .map((m) => m.title);
    expect(missing).toEqual([]);
    expect(Array.from(REGISTRY.values()).filter((m) => m.goesUnder && m.placement).map((m) => m.title)).toEqual([]);
  });
});

describe('the Resolve changes the stack (#1600)', () => {
  it('ends the stack with Lack of Preparation when the group lacks the skills of the mission', () => {
    const fired = resolve('Lack of Preparation', 5, 'Diplomacy');
    expect(fired.press.endsStack).toBe(true);
    expect(fired.press.destination).toBe('pileBottom');
    expect(fired.preview.preview).toBe('No effect; returns to the dilemma pile with the rest of the stack');
    const plain = resolve('Lack of Preparation');
    expect(plain.press.endsStack).toBeUndefined();
    expect(plain.press.destination).toBe('under');
  });

  it('marks where each fetching title takes its dilemma', () => {
    expect(modelOf('Vault of Tomorrow')?.fetchesFrom).toBe('botPile');
    expect(modelOf('Talosian Trial')?.fetchesFrom).toBe('underMissions');
  });

  it('counts the extra budget of the card at the head of the stack, as the play of a fetched top card is', () => {
    // Entanglement costs 1 and adds 3: at a spend of 0, the Well-Prepared Defenses after it (cost 2) is faced.
    const { attempt } = setup();
    const trace: string[] = [];
    playPileStack({ ...attempt, spend: 0 }, [modelOf('Entanglement')!, modelOf('Well-Prepared Defenses')!], seededRandom(1), (l) => trace.push(l));
    expect(trace.some((l) => l.includes('overcome'))).toBe(false);
    expect(trace.some((l) => l.startsWith('Well-Prepared Defenses:'))).toBe(true);
  });
});

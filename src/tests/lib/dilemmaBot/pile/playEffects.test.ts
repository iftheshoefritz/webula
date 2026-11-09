import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { DilemmaModel, PileAttempt, PilePersonnel, PileResult, PileTable, PlayEffect } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { PilePersonnelRow, PileTableInput, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';

// Issue #1579: a play records the effects of each verb, with the personnel it hit by index into
// `attempt.personnel`, and `pileAttemptOf` gives the card id of each of those personnel.

function person(name: string): PilePersonnel {
  const levels = BOT_SKILLS.map(() => 0);
  return {
    name,
    cost: 3,
    attrs: [5, 5, 5],
    skills: levels,
    species: ['human'],
    affiliation: 'federation',
    skillDots: 0,
    hologram: false,
    printed: { skills: levels.slice(), attrs: [5, 5, 5] },
  };
}

function attemptOf(kind: 'planet' | 'space', over: Partial<Omit<PileAttempt, 'table'>> & { table?: Partial<PileTable> } = {}): PileAttempt {
  const { table = {}, ...rest } = over;
  return {
    personnel: Array.from({ length: 6 }, (_, k) => person(`P${k}`)),
    requirements: parseRequirementBranches('Cunning>0')!,
    mission: { kind, points: 35, span: 2, nebula: false },
    ...(kind === 'space' ? { ship: { name: 'Ship', range: 8, weapons: 6, shields: 6 } } : {}),
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
    botPile: ['Cultural Differences', 'No Kill I'],
    ...rest,
  };
}

const model = (title: string) => REGISTRY.get(title)!;

function play(attempt: PileAttempt, stack: DilemmaModel[], seed = 7): { result: PileResult; effects: PlayEffect[] } {
  const effects: PlayEffect[] = [];
  const result = playPileStack(attempt, stack, seededRandom(seed), undefined, 0, { effects: (e) => effects.push(e) });
  return { result, effects };
}

/** The counts of `PileResult` the recorded effects add up to. */
function sums(effects: PlayEffect[]) {
  const out = { stopped: 0, killed: 0, heldInCore: 0, moved: 0, brig: 0, returned: 0, shipLost: 0, backToPile: 0, notUnder: 0, fetchedNothing: 0 };
  const labels: { title: string; label: string }[] = [];
  for (const e of effects) {
    if (e.op === 'stop') out.stopped += e.ks.length;
    else if (e.op === 'kill' || e.op === 'remove') out.killed += e.ks.length;
    else if (e.op === 'brig') out.brig += e.ks.length;
    else if (e.op === 'holdInCore') out.heldInCore += e.ks.length;
    else if (e.op === 'move') out.moved += e.ks.length;
    else if (e.op === 'returnToHand') out.returned += e.ks.length;
    else if (e.op === 'loseShip') out[e.count] += e.ks.length;
    else if (e.op === 'returnsToPile') out.backToPile++;
    else if (e.op === 'notPlacedUnder') out.notUnder++;
    else if (e.op === 'addBestOnTop' && e.added === null) out.fetchedNothing++;
    else if (e.op === 'label') labels.push({ title: e.title, label: e.label });
  }
  return { out, labels };
}

const countsOf = (r: PileResult) => ({
  stopped: r.stopped,
  killed: r.killed,
  heldInCore: r.heldInCore,
  moved: r.moved,
  brig: r.brig,
  returned: r.returned,
  shipLost: r.shipLost,
  backToPile: r.backToPile ?? 0,
  notUnder: r.notUnder ?? 0,
  fetchedNothing: r.fetchedNothing ?? 0,
});

const PLAYED = Array.from(REGISTRY.values()).filter((m) => m.status === 'play');

describe('the effects of a play (#1579)', () => {
  it.each(PLAYED.map((m) => [m.title, m] as const))('%s: the recorded effects add up to the PileResult', (_, m) => {
    const attempt = attemptOf(m.kind === 'space' ? 'space' : 'planet');
    // A stack after the title, so a fetching title and a title that ends the stack have something to act on.
    const stack = [m, model(m.kind === 'space' ? 'Outclassed' : 'No Kill I')].filter((x, i, a) => a.indexOf(x) === i);
    const { result, effects } = play(attempt, stack);
    const { out, labels } = sums(effects);
    expect(out).toEqual(countsOf(result));
    expect(labels).toEqual(result.labels);
    for (const e of effects) {
      if ('ks' in e) for (const k of e.ks) expect(k >= 0 && k < attempt.personnel.length).toBe(true);
    }
    // The recorder changes nothing: the play with no recorder returns the same result.
    expect(playPileStack(attempt, stack, seededRandom(7))).toEqual(result);
  });

  it('records remove, not kill, for Frozen by Fear and Flare of Rage, and counts them killed', () => {
    for (const [title, kind] of [['Frozen by Fear', 'space'], ['Flare of Rage', 'planet']] as const) {
      const { result, effects } = play(attemptOf(kind), [model(title)]);
      expect(effects.filter((e) => e.op === 'kill')).toEqual([]);
      const removed = effects.filter((e) => e.op === 'remove');
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ title, op: 'remove' });
      expect('ks' in removed[0] && removed[0].ks).toHaveLength(2);
      expect(result.killed).toBe(2);
    }
  });

  it('records the fetched dilemma once, from the real play, and nothing from the play-ahead of a fetch', () => {
    const { result, effects } = play(attemptOf('planet'), [model('Vault of Tomorrow'), model('No Kill I')]);
    expect(result.labels).toEqual([{ title: 'Vault of Tomorrow', label: 'Added Cultural Differences' }]);
    expect(effects.filter((e) => e.op === 'addBestOnTop')).toEqual([{ title: 'Vault of Tomorrow', op: 'addBestOnTop', added: 'Cultural Differences' }]);
    const fetched = effects.filter((e) => e.title === 'Cultural Differences');
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatchObject({ op: 'kill' });
    expect(sums(effects).out).toEqual(countsOf(result));
  });

  it('records the stack ending of Lack of Preparation', () => {
    const { result, effects } = play(attemptOf('planet', { requirements: parseRequirementBranches('Physics')! }), [model('Lack of Preparation'), model('No Kill I')]);
    expect(effects).toEqual([{ title: 'Lack of Preparation', op: 'endStack' }]);
    expect(result.killed).toBe(0);
  });

  it('records a stop by Chula: The Game under the Chula dilemma, with why', () => {
    const { effects } = play(attemptOf('planet', { gameOnMission: 1 }), [model('Chula: Pick One to Save Two')]);
    expect(effects[0]).toMatchObject({ title: 'Chula: Pick One to Save Two', why: 'Chula: The Game', op: 'stop' });
  });
});

describe('the card ids of pileAttemptOf (#1579)', () => {
  const person = (name: string, extra: Record<string, unknown> = {}) => ({
    type: 'personnel',
    name: name.toLowerCase(),
    originalName: name,
    skills: 'Physics',
    integrity: 5,
    cunning: 5,
    strength: 5,
    cost: 2,
    ...extra,
  });
  const input = (cards: PileTableInput['cards']): PileTableInput => ({
    cards,
    mission: { type: 'mission', name: 'm', originalName: 'M', missiontype: 'p', skills: 'Physics', points: 35, span: 3 },
    placedOn: [],
    underMission: [],
    missions: [],
    hand: [],
    discard: [],
    turn: 1,
  });

  it('gives the ids of the unstopped personnel only, in row order', () => {
    const { attempt, personnelIds } = pileAttemptOf(
      input([
        { id: 'card-1', card: person('Alpha') },
        { id: 'card-2', card: person('Beta'), stopped: true },
        { id: 'card-3', card: { ...person('Tricorder'), type: 'equipment' } },
        { id: 'card-4', card: { ...person('Some Event'), type: 'event' } },
        { id: 'card-5', card: person('Gamma') },
        { card: person('Delta') },
      ]),
    );
    expect(personnelIds).toEqual(['card-1', 'card-5', undefined]);
    expect(attempt.personnel.map((p) => p.name)).toEqual(['Alpha', 'Gamma', 'Delta']);
  });

  it('keeps the order with a partner pair', () => {
    // Deanna Troi Major Rakal gains with a Dissident: the `livePartners` path of `partnerGroupOf`.
    const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
    const byName = (name: string) => {
      const r = rows.find((row) => row[head.indexOf('Name')] === name)!;
      return { ...Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()])), originalName: name, type: 'personnel' } as unknown as PilePersonnelRow;
    };
    const { attempt, personnelIds } = pileAttemptOf(
      input([
        { id: 'card-1', card: person('Alpha') },
        { id: 'card-2', card: byName('Deanna Troi Major Rakal') },
        { id: 'card-3', card: person('Beta'), stopped: true },
        { id: 'card-4', card: byName('N\'Vek Soldier of the Underground') },
      ]),
    );
    expect(attempt.livePartners?.length).toBeGreaterThan(0);
    expect(personnelIds).toEqual(['card-1', 'card-2', 'card-4']);
    expect(attempt.personnel.map((p) => p.name)).toEqual(['Alpha', 'Deanna Troi Major Rakal', 'N\'Vek Soldier of the Underground']);
  });
});

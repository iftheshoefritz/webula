// Issue #1845: the 15 dilemmas of set 67, 60S, that fit the families of the registry. Each is played by
// its Resolve, with the roll the reveal keeps from a seeded random function, against a crew of four.
import { costOf } from '../../../../lib/dilemmaBot/pile/model';
import { pileLabelOf } from '../../../../lib/dilemmaBot/pile/label';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { pileResolveOf, pileRevealPicksOf } from '../../../../lib/dilemmaBot/pile/resolve';
import { PileCardRow, pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';

const SET_60S: [string, 'planet' | 'space' | 'dual', number][] = [
  ['Alice in Wonderland', 'planet', 2], ['Chaotic Space', 'space', 2], ['Cunning Illusion', 'dual', 1],
  ['Emergency Surgery', 'dual', 1], ['Face Your Fate', 'space', 2], ['Frozen in Place', 'planet', 0],
  ['Ki-ty-ha', 'planet', 2], ['Major-General\'s Song', 'dual', 2], ['Pandora\'s Box', 'space', 2],
  ['Pools of Mak\'ala', 'planet', 3], ['Slide Bolt', 'planet', 2], ['Unwarranted Interrogation', 'dual', 3],
  ['Unwinnable Duel', 'planet', 2], ['Urgent Search', 'dual', 4], ['You Need Therapy!', 'dual', 2],
];

interface Crew {
  skills?: string;
  keywords?: string;
  attrs?: [number, number, number];
}

const IDS = ['card-1', 'card-2', 'card-3', 'card-4'];
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta'];
const mission: PileCardRow = { type: 'mission', name: 'mission p', originalName: 'Mission p', missiontype: 'p', skills: 'Physics', points: 35, span: 3 };

function setup(crew: Crew[]) {
  return pileAttemptOf({
    cards: crew.map(({ skills = 'Physics', keywords = '', attrs = [5, 5, 5] }, i) => ({
      card: { type: 'personnel', name: NAMES[i].toLowerCase(), originalName: NAMES[i], skills, keywords, integrity: attrs[0], cunning: attrs[1], strength: attrs[2], cost: 2 },
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

const four = (crew: Crew = {}) => IDS.map(() => crew);

/** The Resolve of `title` against `crew`, with the roll the reveal keeps from `seed`. */
function resolve(title: string, crew: Crew[], seed = 3) {
  const { attempt, personnelIds } = setup(crew);
  const row = { originalName: title };
  const revealPicks = pileRevealPicksOf(row, attempt, { personnelIds, rand: seededRandom(seed) });
  const r = pileResolveOf(row, attempt, {
    personnelIds, snapshotIds: IDS.slice(0, crew.length), where: () => ({ at: 'row' as const, stopped: false }), ...(revealPicks ? { revealPicks } : {}),
  });
  if (!r.resolvable) throw new Error(r.reason);
  const label = pileLabelOf(row, attempt, { personnelIds, ...(revealPicks ? { revealPicks } : {}) });
  return { r, picks: revealPicks ?? [], label };
}

const idsOf = (r: ReturnType<typeof resolve>['r'], op: string) => (r.resolvable ? r.changes.filter((c) => c.op === op).flatMap((c) => c.ids) : []);
const sorted = (ids: string[]) => ids.slice().sort();

describe('the 15 dilemmas of 60S in the registry (#1845)', () => {
  // pileBot.test.ts checks every model's kind and cost against the card data.
  it.each(SET_60S)('models %s as a %s dilemma of cost %d, as the card data prints it', (title, kind, cost) => {
    const model = REGISTRY.get(title)!;
    expect(model).toMatchObject({ kind, printedCost: cost, status: 'play' });
    expect(costOf(model, setup(four()).attempt)).toBe(cost);
  });

  it('never labels a dilemma with its own title (#1574)', () => {
    for (const [title] of SET_60S) {
      const { label } = resolve(title, four());
      expect(label ?? '').not.toContain(title);
    }
  });
});

describe('the random selects of 60S', () => {
  it('Alice in Wonderland stops the three it selects', () => {
    const { r, picks } = resolve('Alice in Wonderland', four());
    expect(picks[0]).toHaveLength(3);
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(picks[0]));
    expect(r.resolvable && r.destination).toBe('under');
  });

  it('Cunning Illusion stops the parity of Cunning more of the three share, and labels the choice', () => {
    const crew = [{ attrs: [5, 4, 5] }, { attrs: [5, 6, 5] }, { attrs: [5, 7, 5] }, { attrs: [5, 8, 5] }] as Crew[];
    const { r, picks, label } = resolve('Cunning Illusion', crew);
    const cunning = (id: string) => crew[IDS.indexOf(id)].attrs![1];
    const even = picks[0].filter((id) => cunning(id) % 2 === 0);
    const odd = picks[0].filter((id) => cunning(id) % 2 !== 0);
    const hit = odd.length > even.length ? odd : even;
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(hit));
    expect(label).toBe(`Chose ${hit === odd ? 'odd' : 'even'} Cunning`);
  });

  it('Emergency Surgery kills one the bot chooses when none of the three has Biology or Medical, and nothing otherwise', () => {
    const { r, label } = resolve('Emergency Surgery', four());
    const killed = idsOf(r, 'kill');
    expect(killed).toHaveLength(1);
    expect(label).toBe(`Chose ${NAMES[IDS.indexOf(killed[0])]}`);
    const { r: healed } = resolve('Emergency Surgery', four({ skills: 'Medical' }));
    expect(healed.resolvable && healed.changes).toEqual([]);
  });

  it('Frozen in Place stops both under total attributes 36, and the bot kills one of them otherwise', () => {
    const { r, picks } = resolve('Frozen in Place', four({ attrs: [5, 5, 5] }));
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(picks[0]));
    const { r: strong } = resolve('Frozen in Place', four({ attrs: [6, 6, 6] }));
    expect(idsOf(strong, 'kill')).toHaveLength(1);
    expect(idsOf(strong, 'stop')).toEqual([]);
  });

  it('Slide Bolt stops one for each Physics personnel with Cunning<7, and three when there is none', () => {
    const crew = [{ attrs: [5, 5, 5] }, { attrs: [5, 9, 5] }, { attrs: [5, 9, 5] }, { attrs: [5, 9, 5] }] as Crew[];
    expect(idsOf(resolve('Slide Bolt', crew).r, 'stop')).toHaveLength(1);
    expect(idsOf(resolve('Slide Bolt', four({ attrs: [5, 9, 5] })).r, 'stop')).toHaveLength(3);
  });

  it('Unwarranted Interrogation stops one for each non-Honor Security personnel, and the bot kills one when there is none', () => {
    const crew = [{ skills: 'Security' }, { skills: 'Security' }, { skills: 'Honor Security' }, {}];
    expect(idsOf(resolve('Unwarranted Interrogation', crew).r, 'stop')).toHaveLength(2);
    const { r, label } = resolve('Unwarranted Interrogation', four());
    const killed = idsOf(r, 'kill');
    expect(killed).toHaveLength(1);
    expect(label).toBe(`Chose ${NAMES[IDS.indexOf(killed[0])]}`);
  });

  it('Urgent Search names the attribute the most share, and stops the others who share the selected value', () => {
    const crew = [{ attrs: [5, 6, 7] }, { attrs: [5, 7, 7] }, { attrs: [5, 8, 6] }, { attrs: [6, 9, 6] }] as Crew[];
    const { r, picks, label } = resolve('Urgent Search', crew);
    expect(label).toBe('Named Integrity');
    const sel = picks[0][0];
    const value = crew[IDS.indexOf(sel)].attrs![0];
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(IDS.filter((id) => id !== sel && crew[IDS.indexOf(id)].attrs![0] === value)));
  });
});

describe('the unless titles of 60S', () => {
  it.each(['Face Your Fate', 'Ki-ty-ha', 'Unwinnable Duel'])('%s stops one at random and goes to your core', (title) => {
    const { r, picks } = resolve(title, four());
    expect(idsOf(r, 'stop')).toEqual(picks[0]);
    expect(r.resolvable && r.destination).toBe('core');
  });

  it.each([['Face Your Fate', 'Law'], ['Ki-ty-ha', 'Telepathy'], ['Unwinnable Duel', 'Intelligence']])('%s stops nobody with %s, and still goes to your core', (title, skill) => {
    const { r } = resolve(title, four({ skills: skill }));
    expect(r.resolvable && r.changes).toEqual([]);
    expect(r.resolvable && r.destination).toBe('core');
  });

  it('Chaotic Space stops nobody and goes under', () => {
    const { r } = resolve('Chaotic Space', four());
    expect(r.resolvable && r.changes).toEqual([]);
    expect(r.resolvable && r.destination).toBe('under');
  });

  it('Major-General\'s Song stops everyone without the skills, and only those who use them otherwise', () => {
    expect(idsOf(resolve('Major-General\'s Song', four()).r, 'stop')).toHaveLength(4);
    const crew = [{ skills: 'Biology Geology' }, { skills: 'Science' }, {}, {}];
    expect(sorted(idsOf(resolve('Major-General\'s Song', crew).r, 'stop'))).toEqual(['card-1', 'card-2']);
  });

  it('Pandora\'s Box stops everyone without either set of skills', () => {
    expect(idsOf(resolve('Pandora\'s Box', four()).r, 'stop')).toHaveLength(4);
    expect(idsOf(resolve('Pandora\'s Box', four({ skills: 'Intelligence Leadership Officer' })).r, 'stop')).toEqual([]);
  });

  it('Pools of Mak\'ala returns one to the hand and stops the rest, unless a Host is there', () => {
    const { r, picks } = resolve('Pools of Mak\'ala', four());
    expect(idsOf(r, 'returnToHand')).toEqual(picks[0]);
    expect(sorted(idsOf(r, 'stop'))).toEqual(sorted(IDS.filter((id) => id !== picks[0][0])));
    const host = [{ keywords: 'Host.' }, {}, {}, {}];
    expect(resolve('Pools of Mak\'ala', host).r).toMatchObject({ changes: [] });
  });

  it('You Need Therapy! labels the discard and stops everyone without 3 Leadership', () => {
    const { r, label } = resolve('You Need Therapy!', four());
    expect(label).toBe('Discarded an Infiltrator');
    expect(idsOf(r, 'stop')).toHaveLength(4);
    expect(idsOf(resolve('You Need Therapy!', four({ skills: 'Leadership' })).r, 'stop')).toEqual([]);
  });
});

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { TRISTAN_ADAMS_TITLE } from '../../app/decks/practice/dilemmaPrevention';
import { ROADBLOCK_TITLE } from '../../app/decks/practice/selfReplicatingRoadblock';
import { COST_REGISTRY, COST_ROWS } from '../../lib/costModels/registry';
import { MISSION_MODEL_TITLES } from '../../lib/missionModels';
import { modifierTitles, type Quantity } from '../../lib/modifiers';
import { REGISTRY as DILEMMA_REGISTRY } from '../../lib/dilemmaBot/pile/registry';
import {
  clausesOf,
  clauseTextsOf,
  Concern,
  coverageMarkdown,
  coverageReport,
  CoverageCard,
  ModelledBy,
  ongoingGroupOf,
  ongoingPermissionOf,
  ongoingSentencesOf,
  SentenceModelledBy,
  shippedDeckTitles,
} from '../../lib/modelCoverage';
import { placeCoverageOf } from '../../lib/playPlaces/coverage';
import { PLAY_MODEL_TITLES } from '../../lib/playModels/coverage';
import { orderModelOf } from '../../lib/orderModels';
import { RESOLVE_MODELS } from '../../lib/resolveModels';
import { TRIGGER_TITLES } from '../../lib/triggers';
import { ATTEMPT_ABILITY_TITLES } from '../../lib/attemptAbilities';
import { cardRows, shippedDecks } from './backlogData';
import { draftMarkdown, draftReport } from '../../lib/cardDrafts';

// The unified model backlog (#1861, part of #1860): every title the shipped decks play, its text split
// into clauses, each clause filed under a gameplay concern and checked against that concern's registry.
// `MODEL_BACKLOG=1 yarn test modelBacklog` prints the report; `MODEL_BACKLOG=<path>.md` writes it there.
// The test is silent otherwise.

const lower = (titles: Iterable<string>) => new Set([...titles].map((t) => t.toLowerCase()));

const PLAY = lower(PLAY_MODEL_TITLES);
const RESOLVE = lower(RESOLVE_MODELS.map((m) => m.title));
// The modifier registry (#1887): the attribute, Range and span rows, never a permission's (#1915).
const AMOUNTS: Quantity[] = ['integrity', 'cunning', 'strength', 'range', 'weapons', 'shields', 'span', 'quadrantWaiver', 'cost', 'counterLimit'];
const MODIFIERS = new Set(modifierTitles(AMOUNTS).keys());
// The cost and counter rows (#1888), so a title with rows and no residual model still counts for `cost`.
const COST_ROW_TITLES = lower(COST_ROWS.map((r) => r.title));
// The trigger registry (#1903): a trigger or an interrupt clause is modelled when the registry holds its title.
const TRIGGERS = lower(TRIGGER_TITLES);
const ATTEMPT_ABILITIES = lower(ATTEMPT_ABILITY_TITLES);
// The mission registry (#1907): every row's title.
const MISSION = lower(MISSION_MODEL_TITLES);
/**
 * The cards a module of their own models outside every registry, with the concerns of their clauses
 * that module covers. A title here is one more sign of the piecemeal: its home is a file, not a registry.
 */
const BESPOKE: Record<string, Concern[]> = {
  [ROADBLOCK_TITLE.toLowerCase()]: ['ongoing'],
  [TRISTAN_ADAMS_TITLE.toLowerCase()]: ['ongoing', 'trigger'],
};

/** Whether the registries of today model a clause of `concern` on `title`. */
export const modelledToday: ModelledBy = (concern, title, card, clause) => {
  const key = title.toLowerCase();
  if (BESPOKE[key]?.includes(concern)) return true;
  switch (concern) {
    case 'dilemma':
      return DILEMMA_REGISTRY.get(title)?.status === 'play';
    case 'cost':
      return COST_REGISTRY.has(title) || COST_ROW_TITLES.has(key);
    case 'whenPlayed':
      return PLAY.has(key);
    case 'eventResolve':
      return RESOLVE.has(key);
    case 'attributes':
      // An attempt ability (#1835) changes attributes for the rest of the attempt.
      return MODIFIERS.has(key) || ATTEMPT_ABILITIES.has(key);
    case 'mission':
      return MISSION.has(key) || COST_REGISTRY.has(title) || COST_ROW_TITLES.has(key);
    case 'place':
      return placeCoverageOf({ ...card }) !== 'unread';
    case 'order': {
      // The order registry (#1866) by the clause's place among the card's orders, so one row marks one order.
      const index = clausesOf(card)
        .filter((c) => c.concern === 'order')
        .findIndex((c) => c.text === clause);
      return index >= 0 && orderModelOf(title, index) !== undefined;
    }
    case 'trigger':
    case 'interrupt':
      return TRIGGERS.has(key);
    default:
      return false;
  }
};

/**
 * Whether the registries of today model one sentence of an `ongoing` clause (#1915): a permission when the title has
 * a row of its quantity, an attribute change when it has an attribute row, a counter cap when the cost registry holds
 * the title, and a reminder always.
 */
export const ongoingModelledToday: SentenceModelledBy = (title, _card, { text, group }) => {
  const key = title.toLowerCase();
  const permission = ongoingPermissionOf(group, text);
  if (permission) return modifierTitles([permission]).has(key);
  switch (group) {
    case 'reminder':
      return true;
    case 'attributes':
      return MODIFIERS.has(key);
    case 'gain':
      // A skill another personnel gains (#1836).
      return modifierTitles(['skills']).has(key);
    case 'counterSpend':
      return COST_REGISTRY.has(title) || COST_ROW_TITLES.has(key);
    default:
      return false;
  }
};

const row = (name: string, type: string, gametext: string): CoverageCard => ({ name, type, gametext });

describe('the clauses of a card text', () => {
  it('starts a clause at each trigger or order, and drops where a card plays', () => {
    expect(clauseTextsOf('Plays in your core. While you command a Borg, draw a card. Then shuffle. Order - Stop this personnel.')).toEqual([
      'While you command a Borg, draw a card. Then shuffle.',
      'Order - Stop this personnel.',
    ]);
  });

  it('files each clause of a personnel under its concern', () => {
    const concerns = clausesOf(
      row(
        'Someone',
        'Personnel',
        'When you play this personnel, draw two cards. She is cost -1. Order - Discard a card from hand to stop a personnel. While at a planet, Strength +2. When this personnel is stopped, score 5 points. You may play this personnel aboard your [Kli] ship.'
      )
    ).map((c) => c.concern);
    expect(concerns).toEqual(['whenPlayed', 'cost', 'order', 'attributes', 'trigger', 'place']);
  });

  it('keeps a dilemma whole, and splits the cost sentence out of an event that resolves', () => {
    expect(clausesOf(row('Pitfall', 'Dilemma', 'Randomly select a personnel to be killed. Then stop all.'))).toEqual([
      { concern: 'dilemma', text: 'Randomly select a personnel to be killed. Then stop all.' },
    ]);
    expect(clausesOf(row('Boon', 'Event', 'This event is cost -2. Draw three cards.')).map((c) => c.concern)).toEqual(['cost', 'eventResolve']);
    expect(clausesOf(row('Standing', 'Event', 'Plays in your core. Each of your personnel is Cunning +1.')).map((c) => c.concern)).toEqual(['attributes']);
  });

  it('files a mission text under the mission, its "you may play" under the place', () => {
    expect(clausesOf(row('Base', 'Mission', 'You may play [Kli] personnel here.')).map((c) => c.concern)).toEqual(['place']);
    expect(clausesOf(row('Rock', 'Mission', 'When you complete this mission, score 5 points.')).map((c) => c.concern)).toEqual(['mission']);
  });
});

describe('the sentences of an ongoing clause (#1915)', () => {
  it('names the group of one example sentence per group', () => {
    const examples: [string, string][] = [
      ['To play this event, you must command three [Bor] personnel.', 'playRequirement'],
      ['To play this event, you cannot command a headquarters mission.', 'playRequirement'],
      ["This personnel may (and must) play to {Ba'ku Planet}.", 'playPlace'],
      ['Personnel aboard this ship cannot attempt missions.', 'attempt'],
      ['You cannot begin a mission attempt with fewer than six personnel.', 'attempt'],
      ['You cannot spend counters to draw cards.', 'counterSpend'],
      ['Each player cannot spend more than seven counters during their Play and Draw Cards segments.', 'counterSpend'],
      ['(You do not need to spend all your counters during each of your turns.)', 'reminder'],
      ['You do not need to spend all your counters on your turns.', 'reminder'],
      ["The cost of the event in your core that has the highest cost is added to this personnel's attributes.", 'attributes'],
      ['Each of your Engineer personnel present gains Astrometrics.', 'gain'],
      ['(She becomes [NA].)', 'gain'],
      ['To play this event, your opponent must command a ship at a non-headquarters mission.', 'opponent'],
      ['To command this ship, you must command {To Rule in Hell}.', 'command'],
      ['That personnel cannot be stopped until the end of this turn.', 'stopImmunity'],
      ['You may use a card which begins an engagement to begin one involving this ship even if it is at a headquarters mission.', 'engagement'],
      ['To play this personnel, remove two of your personnel at this mission from the game.', 'playCost'],
      ['Voyager}.', 'fragment'],
      ['You may do this only once each turn.', 'fragment'],
      ['Nothing here matches.', 'unclassified'],
    ];
    for (const [sentence, group] of examples) expect([sentence, ongoingGroupOf(sentence)]).toEqual([sentence, group]);
    expect(ongoingPermissionOf('counterSpend', 'You cannot spend counters to draw cards.')).toBe('spendToDraw');
    expect(ongoingPermissionOf('counterSpend', 'Each player cannot spend more than seven counters.')).toBeNull();
  });

  it('names two groups in Coordinated Counterattack', () => {
    expect(
      ongoingSentencesOf('To play this event, you must command six [TOS] personnel. Personnel an opponent commands cannot gain skills.').map((s) => s.group)
    ).toEqual(['playRequirement', 'opponent']);
  });

  it('shows the primitives of a missing ongoing clause, and its reach', () => {
    const cards = [
      row('Gated', 'Event', 'Plays in your core. To play this event, you must command three [Bor] personnel. (You do not need to spend all your counters during each of your turns.)'),
      row('Hostile', 'Event', 'Plays in your core. Personnel an opponent commands cannot gain skills.'),
      row('Trellium', 'Equipment', 'Plays aboard your ship.'),
    ];
    const decks = ['Deck:\n1\tGated\n1\tHostile\n1\tTrellium\n'];
    const report = coverageReport(cards, decks, () => false, (_t, _c, s) => s.group === 'reminder');
    expect(report.rows.map((r) => [r.title, r.missing, r.withinReach])).toEqual([
      ['Gated', ['ongoing'], true],
      ['Hostile', ['ongoing'], false],
      ['Trellium', [], true],
    ]);
    const md = coverageMarkdown(report);
    expect(md).toContain('| 1 | Gated | Event | ongoing (needs: a permission: play) | yes |');
    expect(md).toContain('| 1 | Hostile | Event | ongoing (needs: an opponent) | no |');
    expect(md).toContain('## Ongoing by primitive');
    expect(md).toContain('| reminder | nothing: a reminder | 1 | 1 |');
  });
});

describe('the coverage report', () => {
  it('reads every card section of a deck', () => {
    const deck = 'Deck:\n2\tBeta *VP\nDilemmas:\n1\tDelta\nMissions:\n1\tAlpha\nSideboard:\n1\tOmega\n';
    expect([...shippedDeckTitles(deck)].sort()).toEqual(['Alpha', 'Beta', 'Delta']);
  });

  it('ranks by decks, marks each clause, and says which titles are within reach', () => {
    const cards = [
      row('Common', 'Personnel', 'When you play this personnel, draw a card. When this personnel is stopped, score 5 points.'),
      row('Modelled', 'Event', 'Draw two cards.'),
      row('Rare', 'Event', 'Draw two cards.'),
    ];
    const decks = ['Deck:\n1\tCommon\n1\tModelled\n', 'Deck:\n1\tCommon\n1\tRare\n'];
    const report = coverageReport(cards, decks, (concern, title) => title === 'Modelled' || concern === 'whenPlayed');
    expect(report.rows.map((r) => [r.title, r.decks, r.missing, r.withinReach])).toEqual([
      // A trigger has a registry since #1903, so a missing trigger clause is within reach.
      ['Common', 2, ['trigger'], true],
      ['Modelled', 1, [], true],
      ['Rare', 1, ['eventResolve'], true],
    ]);
    const md = coverageMarkdown(report);
    expect(md).toContain('| 2 | Common | Personnel | trigger | yes |');
    expect(md).not.toContain('| Modelled | Event');
  });

  it('marks an order modelled by its own row (#1866): Damar whole, Optimism only its first order', () => {
    const rows = cardRows();
    const of = (title: string) => rows.find((r) => r.name === title)!;
    const orders = (title: string) =>
      clausesOf(of(title))
        .filter((c) => c.concern === 'order')
        .map((c) => modelledToday('order', title, of(title), c.text));
    expect(orders('Damar Ambitious Glinn')).toEqual([true]);
    expect(orders('Optimism')).toEqual([true, false, false]);
  });

  it('marks a trigger clause modelled when the trigger registry holds its title (#1903)', () => {
    const rows = cardRows();
    const of = (title: string) => rows.find((r) => r.name === title)!;
    const triggers = (title: string) =>
      clausesOf(of(title))
        .filter((c) => c.concern === 'trigger')
        .map((c) => modelledToday('trigger', title, of(title), c.text));
    expect(triggers('Distant Exploration')).toEqual([true]);
    expect(triggers('Li Nalas Legend of Bajor')).toEqual([true]);
    // A `botDeck` row since #1906.
    expect(triggers('Unexpected Difficulties')).toEqual([true]);
  });

  it('finds the shipped models in the shipped decks', () => {
    const report = coverageReport(cardRows(), shippedDecks(), modelledToday, ongoingModelledToday);
    const of = (title: string) => report.rows.find((r) => r.title === title);
    expect(of('These Are The Voyages')?.clauses.find((c) => c.concern === 'eventResolve')?.modelled).toBe(true);
    expect(report.rows.filter((r) => r.type === 'Dilemma' && !r.missing.length).length).toBeGreaterThan(200);
    for (let i = 1; i < report.rows.length; i++) expect(report.rows[i - 1].decks).toBeGreaterThanOrEqual(report.rows[i].decks);
    const out = process.env.MODEL_BACKLOG;
    if (out) {
      const md = coverageMarkdown(report);
      if (out.endsWith('.md')) writeFileSync(resolve(process.cwd(), out), md);
      else console.log(md);
    }
    // The drafts of #1869: `CARD_DRAFTS=<path>.md` writes the review file, `CARD_DRAFTS=1` prints it; with
    // `CARD_DRAFTS_SCOPE=all` it reads every title of the card data, one deck each, not only the shipped decks.
    const drafts = process.env.CARD_DRAFTS;
    if (drafts) {
      const all = process.env.CARD_DRAFTS_SCOPE === 'all';
      const scope = all ? coverageReport(cardRows(), [`Deck:\n${cardRows().map((r) => `1\t${r.name}`).join('\n')}\n`], modelledToday, ongoingModelledToday) : report;
      const md = draftMarkdown(draftReport(scope));
      if (drafts.endsWith('.md')) writeFileSync(resolve(process.cwd(), drafts), md);
      else console.log(md);
    }
  });
});

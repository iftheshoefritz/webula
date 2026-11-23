// Issue #1869: drafts of card definitions from game text, in the vocabulary of the registries.
import { chainSteps, draftMarkdown, draftOf, draftReport, phraseTest } from '../../lib/cardDrafts';
import { stagesOf } from '../../lib/effectSteps';
import { clausesOf, coverageReport, type Concern } from '../../lib/modelCoverage';
import { orderModelOf } from '../../lib/orderModels';
import { playModelOf } from '../../lib/playModels';
import { resolveModelOf } from '../../lib/resolveModels';
import { cardRows } from './backlogData';

// The clause of `concern` of `title`, as the backlog splits its text.
const clauseOf = (title: string, concern: Concern) => clausesOf(cardRows().find((r) => r.name === title)!).find((c) => c.concern === concern)!.text;

describe('phraseTest', () => {
  it('reads counts, icons, types, skills, keywords and titles', () => {
    expect(phraseTest('a [Baj] personnel')).toEqual({ upTo: 1, test: [{ affiliations: ['bajoran'], types: ['personnel'] }], testText: 'a [Baj] personnel' });
    expect(phraseTest('up to three [TNG] personnel')?.test).toEqual([{ icons: ['[tng]'], types: ['personnel'] }]);
    expect(phraseTest('two unique [Bor] personnel')).toMatchObject({ upTo: 2, test: [{ unique: true, affiliations: ['borg'], types: ['personnel'] }] });
    expect(phraseTest('an equipment, event, or ship')?.test).toEqual([{ types: ['equipment', 'event', 'ship'] }]);
    expect(phraseTest('up to two non-Artifact Hand Weapons')?.test).toEqual([{ notKeywords: ['artifact'], keywords: ['hand weapon'] }]);
    expect(phraseTest('a Treachery personnel')?.test).toEqual([{ skills: ['treachery'], types: ['personnel'] }]);
    expect(phraseTest('{Engineering PADD} and/or {Science PADD}')?.test).toEqual([{ titles: ['engineering padd', 'science padd'] }]);
  });

  it('gives no test for a word it does not know', () => {
    expect(phraseTest('a Prophet-touched personnel')).toBeNull();
    expect(phraseTest('three different Commodity events')).toBeNull();
    expect(phraseTest('{Ruling Council} or a [Dom] card')).toBeNull();
  });
});

describe('chainSteps', () => {
  it('chains the steps of the vocabulary, the first a "may"', () => {
    expect(chainSteps('draw a card. If you do, discard a card from hand', true)).toEqual([
      { kind: 'draw', count: { kind: 'fixed', count: 1 }, may: true },
      { kind: 'discardFromHand', count: 1 },
    ]);
    expect(chainSteps('Discard a card from hand to draw two cards')?.map((s) => s.kind)).toEqual(['discardFromHand', 'draw']);
    expect(chainSteps('draw three cards, then place three cards from hand on the bottom of your deck in any order')?.map((s) => s.kind)).toEqual([
      'draw',
      'bottomFromHand',
    ]);
  });

  it('gives none when a part is not a step', () => {
    expect(chainSteps('draw a card for each mission you command')).toBeNull();
    expect(chainSteps('lose 5 points to draw two cards')).toBeNull();
  });
});

// The acceptance: a draft is a row the registry takes as it is, so the drafts of cards a registry models already
// equal its rows.
describe('a draft of a modelled card equals its registry row', () => {
  it('a "when you play" download (Opaka Kai of Bajor)', () => {
    const draft = draftOf('whenPlayed', clauseOf('Opaka Kai of Bajor', 'whenPlayed'));
    expect(draft?.row).toMatchObject({ registry: 'PLAY_MODELS', steps: playModelOf('Opaka Kai of Bajor')!.steps });
  });

  it('an order with a cost (Damar Ambitious Glinn)', () => {
    const draft = draftOf('order', clauseOf('Damar Ambitious Glinn', 'order'));
    const model = orderModelOf('Damar Ambitious Glinn', 0)!;
    expect(draft?.row).toEqual({ registry: 'ORDER_MODELS', index: 0, text: model.text, cost: model.cost, oncePerTurn: true, steps: model.steps });
  });

  it('an event that resolves (Days of Atonement)', () => {
    const draft = draftOf('eventResolve', clauseOf('Days of Atonement', 'eventResolve'));
    expect(draft?.row).toEqual({ registry: 'RESOLVE_MODELS', steps: resolveModelOf('Days of Atonement')!.steps });
  });

  it('a conditional play leaves the condition to the reviewer, not checked', () => {
    const draft = draftOf('whenPlayed', 'When you play this personnel, if you command two Vulcans, you may draw three cards.');
    expect(draft?.row).toMatchObject({ condition: { kind: 'unchecked', text: 'if you command two Vulcans' } });
  });
});

describe('the draft report', () => {
  const report = (title: string, gametext: string, type = 'Personnel') =>
    coverageReport([{ name: title, type, gametext } as never], [`Deck:\n1\t${title}\n`], () => false);

  it('drafts the matched clauses and counts the rest by concern', () => {
    const r = draftReport(report('Tester', 'When you play this personnel, you may draw two cards. When this personnel is stopped, score 5 points.'));
    expect(r.drafts.map((d) => [d.title, d.concern, d.template])).toEqual([['Tester', 'whenPlayed', 'play-effect']]);
    expect(r.counts).toEqual([
      { concern: 'trigger', matched: 0, unmatched: 1 },
      { concern: 'whenPlayed', matched: 1, unmatched: 0 },
    ]);
    const md = draftMarkdown(r);
    expect(md).toContain('| whenPlayed | 1 | 0 |');
    expect(md).toContain('> When you play this personnel, you may draw two cards.');
    expect(md).toContain('"title": "Tester"');
  });

  it('numbers each order by its place among the card\'s orders', () => {
    const r = draftReport(report('Two Orders', 'Order - Shuffle your dilemma pile. Order - Discard a card from hand to draw a card.'));
    expect(r.drafts.map((d) => d.row)).toEqual([expect.objectContaining({ registry: 'ORDER_MODELS', index: 1 })]);
  });

  it('writes only steps the engine stages', () => {
    const all = coverageReport(cardRows(), [`Deck:\n${cardRows().map((r) => `1\t${r.name}`).join('\n')}\n`], () => false);
    const { drafts } = draftReport(all);
    expect(drafts.length).toBeGreaterThan(30);
    for (const d of drafts) expect(stagesOf(d.row.steps).length).toBeGreaterThan(0);
  });
});

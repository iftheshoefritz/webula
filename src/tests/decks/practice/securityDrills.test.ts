import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { botResolveOf } from '../../../app/decks/practice/attempt';
import { attemptAbilitiesOf, gainSkillOptionsOf } from '../../../app/decks/practice/attemptAbilities';
import { gameReducer, initialGameState, logEntryText, type GameAction, type GameState } from '../../../app/decks/practice/gameLog';
import { type TableAction } from '../../../app/decks/practice/tableReducer';
import { ATTEMPT_ABILITIES, attemptAbilitiesOfTitle, attemptAbilityRowValid } from '../../../lib/attemptAbilities';
import { PRACTICE_BOT_DRILLS_TSV, SECURITY_DRILLS_TITLE } from '../../../lib/practiceDeck';
import { cardData, dealRevealFixtureWithDeck } from '../../fixtures/botFixtureTables';

// Issue #1959: Security Drills (5P012, 0VP107), "Plays in your core. While your personnel is facing a dilemma, you may
// place a [Fed] card from hand on this event to make that personnel gain a skill he or she already has until the end
// of that dilemma." Rulebook v4, "1. Play and Draw Cards" › "Important Game Terms" › Skills, p. 9: "If a personnel
// gains a skill he or she already has, it increases his or her level of that skill."

const gametextOf = (collectorsInfo: string): string => cardData.find((r) => r.collectorsinfo === collectorsInfo)?.gametext ?? '';

describe('the Security Drills row (#1959)', () => {
  const row = ATTEMPT_ABILITIES.find((a) => a.title === SECURITY_DRILLS_TITLE)!;

  it("is its game text: in the core, while facing a dilemma, a [Fed] card from hand, a skill the personnel has", () => {
    for (const info of ['5p12', '0vp107']) expect(gametextOf(info)).toBe(`plays in your core. ${row.text}`.toLowerCase());
    expect(row).toMatchObject({
      window: 'facingDilemma',
      source: 'core',
      cost: { kind: 'placeFromHandOnThis', test: [{ affiliations: ['federation'] }] },
      steps: [{ kind: 'gainSkill', target: 'chosenPersonnel' }],
    });
    expect(row.limit).toBeUndefined();
    expect(attemptAbilityRowValid(row)).toBe(true);
    expect(attemptAbilitiesOfTitle('Security Drills *VP')).toEqual([row]);
  });
});

// `?fixture=bot-drills`: Bynars' Password revealed at Bilana System's crew, Security Drills at the end of the core, the
// two [Fed] U.S.S. Relativity in the hand.
describe('?fixture=bot-drills (#1959)', () => {
  const deal = (): GameState => {
    const core = extractDrawDeck(deckFromTsv(PRACTICE_BOT_DRILLS_TSV, cardData));
    return initialGameState(dealRevealFixtureWithDeck('bot-drills', false, { core }).table);
  };
  const drillsOf = (s: GameState) => s.table.core.find((c) => c.card?.originalName === SECURITY_DRILLS_TITLE)!;
  const run = (s: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, s);
  const preview = (s: GameState) => {
    const r = botResolveOf(s.table);
    return r.resolvable ? r.preview : null;
  };
  // Seven of Nine Undercover Operative has Engineer, so Engineer 2 meets the dilemma's "2 Engineer".
  // The ids count on from the last deal, so the cards are found by their rows.
  const fedOf = (s: GameState) => s.table.hand.find((c) => c.card?.affiliation === 'federation')!.id;
  const eventOf = (s: GameState) => s.table.hand.find((c) => c.card?.type === 'event')!.id;
  const seven = (s: GameState) => attemptAbilitiesOf(s).find((o) => o.targetName.startsWith('Seven of Nine'))!;

  it('offers Security Drills on the revealed dilemma, for each personnel, with the skills each has', () => {
    const s = deal();
    expect(s.table.attempt?.cardText).toBe(true);
    expect(preview(s)).toBe('Stops Data Lucasian Chair *VP');
    const offers = attemptAbilitiesOf(s).filter((o) => o.id === drillsOf(s).id);
    expect(offers.length).toBeGreaterThan(1);
    expect(gainSkillOptionsOf(s.table, seven(s).targetId)).toEqual(expect.arrayContaining(['Engineer', 'Programming']));
  });

  it('places the [Fed] card on Security Drills, raises the skill, changes the preview, and ends with the Resolve', () => {
    const s = deal();
    const drills = drillsOf(s);
    const offer = seven(s);
    const fed = fedOf(s);
    const used = run(s, { type: 'useAttemptAbility', id: drills.id, index: 0, targetId: offer.targetId, skill: 'Engineer', ids: [fed] });
    expect(used.table.hand.map((c) => c.id)).not.toContain(fed);
    expect(drillsOf(used).placedOn?.map((c) => c.id)).toEqual([fed]);
    expect(drillsOf(used).placedOn?.[0].notInPlay).toBe(true);
    expect(used.table.attempt?.timed).toEqual([expect.objectContaining({ targetId: offer.targetId, skills: ['Engineer'], untilDilemma: used.table.dilemmaStack[0].id })]);
    expect(logEntryText(used.log.at(-1)!)).toMatch(/^Security Drills: placed U\.S\.S\. Relativity .* on it, made Seven of Nine .* gain Engineer until the end of Bynars' Password$/);
    expect(preview(used)).toBe('No effect');

    const r = botResolveOf(used.table);
    if (!r.resolvable) throw new Error('not resolvable');
    const top = used.table.dilemmaStack[0];
    const resolve: TableAction = { type: 'resolveDilemma', dilemmaId: top.id, dilemma: "Bynars' Password", changes: r.changes, notes: r.notes, ...(r.move ? { move: r.move } : {}) };
    const resolved = run(used, resolve);
    expect(resolved.table.attempt?.timed).toBeUndefined();
    expect(attemptAbilitiesOf(resolved).filter((o) => o.id === drills.id)).toEqual([]);
  });

  it('is not usable without a [Fed] card', () => {
    const s = deal();
    const offer = seven(s);
    const used = run(s, { type: 'useAttemptAbility', id: drillsOf(s).id, index: 0, targetId: offer.targetId, skill: 'Engineer', ids: [eventOf(s)] });
    expect(used).toBe(s);
  });
});

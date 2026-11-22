// Issue #1879: `pileTableInputOf` and `botTableFactsOf` are projections of the table view. A frozen
// copy of the builders of before, which walked the `TableState` themselves, is the reference: on the
// tables of the bot fixtures, and on tables with a stopped personnel, Sphere 117, Crescent Nebula and a
// named Roadblock, the projections give deep-equal results, with "Apply card text to attributes" off and on.
import { BOT_REVEAL_FIXTURES, botTableFactsOf, pileTableInputOf } from '../../../app/decks/practice/attempt';
import { attemptingCards, CardInstance, createCardInstances, TableState } from '../../../app/decks/practice/tableReducer';
import { ATTRIBUTE_REGISTRY, personnelAttributesOnTable, shipAttributesOnTable } from '../../../app/decks/practice/attributeModels';
import { shipRangeOnTable } from '../../../app/decks/practice/shipRange';
import { namedAtMission } from '../../../app/decks/practice/selfReplicatingRoadblock';
import { addedRequirements, requirementTextWith } from '../../../lib/requirementRules';
import { BotTableFacts, asSphere117Dissident, isSphere117, sphere117Holds } from '../../../lib/dilemmaBot/gains';
import { partnerTraitsOf } from '../../../lib/dilemmaBot/simulator';
import type { PileTableInput } from '../../../lib/dilemmaBot/pile/tableAttempt';
import { cardData, dealBotFixture, dealRevealFixtureWithDeck } from '../../fixtures/botFixtureTables';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// ---- The reference: the builders as they were before #1879. ----

function oldPersonnelRow(table: TableState, card: CardInstance, cardText: boolean): CardInstance['card'] {
  if (!cardText || card.card?.type !== 'personnel') return card.card;
  return { ...card.card, ...personnelAttributesOnTable(table, card, true) };
}

function oldShipRow(table: TableState, ship: CardInstance, cardText: boolean): CardInstance['card'] {
  if (!cardText || !ship.card) return ship.card;
  return { ...ship.card, range: shipRangeOnTable(table, ship, true), ...shipAttributesOnTable(table, ship, true) };
}

function oldMissionRow(table: TableState, missionIndex: number): CardInstance['card'] | undefined {
  const card = table.missions[missionIndex]?.mission?.card;
  if (!card) return card;
  const added = addedRequirements(table.missions.map((s) => s.mission?.card))[missionIndex];
  return added.length ? { ...card, skills: requirementTextWith(String(card.skills ?? ''), added) } : card;
}

function oldBotTableFactsOf(table: TableState, cardText = false): BotTableFacts {
  const sphere = sphere117Holds(
    table.missions.some((s) => s.ships.some((ship) => isSphere117(ship.card))),
    table.missions.flatMap((s) => (s.mission?.card ? [String(s.mission.card.quadrant ?? '')] : [])),
  );
  return {
    completedMissions: table.missions.flatMap((s) => (s.completed && s.mission?.card ? [String(s.mission.card.missiontype)] : [])),
    discardPile: table.discard.flatMap((c) => (c.card ? [{ ...partnerTraitsOf(c.card), type: String(c.card.type) }] : [])),
    coreEvents: table.core.filter((c) => c.card?.type === 'event').length,
    commanded: table.missions
      .flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])])
      .flatMap((c) => (c.card?.type === 'personnel' ? [partnerTraitsOf(c.card)] : []))
      .map((traits) => (sphere ? asSphere117Dissident(traits) : traits)),
    ...(cardText ? { attributeTitles: [...ATTRIBUTE_REGISTRY.keys()] } : {}),
  };
}

function oldPileTableInputOf(table: TableState, missionIndex: number, shipId?: string, cardText = false): PileTableInput {
  const slot = table.missions[missionIndex];
  const ship = slot?.ships.find((s) => s.id === shipId);
  return {
    cards: (attemptingCards(table, missionIndex, shipId) ?? []).map((c) => (cardText ? { ...c, card: oldPersonnelRow(table, c, true) } : c)),
    mission: oldMissionRow(table, missionIndex),
    ship: ship && oldShipRow(table, ship, cardText),
    placedOn: (slot?.mission?.placedOn ?? []).map((c) => c.card),
    returnedHere: namedAtMission(table, missionIndex),
    underMission: (slot?.underMission ?? []).map((c) => c.card),
    missions: table.missions.map((s) => ({ mission: s.mission?.card, completed: s.completed, under: s.underMission.map((c) => c.card) })),
    hand: table.hand.map((c) => c.card),
    discard: table.discard.map((c) => c.card),
    turn: table.turn,
    score: table.score,
    facts: oldBotTableFactsOf(table, cardText),
    core: table.core.map((c) => c.card),
    commanded: table.missions.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((ship) => ship.crew ?? [])]).map((c) => c.card),
    shipsAtMission: (slot?.ships ?? []).map((ship) => ({ staffed: (ship.crew ?? []).some((c) => c.card?.type === 'personnel') })),
    drawDeck: table.drawDeck.map((c) => c.card),
    dilemmaPile: table.dilemmaPile.map((c) => c.card),
    ...(table.botPile?.affiliations ? { botAffiliations: table.botPile.affiliations } : {}),
    ...(table.botPile?.missions ? { botMissions: table.botPile.missions } : {}),
    ...(table.botPile?.songCards ? { botSongCards: table.botPile.songCards } : {}),
  };
}

// `cards` on its declared fields: the old builder handed whole `CardInstance`s, whose other fields the bot never reads.
const declared = (input: PileTableInput) => ({ ...input, cards: input.cards.map((c) => ({ id: c.id, card: c.card, stopped: !!c.stopped })) });

function expectSame(table: TableState, missionIndex: number, shipId?: string) {
  for (const cardText of [false, true]) {
    expect(declared(pileTableInputOf(table, missionIndex, shipId, cardText))).toEqual(declared(oldPileTableInputOf(table, missionIndex, shipId, cardText)));
    expect(botTableFactsOf(table, cardText)).toEqual(oldBotTableFactsOf(table, cardText));
  }
}

const attemptAt = (table: TableState) => {
  if (!table.attempt) throw new Error('no attempt');
  return [table.attempt.missionIndex, table.attempt.shipId] as const;
};

const rowNamed = (name: string) => {
  const row = cardData.find((r) => r.originalName === name);
  if (!row) throw new Error(`no row ${name}`);
  return row;
};

const botLabel = () => dealRevealFixtureWithDeck('bot-label').table;

describe('the bot table input is a projection of the table view (#1879)', () => {
  it('matches on ?fixture=bot, at every mission slot and every ship', () => {
    const table = dealBotFixture();
    table.missions.forEach((slot, i) => {
      expectSame(table, i);
      for (const ship of slot.ships) expectSame(table, i, ship.id);
    });
  });

  it.each(Object.keys(BOT_REVEAL_FIXTURES))('matches on ?fixture=%s, at the attempted slot', (fixture) => {
    const extras =
      fixture === 'bot-select-again' ? { core: [rowNamed("Let's Try That Again, Shall We?")], hand: [rowNamed('Dessert Disaster')] } : {};
    const table = dealRevealFixtureWithDeck(fixture, true, extras).table;
    expectSame(table, ...attemptAt(table));
  });

  it('keeps the stopped personnel in both `commanded`', () => {
    const base = botLabel();
    const stop = (c: CardInstance, i: number) => (i === 0 ? { ...c, stopped: true } : c);
    const table: TableState = {
      ...base,
      missions: base.missions.map((s) => ({ ...s, awayTeam: s.awayTeam.map(stop), ships: s.ships.map((ship) => ({ ...ship, crew: (ship.crew ?? []).map(stop) })) })),
    };
    expect(table.missions.some((s) => s.awayTeam.some((c) => c.stopped))).toBe(true);
    expectSame(table, ...attemptAt(table));
    expectSame(table, 0);
  });

  it('reads a Drone as a Dissident while Sphere 117 holds', () => {
    const base = botLabel();
    const [sphere] = createCardInstances([rowNamed('Sphere 117 Renegade Borg Sphere')], 'up');
    const drone = cardData.find((r) => r.type === 'personnel' && /drone/.test(r.keywords) && /borg/.test(r.affiliation));
    expect(drone).toBeDefined();
    const [droneCard] = createCardInstances([drone], 'up');
    const table: TableState = {
      ...base,
      missions: base.missions.map((s, i) => ({
        ...s,
        mission: s.mission && { ...s.mission, card: { ...s.mission.card, quadrant: 'd' } },
        ...(i === 1 ? { ships: [...s.ships, { ...sphere, crew: [droneCard] }] } : {}),
      })),
    };
    const facts = botTableFactsOf(table);
    expect(facts.commanded.some((t) => /dissident/i.test(String(t.keywords)))).toBe(true);
    expectSame(table, ...attemptAt(table));
  });

  it('carries the requirements Crescent Nebula adds on the mission row', () => {
    const base = botLabel();
    const [nebula] = createCardInstances([rowNamed('Crescent Nebula Take Out the Trash')], 'up');
    const table: TableState = { ...base, missions: base.missions.map((s, i) => (i === 4 ? { ...s, mission: nebula } : s)) };
    const [missionIndex, shipId] = attemptAt(table);
    const old = oldPileTableInputOf(table, missionIndex, shipId);
    expect(old.mission).not.toBe(table.missions[missionIndex].mission?.card);
    expectSame(table, missionIndex, shipId);
  });

  it('reads `returnedHere` from a named Roadblock on the mission card', () => {
    const base = botLabel();
    const [missionIndex, shipId] = attemptAt(base);
    const [roadblock] = createCardInstances([rowNamed('Self-Replicating Roadblock')], 'up');
    const table: TableState = {
      ...base,
      missions: base.missions.map((s, i) =>
        i === missionIndex && s.mission ? { ...s, mission: { ...s.mission, placedOn: [...(s.mission.placedOn ?? []), { ...roadblock, named: 'Wavefront' }] } } : s,
      ),
    };
    expect(pileTableInputOf(table, missionIndex, shipId).returnedHere).toEqual(['Wavefront']);
    expectSame(table, missionIndex, shipId);
  });
});

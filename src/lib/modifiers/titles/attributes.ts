// The modifier rows of the personnel and the equipment that change attributes from an away team or a crew
// (#1664, #1667, #1681, #1682, #1683): `self`, the card's own attributes, and `group`, the attributes of the cards
// present with it, the card itself possibly ("each of your other …" leaves it out).

import { commandsKeywordCard, distinctTitleCount, missions as viewMissions, personnel, type TableView, type ViewCard } from '../../tableView';
import { type AmountContext, each, type ModifierRow, PERSONNEL_QUANTITIES, row } from '../model';
import {
  hasAffiliation,
  hasIcon,
  hasKeyword,
  hasSkill,
  hasWord,
  isEquipment,
  isPersonnel,
  othersIn,
  printedOf,
  rowIsNamed,
} from '../words';

/** Each of a personnel's attributes +`n`, "attributes +n". */
export const attributes = (n: number | ((c: AmountContext) => number)) => each(PERSONNEL_QUANTITIES, n);

// A keyword or a species, as the partner tests of `gains.ts` read "an Android" or "an Honor Klingon".
const hasTrait = (p: ViewCard, trait: string) => hasKeyword(p, trait) || hasWord(p.row?.species, trait);
const isUnique = (p: ViewCard) => String(p.row?.unique ?? '').toLowerCase() === 'y';
const points = (mission: { card: ViewCard | null }) => Number(mission.card?.row?.points) || 0;
// The personnel of the discard pile with the skill `skill`, a card removed from the game there too.
const discardedWith = ({ discard }: TableView, skill: string) => discard.filter((c) => c.type === 'personnel' && hasSkill(c, skill)).length;
// The incomplete missions the player commands that are not a headquarters.
const incompleteNonHeadquarters = (view: TableView) => viewMissions(view, { completed: false, headquarters: false }).length;
// The completed missions the player commands, and the space ones among them.
const completedCount = (view: TableView, type?: string) => viewMissions(view, { completed: true, type }).length;
// The other personnel the player commands that pass `test`, stopped ones too.
const otherCommanded = ({ view, source }: AmountContext, test: (p: ViewCard) => boolean) =>
  personnel(view, { unstopped: false }).filter((p) => p.id !== source.id && test(p)).length;
// The others of the source's group that pass `test`.
const others = ({ source, group }: AmountContext, test: Parameters<typeof othersIn>[2]) => othersIn(source, group ?? [], test).length;
// `n` while `holds`, else 0.
const when = (holds: (c: AmountContext) => boolean, n: number) => (c: AmountContext) => (holds(c) ? n : 0);

// "While no player commands a Temporal event" (Morgan Bateson).
const TEMPORAL_EVENT = commandsKeywordCard({ keyword: 'temporal', type: 'event' });
const NO_TEMPORAL_EVENT = { holds: (view: Parameters<typeof TEMPORAL_EVENT.holds>[0]) => !TEMPORAL_EVENT.holds(view), text: () => 'no player commands a Temporal event' };

export const ATTRIBUTE_ROWS: ModifierRow[] = [
  // "While you have completed a mission worth 40 or more points, each [AU] personnel present is attributes +1."
  // Nador, an [AU] personnel, is +1 himself.
  row(
    'Nador Curious Commander',
    'group',
    'group',
    attributes(when(({ view, target }) => isPersonnel(target) && hasIcon(target, 'au') && viewMissions(view, { completed: true }).some((m) => points(m) >= 40), 1))
  ),
  // "Each of your other Borg present is Cunning +1."
  row('Computation Drone', 'group', 'group', {
    cunning: when(({ source, target }) => target.id !== source.id && isPersonnel(target) && hasWord(target.row?.species, 'borg'), 1),
  }),
  // "While you command three [Car] personnel, this personnel is attributes +1 …" Doran counts the other [Car]
  // personnel: his printed affiliation is not Cardassian, so two Dorans do not satisfy each other.
  row('Doran', 'self', 'self', attributes(when((c) => otherCommanded(c, (p) => hasAffiliation(p, 'cardassian')) >= 3, 1))),
  // "While this personnel is present with your [Baj] personnel, each of your [Fed] personnel present is
  // attributes +1." Sisko, [Fed], is +1 himself.
  row(
    'Benjamin Sisko Enlightened Supervisor',
    'group',
    'group',
    attributes(when((c) => isPersonnel(c.target) && hasAffiliation(c.target, 'federation') && others(c, (p) => hasAffiliation(p, 'bajoran')) > 0, 1))
  ),
  // "While you do not command a completed mission, each of your [Vid] personnel present is attributes +1."
  // Bridon, [Vid], is +1 himself.
  row('Bridon', 'group', 'group', attributes(when(({ view, target }) => isPersonnel(target) && hasAffiliation(target, 'vidiian') && completedCount(view) === 0, 1))),
  // "This personnel is attributes -1 for each card in your hand." The readers floor each value at 0.
  row('Brennan Scott', 'self', 'self', attributes(({ view }) => -view.hand.length)),
  // "This personnel is Cunning +1 and Strength +1 for each incomplete non-headquarters mission you command."
  row('Drenol', 'self', 'self', each(['cunning', 'strength'], ({ view }) => incompleteNonHeadquarters(view))),
  // "While this personnel is present with three [Pa] personnel, she is attributes +1 …" A stopped [Pa]
  // personnel counts.
  row('Jadzia Dax Communications Staffer', 'self', 'self', attributes(when((c) => others(c, (p) => hasIcon(p, 'pa')) >= 3, 1))),
  // "While your [TNG] personnel who has a cost of 4 or more is present, this personnel is attributes +2."
  // Another personnel: Riker is [TNG] with a cost of 4 himself, and is not present with himself.
  row('William T. Riker Battleship First Officer', 'self', 'self', attributes(when((c) => others(c, (p) => hasIcon(p, 'tng') && printedOf(p, 'cost') >= 4) > 0, 2))),
  // "Each of your other [Baj] personnel present is Integrity +1 (or +2 while facing a dilemma)." The "facing a
  // dilemma" part is not modelled.
  row('Bareil Antos Esteemed Vedek', 'group', 'group', {
    integrity: when(({ source, target }) => target.id !== source.id && isPersonnel(target) && hasAffiliation(target, 'bajoran'), 1),
  }),
  // "Each of your other [Baj] personnel present is Strength +1 (or +2 while in combat)." Combat never happens on
  // the table.
  row('Shakaar Edon Resistance Leader', 'group', 'group', {
    strength: when(({ source, target }) => target.id !== source.id && isPersonnel(target) && hasAffiliation(target, 'bajoran'), 1),
  }),
  // "While this personnel is aboard your {U.S.S. Enterprise-D}, each of your non-unique [TNG] personnel present
  // is attributes +1." The group is that ship's crew; in an away team she gives nothing. She is unique, so she
  // never counts herself.
  row(
    'Beverly Crusher Encouraging Commander',
    'group',
    'group',
    attributes(
      when(
        ({ ship, target }) =>
          !!ship && rowIsNamed(ship.row, 'U.S.S. Enterprise-D') && isPersonnel(target) && String(target.row?.unique ?? '').toLowerCase() === 'n' && hasIcon(target, 'tng'),
        1
      )
    )
  ),
  // "While you have no cards in your discard pile, this personnel is Cunning +4, Strength +4 …"
  row('Dukat Pah-Wraith Puppet', 'self', 'self', each(['cunning', 'strength'], when(({ view }) => view.discard.length === 0, 4))),
  // "While this personnel is present with a stopped [SF] Dissident personnel, he is attributes +1 …" He is an
  // [SF] Dissident himself, and is not present with himself.
  row(
    'Emanuel Stevens',
    'self',
    'self',
    attributes(when((c) => others(c, (p) => p.stopped && hasAffiliation(p, 'starfleet') && hasKeyword(p, 'dissident')) > 0, 1))
  ),
  // "While each player has 40 or more points, this personnel is attributes +1 …" In a solo game the player is
  // each player: the score counter.
  row('Martinez', 'self', 'self', attributes(when(({ view }) => view.score >= 40, 1))),
  // "While you command fewer than two completed missions, this personnel is attributes +1."
  row('Motura Eminent Sculptor', 'self', 'self', attributes(when(({ view }) => completedCount(view) < 2, 1))),
  // "While you command two completed space missions, this personnel is attributes +2."
  row('Nadia Myers', 'self', 'self', attributes(when(({ view }) => completedCount(view, 's') >= 2, 2))),
  // "This personnel is attributes +1 for each of your completed space missions."
  row('Neelix Valued Guide', 'self', 'self', attributes(({ view }) => completedCount(view, 's'))),
  // "While you have six or more cards in hand, this personnel is attributes +3."
  row('Nog Bar Owner', 'self', 'self', attributes(when(({ view }) => view.hand.length >= 6, 3))),
  // "This personnel is Cunning +1 for each Diplomacy personnel in your discard pile (limit +4). This personnel is
  // Strength +1 for each Security personnel in your discard pile (limit +4)."
  row('Odo Curzon Odo', 'self', 'self', {
    cunning: ({ view }) => Math.min(4, discardedWith(view, 'diplomacy')),
    strength: ({ view }) => Math.min(4, discardedWith(view, 'security')),
  }),
  // "While this personnel is at a Region: Delphic Expanse mission, if there is a [SF] ship at this mission with
  // unused Range>5, this personnel is attributes +1 …" Unused Range is the Range on the table less the Range used
  // this turn, the Range left the ship's card shows.
  row(
    'Travis Mayweather Damaged Navigator',
    'self',
    'self',
    attributes(
      when(
        ({ view, slot, rangeOf }) =>
          !!slot &&
          String(slot.card?.row?.keywords ?? '').toLowerCase().includes('region: delphic expanse') &&
          slot.ships.some((ship) => hasAffiliation(ship, 'starfleet') && rangeOf(ship) - (view.rangeUsed[ship.id] ?? 0) > 5),
        1
      )
    )
  ),
  // The personnel of #1681, each held by one shipped deck, with a "present" condition.
  // "While two [Baj] personnel are in your discard pile, this personnel is attributes +2."
  row(
    'Akorem Laan Revered Poet',
    'self',
    'self',
    attributes(when(({ view }) => view.discard.filter((c) => c.type === 'personnel' && hasAffiliation(c, 'bajoran')).length >= 2, 2))
  ),
  // "Each unique personnel present is attributes +1." Artim, unique, is +1 himself.
  row('Artim Inspirational Child', 'group', 'group', attributes(when(({ target }) => isPersonnel(target) && isUnique(target), 1))),
  // "While this personnel is present with an Android, he is attributes +1 …"
  row('Bruce Maddox Chair of Robotics', 'self', 'self', attributes(when((c) => others(c, (p) => hasTrait(p, 'android')) > 0, 1))),
  // "This personnel is attributes +1 for each of your Security personnel present." He has Security, so he counts
  // himself.
  row('Calisthenics Opponent', 'self', 'self', attributes(({ group }) => (group ?? []).filter((p) => isPersonnel(p) && hasSkill(p, 'security')).length)),
  // "Each of your Assassins present is attributes +1."
  row("Chief O'Brien", 'group', 'group', attributes(when(({ target }) => isPersonnel(target) && hasTrait(target, 'assassin'), 1))),
  // "Your Intelligence personnel present are each attributes +1."
  row('Elim Garak Federation Agent', 'group', 'group', attributes(when(({ target }) => isPersonnel(target) && hasSkill(target, 'intelligence'), 1))),
  // "While this personnel is present with an Honor Klingon, she is attributes +1 …"
  row('Jadzia Dax Sworn Ally', 'self', 'self', attributes(when((c) => others(c, (p) => hasSkill(p, 'honor') && hasTrait(p, 'klingon')) > 0, 1))),
  // "While present with four [Maq] personnel, each [Maq] personnel present is Strength +2." Four personnel other
  // than Kasidy; she, [Maq], is +2 herself.
  row('Kasidy Yates Conflicted Captain', 'group', 'group', {
    strength: when((c) => isPersonnel(c.target) && hasIcon(c.target, 'maq') && others(c, (p) => hasIcon(p, 'maq')) >= 4, 2),
  }),
  // "While this personnel is present with your [Fed] personnel, each of your other [Baj] personnel present is
  // attributes +1."
  row(
    'Kira Nerys Colonel Kira',
    'group',
    'group',
    attributes(
      when(
        (c) =>
          c.target.id !== c.source.id && isPersonnel(c.target) && hasAffiliation(c.target, 'bajoran') && others(c, (p) => hasAffiliation(p, 'federation')) > 0,
        1
      )
    )
  ),
  // "This personnel is Strength +1 for each [Pa][Kli] personnel present." The others: Korax is not present with
  // himself.
  row('Korax Instigator', 'self', 'self', { strength: (c) => others(c, (p) => hasIcon(p, 'pa') && hasAffiliation(p, 'klingon')) }),
  // "While this personnel is present with a [Pa] personnel, he is attributes +1 …"
  row('Quark Little Green Man', 'self', 'self', attributes(when((c) => others(c, (p) => hasIcon(p, 'pa')) > 0, 1))),
  // "While this personnel is present with your Honor personnel, he is Integrity +2. While this personnel is
  // present with your Treachery personnel, he is Strength +2."
  row("S'rrel", 'self', 'self', {
    integrity: when((c) => others(c, (p) => hasSkill(p, 'honor')) > 0, 2),
    strength: when((c) => others(c, (p) => hasSkill(p, 'treachery')) > 0, 2),
  }),
  // The personnel of #1682, each held by one shipped deck, with a count or a table condition.
  // "This personnel is Cunning +1 and Strength +1 for each [AU] personnel present." The others: Slar, [AU], is
  // not present with himself.
  row('Slar Gorn Slave Master', 'self', 'self', each(['cunning', 'strength'], (c) => others(c, (p) => hasIcon(p, 'au')))),
  // "While this personnel is present with a {Dissident} or a [Fed][Cmd] personnel, he is attributes +1." He is a
  // Dissident himself, and is not present with himself.
  row(
    'Stefan DeSeve Disillusioned Expatriate',
    'self',
    'self',
    attributes(when((c) => others(c, (p) => hasKeyword(p, 'dissident') || (hasAffiliation(p, 'federation') && hasIcon(p, 'cmd'))) > 0, 1))
  ),
  // "This personnel is Integrity -1 and Strength +1 for each non-Bajoran present (limit -3/+3)." Bajoran is the
  // species.
  row('Tahna Los Voice of the Kohn-Ma', 'self', 'self', {
    integrity: (c) => -Math.min(3, others(c, (p) => !hasWord(p.row?.species, 'bajoran'))),
    strength: (c) => Math.min(3, others(c, (p) => !hasWord(p.row?.species, 'bajoran'))),
  }),
  // "Each of your personnel present who has a cost of 4 or more is attributes +1." Worf, cost 4, is +1 himself.
  row('Worf Defiant Commander', 'group', 'group', attributes(when(({ target }) => isPersonnel(target) && printedOf(target, 'cost') >= 4, 1))),
  // "While you command three [Baj] personnel, this personnel is attributes +1, gains Diplomacy, and becomes
  // [Baj]." The others: the "becomes [Baj]" part is not modelled.
  row('Olamu', 'self', 'self', attributes(when((c) => otherCommanded(c, (p) => hasAffiliation(p, 'bajoran')) >= 3, 1))),
  // "This personnel is Integrity +1 and Cunning +1 for each incomplete non-headquarters mission you command."
  // Read as Drenol.
  row('Nirata', 'self', 'self', each(['integrity', 'cunning'], ({ view }) => incompleteNonHeadquarters(view))),
  // "For each mission you have completed, this personnel is attributes +1."
  row('Norah Satie Starfleet Investigator', 'self', 'self', attributes(({ view }) => completedCount(view))),
  // "While you have no cards in hand, this personnel and each of your Leadership personnel present are
  // attributes +1." Hoshi is +1 once, with Leadership or without.
  row(
    "Hoshi Sato Captain's Woman",
    'group',
    'group',
    attributes(when(({ view, source, target }) => view.hand.length === 0 && isPersonnel(target) && (target.id === source.id || hasSkill(target, 'leadership')), 1))
  ),
  // "While your MACO is present, if you have no cards in hand, this personnel is attributes +1 …" He is a MACO
  // himself, and is not present with himself.
  row('Malcolm Reed Enthusiastic Major', 'self', 'self', attributes(when((c) => c.view.hand.length === 0 && others(c, (p) => hasKeyword(p, 'maco')) > 0, 1))),
  // "While you have no cards in hand, this personnel is attributes +1."
  row("T'Pol Not a Slave", 'self', 'self', attributes(when(({ view }) => view.hand.length === 0, 1))),
  // "While you have no cards in hand, each [AU][SF] personnel present is Cunning +1 (and Integrity +1 if they are
  // aboard an [AU][SF] ship)." Archer, [AU][SF], is +1 himself.
  row('Jonathan Archer Defiant Commander', 'group', 'group', {
    cunning: when(({ view, target }) => view.hand.length === 0 && isPersonnel(target) && auSf(target), 1),
    integrity: when(({ view, target, ship }) => view.hand.length === 0 && isPersonnel(target) && auSf(target) && !!ship && auSf(ship), 1),
  }),
  // "While each player has four or more cards in hand, this personnel is attributes +1 …" In a solo game the
  // player is each player, as Martinez reads it.
  row('Garvey', 'self', 'self', attributes(when(({ view }) => view.hand.length >= 4, 1))),
  // The cards of #1683, each held by one shipped deck, that need a reading of their own.
  // "Each of your Klingons and Honor personnel present is Integrity -2, Cunning +1, and Strength +2." An
  // equipment's group row: a Klingon with Honor gets it once.
  row('The Sword of Kahless', 'group', 'group', (() => {
    const klingonOrHonor = ({ target }: AmountContext) => isPersonnel(target) && (hasTrait(target, 'klingon') || hasSkill(target, 'honor'));
    return { integrity: when(klingonOrHonor, -2), cunning: when(klingonOrHonor, 1), strength: when(klingonOrHonor, 2) };
  })()),
  // "While this personnel is equipped with an Orb, he is Integrity +2 …" An equipment with the Orb keyword in his
  // group.
  row("Miles O'Brien Ill-Equipped Storyteller", 'self', 'self', {
    integrity: when(({ group }) => (group ?? []).some((c) => isEquipment(c) && hasKeyword(c, 'orb')), 2),
  }),
  // "While no player commands a Temporal event, this personnel is attributes +1." A Temporal event in the core,
  // or placed on a mission card or a ship.
  row('Morgan Bateson Confident Commander', 'self', 'self', attributes(1), { condition: NO_TEMPORAL_EVENT }),
  // "This personnel is Cunning +1 for each Rule you command that has a different card title." The Rule events in
  // the core, by distinct title.
  row('Quark True Ferengi', 'self', 'self', { cunning: ({ view }) => distinctTitleCount(view.core.filter((c) => hasKeyword(c, 'rule'))) }),
  // "While you have four or more cards beneath your {Ferenginar}, this personnel is attributes +1 …" The cards
  // under the mission of a slot whose mission is Ferenginar.
  row('Tog Lecherous DaiMon', 'self', 'self', attributes(when(({ view }) => viewMissions(view, { titled: 'Ferenginar' }).some((m) => m.underMission.length >= 4), 1))),
];

// An [AU][SF] card (Jonathan Archer Defiant Commander).
function auSf(c: ViewCard): boolean {
  return hasIcon(c, 'au') && hasAffiliation(c, 'starfleet');
}

import { isCommanderOf } from '../../commander';
import { SKILL_INDEX } from '../../dilemmaBot/requirements';
import { CommandedTraits, CostFacts, CostMission, CostModel, CostPlay, CostShip, ModelCost } from '../model';

// The cards whose cost depends on where they are played (#1702): at this mission, aboard a ship. The
// play names the mission slot it lands in and the ship whose crew it boards; the facts are the table
// before the move, so the card being played never counts itself.

const MINUS = '−';

/** The mission slot the card lands in, or undefined for a play to no slot. */
const slotOf = (play: CostPlay, facts: CostFacts): CostMission | undefined =>
  play.missionIndex === undefined ? undefined : facts.missions?.[play.missionIndex];

/** The personnel at the mission the card lands in: its away team and every crew there. */
const atThisMission = (play: CostPlay, facts: CostFacts): CommandedTraits[] => slotOf(play, facts)?.personnel ?? [];

/** The ship whose crew the card boards, or undefined. */
const shipOf = (play: CostPlay, facts: CostFacts): CostShip | undefined =>
  play.shipId === undefined ? undefined : slotOf(play, facts)?.ships?.find((s) => s.id === play.shipId);

const words = (field: string): string[] => field.split(/[^a-z]+/).filter(Boolean);

/** "Cost −1 for each <what> at this mission." */
const forEachHere =
  (test: (p: CommandedTraits) => boolean, what: (n: number) => string) =>
  (play: CostPlay, facts: CostFacts): ModelCost | null => {
    const n = atThisMission(play, facts).filter(test).length;
    return n > 0 ? { cost: play.printed - n, reason: `${what(n)} at this mission` } : null;
  };

/** "May play aboard your [Kli] ship at a non-[AQ] mission at cost −1." Applied outright. */
const aboardKlingonOutsideAlpha = (play: CostPlay, facts: CostFacts): ModelCost | null => {
  const ship = shipOf(play, facts);
  const quadrant = slotOf(play, facts)?.quadrant ?? '';
  return ship && words(ship.affiliation).includes('klingon') && quadrant !== '' && quadrant !== 'a'
    ? { cost: play.printed - 1, reason: 'aboard a [Kli] ship outside the Alpha Quadrant' }
    : null;
};

/** Whether a ship is a {U.S.S. Voyager}: its title less its subtitle is "U.S.S. Voyager". */
const isVoyager = (ship: CostShip): boolean => {
  const title = ship.title.toLowerCase();
  return title === 'u.s.s. voyager' || title.startsWith('u.s.s. voyager ');
};

export const OWN_COST_PLACE_MODELS: CostModel[] = [
  // "When you play this personnel, if you have a Gul or Legate at this mission, this personnel's cost -1."
  {
    title: 'Ari',
    family: 'ownCost',
    playCost: (play, facts) =>
      atThisMission(play, facts).some((p) => p.keywords.includes('gul') || p.keywords.includes('legate'))
        ? { cost: play.printed - 1, reason: 'a Gul or Legate at this mission' }
        : null,
  },
  // "When you play this ship, it is cost -1 for each Reman at this mission."
  {
    title: 'Scimitar Reman Warbird',
    label: 'Scimitar',
    family: 'ownCost',
    playCost: forEachHere((p) => p.species.includes('reman'), (n) => (n === 1 ? '1 Reman' : `${n} Remans`)),
  },
  // "When you play this ship, for each [TNG] Leadership personnel at this mission, this ship is cost -1."
  {
    title: 'U.S.S. Enterprise-E Flagship of the Federation',
    label: 'U.S.S. Enterprise-E',
    family: 'ownCost',
    playCost: forEachHere(
      (p) => p.icons.includes('[tng]') && (p.skills[SKILL_INDEX.leadership] ?? 0) > 0,
      (n) => `${n} [TNG] Leadership personnel`
    ),
  },
  // "You may play this personnel aboard your [Kli] ship at a non-[AQ] mission at cost -1." The table
  // applies it wherever the play lands aboard such a ship.
  ...['Kamok', "Kar'meth", 'Nirok', "M'tokra"].map(
    (title): CostModel => ({ title, family: 'ownCost', playCost: aboardKlingonOutsideAlpha })
  ),
  // "You may play this personnel aboard your {U.S.S. Voyager} at cost -2 to choose an opponent; they may
  // download a Q card." The opponent is not on the table: the printed cost, and the choice aboard Voyager.
  {
    title: 'William T. Riker Surprised Witness',
    label: 'William T. Riker',
    family: 'ownCost',
    playCost: (play, facts) => {
      const ship = shipOf(play, facts);
      return ship && isVoyager(ship)
        ? { cost: play.printed, reason: 'aboard U.S.S. Voyager', choice: { label: `Choose an opponent: ${MINUS}2`, cost: play.printed - 2 } }
        : null;
    },
  },
  // "You may play this personnel at cost +2 aboard your [TNG] ship." Applied outright.
  {
    title: "Worf Governor of H'atoria",
    label: 'Worf',
    family: 'ownCost',
    playCost: (play, facts) =>
      shipOf(play, facts)?.icons.includes('[tng]') ? { cost: play.printed + 2, reason: 'aboard a [TNG] ship' } : null,
  },
  // "Plays in your core. You may play a Commander that corresponds with your ship aboard that ship. When
  // you do, he or she is cost -1." A "Commander: <ship>." keyword names the ship.
  {
    title: 'Captain on the Bridge',
    family: 'ownCost',
    costOfPlay: (play, facts) => {
      const ship = play.type === 'personnel' ? shipOf(play, facts) : undefined;
      return ship && isCommanderOf((play.keywords ?? []).join('. '), ship.title)
        ? { cost: play.printed - 1, reason: `commands ${ship.title}` }
        : null;
    },
  },
];

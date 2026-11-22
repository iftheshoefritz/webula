import { CostFacts, CostModel, CostPlay, ModelCost } from '../model';
import { commands } from '../../tableView';
import { minusWhen } from '../factsSource';
import { both, commandedPersonnel, species, Test } from './commanded';

// The personnel that cost less while the player commands a named group (#1701): two [Pa] Klingons,
// each both a Klingon by species and of the [Pa] icon, or a Khan Noonien Singh, any card of that
// title, or a Kahless. The facts are the table before the move, so the card being played never counts
// itself. Two Khan personnel (#1737) cost less only when played to a Ceti Alpha V.

const paKlingon: Test = both(species('klingon'), (p) => p.icons.includes('[pa]'));

/** A personnel of the title `title`: its name is the title, or the title and a subtitle (`passesPartnerTest`). */
const titled =
  (title: string): Test =>
  (p) =>
    p.name === title || p.name.startsWith(`${title} `);

const twoPaKlingons = (off: number) => minusWhen(commands(commandedPersonnel({ where: paKlingon }), '[Pa] Klingons', { min: 2 }), off);
const khanTest = titled('khan noonien singh');
const commandsKhan = commands(commandedPersonnel({ where: khanTest }), 'Khan Noonien Singh');
const khan = minusWhen(commandsKhan, 2);

/** Whether a mission's name is of the title {Ceti Alpha V}, any version, in any case. */
const isCetiAlphaV = (name: string): boolean => {
  const n = name.toLowerCase();
  return n === 'ceti alpha v' || n.startsWith('ceti alpha v ');
};

/**
 * "While you command {Khan Noonien Singh}, you may play this personnel at <cost> to/at {Ceti Alpha V}."
 * Applied outright when the play lands at a Ceti Alpha V slot, its away team or a ship's crew there.
 * `cost` gives the new cost from the printed one.
 */
const khanAtCetiAlphaV =
  (cost: (printed: number) => number) =>
  (play: CostPlay, facts: CostFacts): ModelCost | null => {
    const slot = play.missionIndex === undefined ? undefined : facts.missions?.[play.missionIndex];
    if (!slot || !isCetiAlphaV(slot.name)) return null;
    const khanCommanded = minusWhen(commandsKhan, 0)(play, facts);
    return khanCommanded ? { cost: cost(play.printed), reason: `${khanCommanded.reason}, at Ceti Alpha V` } : null;
  };

export const NAMED_GROUP_MODELS: CostModel[] = [
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -2."
  { title: 'Kang Vigilant Commander', label: 'Kang', family: 'ownCost', playCost: twoPaKlingons(2) },
  { title: 'Khod Conniving Captain', label: 'Khod', family: 'ownCost', playCost: twoPaKlingons(2) },
  { title: 'Koloth Ingratiating Captain', label: 'Koloth', family: 'ownCost', playCost: twoPaKlingons(2) },
  { title: 'Kor Courageous Governor', label: 'Kor', family: 'ownCost', playCost: twoPaKlingons(2) },
  { title: 'Kras Merciless Officer', label: 'Kras', family: 'ownCost', playCost: twoPaKlingons(2) },
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -1."
  { title: 'Korax Instigator', label: 'Korax', family: 'ownCost', playCost: twoPaKlingons(1) },
  { title: "Ro'suv", family: 'ownCost', playCost: twoPaKlingons(1) },
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -2." (#1737)
  { title: 'Mara Science Officer', label: 'Mara', family: 'ownCost', playCost: twoPaKlingons(2) },
  // "When you play this personnel, if you command {Kahless}, this personnel's cost is -1." (#1737)
  { title: 'Khar', family: 'ownCost', playCost: minusWhen(commands(commandedPersonnel({ where: titled('kahless') }), 'Kahless'), 1) },
  // "When you play this personnel, if you command {Khan Noonien Singh}, he is cost -2."
  { title: 'Rodriguez', family: 'ownCost', playCost: khan },
  { title: 'Kati', family: 'ownCost', playCost: khan },
  { title: 'McPherson', family: 'ownCost', playCost: khan },
  { title: 'Otto', family: 'ownCost', playCost: khan },
  // "While you command {Khan Noonien Singh}, you may play this personnel at cost -1 to {Ceti Alpha V}."
  { title: 'Marla McGivers Superior Woman', label: 'Marla McGivers', family: 'ownCost', playCost: khanAtCetiAlphaV((printed) => printed - 1) },
  // "While you command {Khan Noonien Singh}, you may play this personnel at cost 1 at {Ceti Alpha V}."
  { title: 'Pavel A. Chekov Hapless Puppet', label: 'Pavel A. Chekov', family: 'ownCost', playCost: khanAtCetiAlphaV(() => 1) },
];

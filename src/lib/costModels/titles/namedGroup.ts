import { cardTitleOf } from '../../cardTitle';
import { CostMission, CostModel } from '../model';
import { commands } from '../../tableView';
import { CostRowSpec, own, ownWhen, withRows } from '../rows';
import { both, commandedPersonnel, species, Test } from './commanded';

// The personnel that cost less while the player commands a named group (#1701): two [Pa] Klingons,
// each both a Klingon by species and of the [Pa] icon, or a Khan Noonien Singh, any card of that
// title, or a Kahless. The facts are the table before the move, so the card being played never counts
// itself. Two Khan personnel (#1737) cost less only when played to a Ceti Alpha V.

const paKlingon: Test = both(species('klingon'), (p) => p.icons.includes('[pa]'));

/**
 * A personnel of the card title `title`, lowercased, any version and any subtitle: "When you name a card, you do so
 * by card title only, not subtitle." (Glossary › naming cards, p. 18). With no `cardTitle`, as in a test's hand-built
 * facts, the card title is the name less its version suffix.
 */
const titled =
  (title: string): Test =>
  (p) =>
    (p.cardTitle ?? cardTitleOf(p.name).toLowerCase()) === title;

const twoPaKlingons = (off: number) => ownWhen(commands(commandedPersonnel({ where: paKlingon }), '[Pa] Klingons', { min: 2 }), off);
const khanTest = titled('khan noonien singh');
const commandsKhan = commands(commandedPersonnel({ where: khanTest }), 'Khan Noonien Singh');
const khan = ownWhen(commandsKhan, 2);

/** Whether a mission is of the card title {Ceti Alpha V}, any version and any subtitle, in any case. */
const isCetiAlphaV = (m: CostMission): boolean => (m.cardTitle ?? cardTitleOf(m.name).toLowerCase()) === 'ceti alpha v';

/**
 * "While you command {Khan Noonien Singh}, you may play this personnel at <cost> to/at {Ceti Alpha V}."
 * Applied outright when the play lands at a Ceti Alpha V slot, its away team or a ship's crew there.
 * `cost` gives the new cost from the printed one.
 */
const khanAtCetiAlphaV = (cost: (printed: number) => number): CostRowSpec =>
  own(
    ({ play, facts, because }) => {
      const slot = play.missionIndex === undefined ? undefined : facts.missions?.[play.missionIndex];
      return slot && isCetiAlphaV(slot) ? { cost: cost(play.printed), reason: `${because}, at Ceti Alpha V` } : null;
    },
    { condition: commandsKhan }
  );

export const NAMED_GROUP_MODELS: CostModel[] = [
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -2."
  withRows({ title: 'Kang Vigilant Commander', label: 'Kang', family: 'ownCost' }, twoPaKlingons(2)),
  withRows({ title: 'Khod Conniving Captain', label: 'Khod', family: 'ownCost' }, twoPaKlingons(2)),
  withRows({ title: 'Koloth Ingratiating Captain', label: 'Koloth', family: 'ownCost' }, twoPaKlingons(2)),
  withRows({ title: 'Kor Courageous Governor', label: 'Kor', family: 'ownCost' }, twoPaKlingons(2)),
  withRows({ title: 'Kras Merciless Officer', label: 'Kras', family: 'ownCost' }, twoPaKlingons(2)),
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -1."
  withRows({ title: 'Korax Instigator', label: 'Korax', family: 'ownCost' }, twoPaKlingons(1)),
  withRows({ title: "Ro'suv", family: 'ownCost' }, twoPaKlingons(1)),
  // "When you play this personnel, if you command two [Pa] Klingons, this personnel is cost -2." (#1737)
  withRows({ title: 'Mara Science Officer', label: 'Mara', family: 'ownCost' }, twoPaKlingons(2)),
  // "When you play this personnel, if you command {Kahless}, this personnel's cost is -1." (#1737)
  withRows({ title: 'Khar', family: 'ownCost' }, ownWhen(commands(commandedPersonnel({ where: titled('kahless') }), 'Kahless'), 1)),
  // "When you play this personnel, if you command {Khan Noonien Singh}, he is cost -2."
  withRows({ title: 'Rodriguez', family: 'ownCost' }, khan),
  withRows({ title: 'Kati', family: 'ownCost' }, khan),
  withRows({ title: 'McPherson', family: 'ownCost' }, khan),
  withRows({ title: 'Otto', family: 'ownCost' }, khan),
  // "While you command {Khan Noonien Singh}, you may play this personnel at cost -1 to {Ceti Alpha V}."
  withRows({ title: 'Marla McGivers Superior Woman', label: 'Marla McGivers', family: 'ownCost' }, khanAtCetiAlphaV((printed) => printed - 1)),
  // "While you command {Khan Noonien Singh}, you may play this personnel at cost 1 at {Ceti Alpha V}."
  withRows({ title: 'Pavel A. Chekov Hapless Puppet', label: 'Pavel A. Chekov', family: 'ownCost' }, khanAtCetiAlphaV(() => 1)),
];

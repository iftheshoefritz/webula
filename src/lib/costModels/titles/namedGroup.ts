import { CostModel } from '../model';
import { both, ifCommand, species, Test } from './commanded';

// The personnel that cost less while the player commands a named group (#1701): two [Pa] Klingons,
// each both a Klingon by species and of the [Pa] icon, or a Khan Noonien Singh, any card of that
// title. The facts are the table before the move, so the card being played never counts itself.

const paKlingon: Test = both(species('klingon'), (p) => p.icons.includes('[pa]'));

/** A personnel of the title `title`: its name is the title, or the title and a subtitle (`passesPartnerTest`). */
const titled =
  (title: string): Test =>
  (p) =>
    p.name === title || p.name.startsWith(`${title} `);

const twoPaKlingons = (off: number) => ifCommand(2, paKlingon, off, '[Pa] Klingons');
const khan = ifCommand(1, titled('khan noonien singh'), 2, 'Khan Noonien Singh');

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
  // "When you play this personnel, if you command {Khan Noonien Singh}, he is cost -2."
  { title: 'Rodriguez', family: 'ownCost', playCost: khan },
  { title: 'Kati', family: 'ownCost', playCost: khan },
  { title: 'McPherson', family: 'ownCost', playCost: khan },
  { title: 'Otto', family: 'ownCost', playCost: khan },
];

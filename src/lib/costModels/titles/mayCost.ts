import { CostModel } from '../model';

// The cards that may be played at a changed cost for an effect (#1698): "You may play this personnel
// (ship) at cost +N to …", and "… at cost −N to ignore his (her, its) next ability". A "may": the
// printed cost, and the choice at the changed cost whatever the table holds, since the player knows
// whether they want the effect. And the cards a play from the discard pile costs more, which only the
// discard pile allows.

const MINUS = '−';

// The title, the change of its cost and the effect it buys, in a few words.
const MAY_COSTS: [title: string, delta: number, effect: string][] = [
  ['Christopher Pike Bold Commander', 1, 'Draw two cards'],
  ['Number One Reputable Officer', 2, 'Free three from brigs'],
  ['Ronald Tracey Delusional Captain', 1, 'Download an equipment'],
  ['Nilz Baris Agricultural Undersecretary', 3, 'Remove an event'],
  ['George Stocker Starbase Commodore', 2, 'Download a [TOS] ship'],
  ['Matt Decker Vengeful Commodore', 3, 'Destroy an event'],
  ['Pavel A. Chekov Young Navigator', 1, 'Return a [TOS] personnel'],
  ['Leonard H. McCoy Chief Medical Officer', 3, 'Take back two dilemmas'],
  ['Evans', 2, 'Download a card'],
  ['James T. Kirk Dubious Duplicate', 3, 'Download two cards'],
  ['Laurence T. Stone Portmaster', 3, 'Place three personnel'],
  ['Sarek Vulcan Delegate', 1, 'Draw cards'],
  ['U.S.S. Constitution', 3, 'Draw four cards'],
  ['Helen Noel Enterprise Psychiatrist', 3, 'Remove dilemmas'],
  ['Giotto Security Chief', 2, 'Prevent a dilemma'],
  ['Areel Shaw', 2, 'Examine your deck'],
  ['Hikaru Sulu Senior Helmsman', 1, 'Examine your deck'],
  ['James T. Kirk Highly-Decorated Captain', 3, 'Download two cards'],
  ["Janice Rand Captain's Yeoman", 2, 'Name a personnel'],
  ['Josephs', 5, 'Discard from decks'],
  ['Montgomery Scott Chief Engineer', 1, 'Replace cards in hand'],
  ['Spock Science Officer', 2, 'Remove a dilemma'],
  ['Uhura Skilled Technician', 2, 'Get an interrupt'],
  ['U.S.S. Constellation Dead Hulk', 2, 'Take a card from discard'],
  ['U.S.S. Enterprise Beautiful Lady', 4, 'Score 5 points'],
  ['Starship Defiant Ripe for the Taking', 3, 'Destroy an event'],
  ['Spock Flirting with Danger', 1, 'Reveal a hand'],
  ['Christine Chapel Clandestine Vessel', 2, 'Gain skills'],
  ['Karl Jaeger', 2, 'Remove four cards'],
  ['Nagata', 1, 'Draw cards'],
  ['Mark Piper', 2, 'Return a [TOS] personnel'],
  ['Benjamin Finney Bitter Records Officer', 2, 'Name a skill'],
  ["U.S.S. Exeter Fleet's Finest", 2, 'Take two equipment'],
  ['Jeffrey Pierce On The Edge', 1, 'Choose a [SF] personnel'],
  ['Hikaru Sulu Experienced Helmsman', -2, 'Ignore his next ability'],
  ['Ilia Finest Navigator in Starfleet', -2, 'Ignore her next ability'],
  ['Montgomery Scott Experienced Engineer', -2, 'Ignore his next ability'],
  ['Willard Decker Recommended Replacement', -1, 'Ignore his next ability'],
  ['Uhura Experienced Technician', -2, 'Ignore her next ability'],
  // Its second clause, a downloaded [TOS] personnel played at cost −4 aboard it, prices a download, not
  // the ship's own play: it is left to the batch of downloads with a cost.
  ['U.S.S. Enterprise Where She Belongs', -4, 'Ignore its next ability'],
  ['James T. Kirk Experienced Commander', -2, 'Ignore his next ability'],
  ['Spock Experienced Officer', -1, 'Ignore his next ability'],
  ['Pavel A. Chekov Experienced Adept', -2, 'Ignore his next ability'],
];

// "While this personnel is in your discard pile, you may play him from your discard pile at cost +N."
const DISCARD_COSTS: [title: string, delta: number][] = [
  ['Daniels Timeline Protector', 2],
  ['Errol', 1],
];

const signed = (delta: number): string => (delta < 0 ? `${MINUS}${-delta}` : `+${delta}`);

export const MAY_COST_MODELS: CostModel[] = [
  ...MAY_COSTS.map(
    ([title, delta, effect]): CostModel => ({
      title,
      family: 'ownCost',
      playCost: (play) => ({
        cost: play.printed,
        reason: `you may play it at cost ${signed(delta)}`,
        choice: { label: `${effect}: ${signed(delta)}`, cost: play.printed + delta },
      }),
    })
  ),
  ...DISCARD_COSTS.map(
    ([title, delta]): CostModel => ({
      title,
      family: 'ownCost',
      discardPlayCost: (play) => ({ cost: play.printed + delta, reason: 'played from your discard pile' }),
    })
  ),
];

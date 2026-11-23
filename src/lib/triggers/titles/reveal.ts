// The trigger rows that change the kept roll of a revealed dilemma (#1905, part 3 of #1867): Let's Try That Again,
// Shall We? in the core and Dessert Disaster in the hand. They wait for `dilemmaRevealed` and are taken on the revealed
// card's own buttons (`dilemma-select-again`, `dilemma-replace-pick`), never as offer chips: `selectAgainEventOf` and
// `replacePickOptionsOf` in `tableReducer.ts` read these rows against the standing reveal, while the card is
// unresolved, so the buttons, the actions `selectAgain` and `replacePick` and their log entries stay as #1847 made them.

import { trigger, type GameEventOf, type TriggerContext, type TriggerRow } from '../model';

export const SELECT_AGAIN_TITLE = "Let's Try That Again, Shall We?";
export const REPLACE_PICK_TITLE = 'Dessert Disaster';

const rolled = (event: GameEventOf<'dilemmaRevealed'>): boolean => event.picks.some((p) => p.length > 0);

const iconsOf = (icons: readonly string[]): string => icons.join('').toLowerCase();
const hasStaffingIcon = (icons: readonly string[]): boolean => /\[(cmd|stf)\]/.test(iconsOf(icons));

/**
 * Dessert Disaster's condition, on the view: a picked personnel with no staffing icon, and an unstopped, unpicked
 * [Stf] personnel present with it (the same away team, or the same ship's crew).
 */
function replaceable(event: GameEventOf<'dilemmaRevealed'>, { view }: TriggerContext): boolean {
  const picked = new Set(event.picks.flat());
  const all = view.missions.flatMap((m) => [...m.awayTeam, ...m.ships.flatMap((s) => s.crew)]).filter((p) => p.type === 'personnel');
  const from = all.filter((p) => picked.has(p.id) && !hasStaffingIcon(p.icons));
  return from.some((f) =>
    all.some((p) => !picked.has(p.id) && !p.stopped && p.missionIndex === f.missionIndex && p.shipId === f.shipId && iconsOf(p.icons).includes('[stf]'))
  );
}

export const REVEAL_TRIGGER_ROWS: TriggerRow[] = [
  // "Plays in your core. When any number of personnel are randomly selected by a planet dilemma, you may destroy this
  // event to ignore its results and select again." The dilemma's own kind is planet (`dilemmatype` `p`), never dual.
  trigger(
    SELECT_AGAIN_TITLE,
    'When any number of personnel are randomly selected by a planet dilemma, you may destroy this event to ignore its results and select again.',
    'core',
    { kind: 'dilemmaRevealed', where: (event) => event.dilemmaType === 'p' && rolled(event) },
    [{ kind: 'selectAgain' }],
    { may: true, useCost: { kind: 'destroySelf' } }
  ),
  // "When your personnel who does not have a staffing icon is randomly selected by a dilemma, you may replace him or her
  // with one of your [Stf] personnel present." An interrupt: its use moves it to the discard pile.
  trigger(
    REPLACE_PICK_TITLE,
    'When your personnel who does not have a staffing icon is randomly selected by a dilemma, you may replace him or her with one of your [Stf] personnel present.',
    'hand',
    { kind: 'dilemmaRevealed', where: (event, context) => rolled(event) && replaceable(event, context) },
    [{ kind: 'replacePick' }],
    { may: true, useCost: { kind: 'discardSelf' } }
  ),
];

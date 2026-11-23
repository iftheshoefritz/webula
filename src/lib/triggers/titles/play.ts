// The trigger rows that wait for a play of the player's (#1904): "When you play a … personnel, you may draw a card."

import { draw } from '../../effectSteps';
import { personnel, type TableView, type ViewTableCard } from '../../tableView';
import { trigger, type GameEventOf, type TriggerRow } from '../model';

// The played personnel as the table holds it now, by its instance id, or null when it is not on the table.
function playedPersonnel(event: GameEventOf<'played'>, view: TableView): ViewTableCard | null {
  if (event.type !== 'personnel' || !event.card.id) return null;
  return personnel(view, { unstopped: false }).find((p) => p.id === event.card.id) ?? null;
}

export const PLAY_TRIGGER_ROWS: TriggerRow[] = [
  // "When you play a [DS9] personnel of a species you do not command, you may draw a card. You may do this only once
  // each turn." Not his own play: none of his species the player commands is the played personnel's, him aside.
  trigger(
    'Enrique Muniz Dependable Troubleshooter',
    'When you play a [DS9] personnel of a species you do not command, you may draw a card. You may do this only once each turn.',
    'table',
    {
      kind: 'played',
      where: (event, { view, source }) => {
        const played = playedPersonnel(event, view);
        if (!played || played.id === source?.id || !played.icons.includes('[ds9]') || !played.species.length) return false;
        const others = personnel(view, { unstopped: true }).filter((p) => p.id !== played.id);
        return !others.some((p) => p.species.some((s) => played.species.includes(s)));
      },
    },
    [draw(1, { may: true })],
    { may: true, once: 'turn' }
  ),
  // "To play this event, you must command three [TNG] personnel. Plays in your core. When a player plays a personnel
  // who costs 3 or more, he or she may draw a card." The player's own plays only (#1904).
  trigger(
    'VIP Welcome',
    'When a player plays a personnel who costs 3 or more, he or she may draw a card.',
    'core',
    { kind: 'played', where: (event, { view }) => (playedPersonnel(event, view)?.cost ?? 0) >= 3 },
    [draw(1, { may: true })],
    { may: true }
  ),
];

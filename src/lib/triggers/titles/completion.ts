// The trigger rows of a completed mission (#1903): "When you complete a mission, … score N points."

import { score } from '../../effectSteps';
import { shipWithCommanderAt } from '../../tableView';
import { trigger, type TriggerRow } from '../model';

export const COMPLETION_TRIGGER_ROWS: TriggerRow[] = [
  // "Plays on your headquarters mission. When you complete a mission that has a different quadrant icon than this
  // mission, score 5 points."
  trigger(
    'Distant Exploration',
    'When you complete a mission that has a different quadrant icon than this mission, score 5 points.',
    'missionCard',
    { kind: 'missionCompleted', where: (event, { sourceSlot }) => !!sourceSlot && event.quadrant !== sourceSlot.quadrant },
    [score(5)]
  ),
  // "Plays in your core. When you complete a mission, if you command a staffed ship at that mission with its
  // Commander aboard, score 5 points."
  trigger(
    'Mission Accomplished',
    'When you complete a mission, if you command a staffed ship at that mission with its Commander aboard, score 5 points.',
    'core',
    { kind: 'missionCompleted' },
    [score(5)],
    { condition: shipWithCommanderAt() }
  ),
];

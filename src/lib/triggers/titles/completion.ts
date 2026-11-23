// The trigger rows of a completed mission (#1903): "When you complete a mission, … score N points."

import { score } from '../../effectSteps';
import { shipWithCommanderAt, type ViewMission } from '../../tableView';
import { trigger, type TriggerRow } from '../model';

// A mission whose keywords hold "Nebula." (#1904).
const isNebula = (m: ViewMission | undefined): boolean =>
  !!m?.card &&
  String(m.card.row?.keywords ?? '')
    .toLowerCase()
    .split('.')
    .some((k) => k.trim() === 'nebula');

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
  // "Plays in your core. … When you complete a Nebula mission, you may destroy this event to score 10 points." The
  // "about to move" clause is left out (#1904).
  trigger(
    'Hurried Departure',
    'When you complete a Nebula mission, you may destroy this event to score 10 points.',
    'core',
    { kind: 'missionCompleted', where: (event, { view }) => isNebula(view.missions[event.missionIndex]) },
    [score(10)],
    { may: true, useCost: { kind: 'destroySelf' } }
  ),
  // "Plays on a mission with no dilemmas beneath it (limit one per mission). … When a player completes this mission,
  // he or she may score 5 points." The Consume clause is left out (#1904).
  trigger(
    'Debate Over Dinner',
    'When a player completes this mission, he or she may score 5 points.',
    'missionCard',
    { kind: 'missionCompleted', where: (event, { sourceSlot }) => sourceSlot?.index === event.missionIndex },
    [score(5)],
    { may: true }
  ),
];

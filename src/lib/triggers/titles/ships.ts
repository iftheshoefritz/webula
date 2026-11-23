// The trigger rows of the ships (#1904): "When you complete a … mission, if this ship is at that mission, score N
// points."

import { score } from '../../effectSteps';
import { requiresSkill } from '../../tableView';
import { trigger, type TriggerRow } from '../model';

export const SHIP_TRIGGER_ROWS: TriggerRow[] = [
  // "When you complete a [Fed] planet mission, if this ship is at that mission, score 5 points."
  trigger(
    'U.S.S. Enterprise-E Federation Envoy',
    'When you complete a [Fed] planet mission, if this ship is at that mission, score 5 points.',
    'table',
    {
      kind: 'missionCompleted',
      mission: { type: 'p', where: (m) => m.icons.includes('[fed]') },
      where: (event, { sourceSlot }) => sourceSlot?.index === event.missionIndex,
    },
    [score(5)]
  ),
  // "When you complete a space mission requiring Diplomacy, if this ship is at that mission, score 10 points."
  trigger(
    'U.S.S. Enterprise-D Explorer',
    'When you complete a space mission requiring Diplomacy, if this ship is at that mission, score 10 points.',
    'table',
    {
      kind: 'missionCompleted',
      mission: { type: 's', where: (m) => requiresSkill(m, 'diplomacy') },
      where: (event, { sourceSlot }) => sourceSlot?.index === event.missionIndex,
    },
    [score(10)]
  ),
];

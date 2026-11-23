import { events, missionAt } from '../../tableView';
import { CostModel } from '../model';
import { byPersonnel, withRows } from '../rows';

// The personnel whose text prices the play of another card while they are on the table (#1756). The
// registry asks each title of an unstopped personnel of the player's away teams and crews, never the brig,
// once (`personnelCostsOf`). A stopped personnel gives nothing. The discounts apply at once, though the
// text says "may": the charge chip corrects a charge.

export const PERSONNEL_RULE_MODELS: CostModel[] = [
  // "When you are about to play an event on a mission, if you command {For the Cause}, you may play that
  // event at cost -1 (or cost -2 if it is being played on a Region: Demilitarized Zone mission)." An event
  // placed on a mission card, while For the Cause is among the events the player commands.
  withRows(
    { title: 'Anthwara Leader of the Tribal Council', label: 'Anthwara', family: 'personnelRule' },
    byPersonnel(({ play, source }) => {
      if (play.type !== 'event' || play.onMissionIndex === undefined) return null;
      if (events(source, { where: (e) => e.title === 'For the Cause' }).length === 0) return null;
      const dmz = (missionAt(source, play.onMissionIndex)?.regions ?? []).includes('demilitarized zone');
      return dmz
        ? { cost: play.printed - 2, reason: 'event on a Demilitarized Zone mission, you command For the Cause' }
        : { cost: play.printed - 1, reason: 'event on a mission, you command For the Cause' };
    })
  ),
];

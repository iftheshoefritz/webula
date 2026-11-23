import { ATTEMPT_MISSION_TITLES } from '../../app/decks/practice/attemptMissions';
import { COMPLETION_EFFECTS } from '../../app/decks/practice/completionEffects';
import { SIGMA_IOTIA, SIGMA_IOTIA_TITLE } from '../../app/decks/practice/dilemmaPrevention';
import { EARTH_TITLE, NIMBUS_TITLE } from '../../app/decks/practice/missionSpends';
import { cardTitleOf } from '../../lib/cardTitle';
import { MISSION_RULE_MODELS } from '../../lib/costModels/titles/missionRule';
import { MISSION_COST_TITLES, missionCostOf } from '../../lib/dilemmaBot/pile/missionCost';
import { MISSION_MODELS, MISSION_TRIGGER_READERS, missionModelOf, missionModelsWith, type MissionTrigger } from '../../lib/missionModels';
import { MODIFIER_ROWS } from '../../lib/modifiers';
import { addedRequirements } from '../../lib/requirementRules';
import { cardRows } from './backlogData';

// The mission registry (#1907): one row per mission title, each ability quoting its card's sentence, each
// trigger read by its hook.

const titlesWith = (trigger: MissionTrigger): string[] => missionModelsWith(trigger).map(({ model }) => model.title);

// The braces of the card data mark a title; the rows quote the sentence without them.
const plain = (text: string): string => text.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

describe('the mission registry', () => {
  it('has one row per title', () => {
    const keys = MISSION_MODELS.map((m) => cardTitleOf(m.title).toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('quotes a sentence of its card in every ability', () => {
    const texts = new Map<string, string[]>();
    for (const row of cardRows()) {
      if (row.type !== 'Mission') continue;
      const key = cardTitleOf(row.name).toLowerCase();
      texts.set(key, [...(texts.get(key) ?? []), plain(row.gametext)]);
    }
    const missing = MISSION_MODELS.flatMap((m) =>
      m.abilities.flatMap((a) => ((texts.get(m.title.toLowerCase()) ?? []).some((t) => t.includes(plain(a.text))) ? [] : [`${m.title}: ${a.text}`]))
    );
    expect(missing).toEqual([]);
  });

  it('names a reader for every trigger', () => {
    for (const row of MISSION_MODELS) for (const a of row.abilities) expect(MISSION_TRIGGER_READERS[a.trigger]).toBeTruthy();
  });

  it('is what each hook reads', () => {
    expect([...COMPLETION_EFFECTS.keys()].sort()).toEqual(titlesWith('onComplete').sort());
    expect([...ATTEMPT_MISSION_TITLES].sort()).toEqual(titlesWith('onAttemptStart').map((t) => t.toLowerCase()).sort());
    expect([...MISSION_COST_TITLES, SIGMA_IOTIA_TITLE.toLowerCase()].sort()).toEqual(
      titlesWith('onDilemmaReveal').map((t) => t.toLowerCase()).sort()
    );
    expect(SIGMA_IOTIA).toBe('Sigma Iotia II');
    expect([EARTH_TITLE, NIMBUS_TITLE].sort()).toEqual(titlesWith('spend').sort());
  });

  it('lists the standing cost rows of missionRule.ts and the attribute rows of the mission place, with no row of its own', () => {
    expect(MISSION_RULE_MODELS.map((m) => m.title).sort()).toEqual(titlesWith('standingCost').sort());
    const attributeTitles = [...new Set(MODIFIER_ROWS.filter((r) => r.source === 'mission' && !r.changes.cost).map((r) => r.title))];
    expect(attributeTitles.sort()).toEqual(titlesWith('attributes').sort());
  });

  it('finds a row by any version of its title', () => {
    expect(missionModelOf('Stakoron II Mine Miszinite')?.label).toBe('Stakoron II');
    expect(missionModelOf('Bassen Rift Interdict Genocidal Praetor *VP')?.label).toBe('Bassen Rift');
    expect(missionModelOf('Invented Mission')).toBeUndefined();
    expect(missionCostOf({ name: 'Invented Mission' })).toBeUndefined();
  });

  it('reads the requirements ability of a row', () => {
    const nebula = { name: 'Crescent Nebula Take Out the Trash', missiontype: 's', skills: 'Astrometrics', affiliation: '[rom]' };
    const other = { name: 'Invented Planet', missiontype: 'p', skills: 'Medical', affiliation: '[kli]' };
    const fed = { name: 'Invented Fed Planet', missiontype: 'p', skills: 'Medical', affiliation: '[fed]' };
    expect(addedRequirements([nebula, other, fed])).toEqual([[], ['Intelligence'], []]);
  });
});

// The fixture store of `/playtest/admin?fixture=1` (#1645). Every set and card here is invented.

import { playtestAdminFixtureApi } from '../../lib/playtestAdminFixture';
import { PLAYTEST_COLUMNS } from '../../lib/playtestCards';

function tsvOf(set: string, name: string, collectorsInfo: string): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: set, ImageFile: `PT${collectorsInfo}`, CollectorsInfo: collectorsInfo, Type: 'Event' });
  return [PLAYTEST_COLUMNS.join('\t'), PLAYTEST_COLUMNS.map((c) => fields[c]).join('\t')].join('\n');
}

const namesOf = async (api: ReturnType<typeof playtestAdminFixtureApi>) =>
  (await api.status()).sets.map((set) => `${set.name}@${set.version}`);

describe('playtestAdminFixtureApi', () => {
  it('adds a new set, replaces a set, re-uploads one and removes one', async () => {
    const api = playtestAdminFixtureApi();
    expect(await namesOf(api)).toEqual(['TestSetA@3', 'TestSetB@1']);
    await api.sendCards(tsvOf('TestSetC', 'Invented C', '9601'), null);
    expect(await namesOf(api)).toEqual(['TestSetA@3', 'TestSetB@1', 'TestSetC@1']);
    await api.sendCards(tsvOf('TestSetB2', 'Invented B2', '9701'), 'TestSetB');
    expect(await namesOf(api)).toEqual(['TestSetA@3', 'TestSetB2@1', 'TestSetC@1']);
    await api.sendCards(tsvOf('TestSetA', 'Invented A', '9801'), 'TestSetA');
    expect(await namesOf(api)).toEqual(['TestSetA@4', 'TestSetB2@1', 'TestSetC@1']);
    await api.removeSet('TestSetC');
    expect(await namesOf(api)).toEqual(['TestSetA@4', 'TestSetB2@1']);
  });

  it('refuses a new set of a name in testing', async () => {
    const api = playtestAdminFixtureApi();
    await expect(api.sendCards(tsvOf('TestSetA', 'Invented A', '9801'), null)).rejects.toThrow('already in testing');
  });
});

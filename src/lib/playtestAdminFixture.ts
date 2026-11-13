// A fixture of the playtest upload page (#1613): `/playtest/admin?fixture=1` renders the page with
// this in-memory store and no route, so an agent that cannot sign in as an owner can check the
// layout. Development only: `playtestAdminFixtureAllowed` is false in production, and the page then
// ignores `fixture=1`. Every set, card and email is invented.

import type { PlaytestAdminApi, PlaytestAdminSet, PlaytestAdminStatus } from '../components/PlaytestAdminClient';
import { playtestSetKey } from './playtestImageFile';
import { checkPlaytestUpload, playtestImageFiles, playtestSetCardsOf, readNormalisedTsv } from './playtestUpload';

export function playtestAdminFixtureAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

const fixtureSet = (name: string, version: number, first: number): PlaytestAdminSet => ({
  name,
  version,
  uploadedAt: '2026-11-01T18:30:00.000Z',
  cards: 2,
  images: 2,
  cardNames: [`${name} Invented One`, `${name} Invented Two`],
  collectorsInfo: [String(first), String(first + 1)],
});

export function playtestAdminFixtureApi(): PlaytestAdminApi {
  const status: PlaytestAdminStatus = {
    sets: [fixtureSet('TestSetA', 3, 9001), fixtureSet('TestSetB', 1, 9101)],
    legacyError: null,
    emails: ['first.tester@example.com', 'second.tester@example.com'],
  };
  const emails = () => [...status.emails].sort();
  return {
    status: async () => ({ ...status, sets: status.sets.map((set) => ({ ...set })), emails: emails() }),
    sendImages: async () => {},
    async sendCards(tsv, replace) {
      // The checks of the cards route, with no real card names.
      const { result, set } = checkPlaytestUpload(tsv, new Set(), status.sets, replace);
      if (set.errors.length > 0) throw new Error(set.errors.join('; '));
      if (result.errors.length > 0) throw new Error('The TSV has errors');
      if (set.name === null) throw new Error('The TSV holds no cards');
      const name = set.name;
      const rows = readNormalisedTsv(result.tsv);
      const previous = status.sets.find((s) => playtestSetKey(s.name) === playtestSetKey(name));
      const next: PlaytestAdminSet = {
        version: (previous?.version ?? 0) + 1,
        uploadedAt: new Date().toISOString(),
        cards: rows.length,
        images: playtestImageFiles(result.tsv).length,
        ...playtestSetCardsOf(name, result.tsv),
      };
      status.sets = [
        ...status.sets.filter((s) => s !== previous && playtestSetKey(s.name) !== set.replace),
        next,
      ].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },
    async removeSet(name) {
      const key = playtestSetKey(name);
      if (!status.sets.some((s) => playtestSetKey(s.name) === key)) throw new Error(`The set ${name} is not in testing`);
      status.sets = status.sets.filter((s) => playtestSetKey(s.name) !== key);
    },
    async addEmail(email) {
      const value = email.trim().toLowerCase();
      if (!status.emails.includes(value)) status.emails.push(value);
      return emails();
    },
    async removeEmail(email) {
      status.emails = status.emails.filter((e) => e !== email);
      return emails();
    },
  };
}

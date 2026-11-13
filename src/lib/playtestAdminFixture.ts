// A fixture of the playtest upload page (#1613): `/playtest/admin?fixture=1` renders the page with
// this in-memory store and no route, so an agent that cannot sign in as an owner can check the
// layout. Development only: `playtestAdminFixtureAllowed` is false in production, and the page then
// ignores `fixture=1`. Every set, card and email is invented.

import type { PlaytestAdminApi, PlaytestAdminSet, PlaytestAdminStatus } from '../components/PlaytestAdminClient';
import { readNormalisedTsv, setNameOfTsv } from './playtestUpload';
import { normalisePlaytestTsv } from './playtestCards';

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
      const normalised = normalisePlaytestTsv(tsv, new Set()).tsv;
      const found = setNameOfTsv(normalised);
      if ('error' in found) throw new Error(found.error);
      const rows = readNormalisedTsv(normalised);
      const previous = status.sets.find((set) => set.name.toLowerCase() === found.name.toLowerCase());
      const next: PlaytestAdminSet = {
        name: found.name,
        version: (previous?.version ?? 0) + 1,
        uploadedAt: new Date().toISOString(),
        cards: rows.length,
        images: rows.length,
        cardNames: rows.map((row) => row.Name),
        collectorsInfo: rows.map((row) => row.CollectorsInfo.replace(/^PT-/, '')),
      };
      status.sets = [
        ...status.sets.filter((set) => set !== previous && set.name.toLowerCase() !== replace?.toLowerCase()),
        next,
      ].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
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

// A fixture of the playtest upload page (#1613): `/playtest/admin?fixture=1` renders the page with
// this in-memory store and no route, so an agent that cannot sign in as an owner can check the
// layout. Development only: `playtestAdminFixtureAllowed` is false in production, and the page then
// ignores `fixture=1`. Every email is invented.

import type { PlaytestAdminApi, PlaytestAdminStatus } from '../components/PlaytestAdminClient';

export function playtestAdminFixtureAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function playtestAdminFixtureApi(): PlaytestAdminApi {
  const status: PlaytestAdminStatus = {
    version: 3,
    uploadedAt: '2026-11-01T18:30:00.000Z',
    cards: 12,
    images: 12,
    emails: ['first.tester@example.com', 'second.tester@example.com'],
  };
  const emails = () => [...status.emails].sort();
  return {
    status: async () => ({ ...status, emails: emails() }),
    sendImages: async () => {},
    async sendCards() {
      status.version += 1;
      status.uploadedAt = new Date().toISOString();
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

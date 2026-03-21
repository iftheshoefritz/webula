import { isEarlyAccessUser } from '../../lib/featureFlags';

describe('isEarlyAccessUser', () => {
  const originalEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  afterEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = originalEnv;
    jest.resetModules();
  });

  it('returns false for null email', () => {
    expect(isEarlyAccessUser(null)).toBe(false);
  });

  it('returns false for undefined email', () => {
    expect(isEarlyAccessUser(undefined)).toBe(false);
  });

  it('returns false for empty string email', () => {
    expect(isEarlyAccessUser('')).toBe(false);
  });
});

describe('isEarlyAccessUser with allowlist', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('returns true for an email in the allowlist (case-insensitive)', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'alice@gmail.com,bob@example.com';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isEarlyAccessUser: check } = require('../../lib/featureFlags');
      expect(check('alice@gmail.com')).toBe(true);
      expect(check('ALICE@GMAIL.COM')).toBe(true);
      expect(check('bob@example.com')).toBe(true);
    });
  });

  it('returns false for an email not in the allowlist', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'alice@gmail.com';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isEarlyAccessUser: check } = require('../../lib/featureFlags');
      expect(check('charlie@gmail.com')).toBe(false);
    });
  });

  it('returns false for all emails when env var is empty', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = '';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isEarlyAccessUser: check } = require('../../lib/featureFlags');
      expect(check('anyone@gmail.com')).toBe(false);
    });
  });

  it('handles whitespace around emails in the env var', () => {
    jest.isolateModules(() => {
      process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = ' alice@gmail.com , bob@example.com ';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isEarlyAccessUser: check } = require('../../lib/featureFlags');
      expect(check('alice@gmail.com')).toBe(true);
      expect(check('bob@example.com')).toBe(true);
    });
  });
});

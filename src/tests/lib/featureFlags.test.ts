import { isEarlyAccessUser } from '../../lib/featureFlags';

describe('isEarlyAccessUser', () => {
  const originalEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  afterEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = originalEnv;
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

  it('returns true for an email in the allowlist (case-insensitive)', () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'alice@gmail.com,bob@example.com';
    expect(isEarlyAccessUser('alice@gmail.com')).toBe(true);
    expect(isEarlyAccessUser('ALICE@GMAIL.COM')).toBe(true);
    expect(isEarlyAccessUser('bob@example.com')).toBe(true);
  });

  it('returns false for an email not in the allowlist', () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'alice@gmail.com';
    expect(isEarlyAccessUser('charlie@gmail.com')).toBe(false);
  });

  it('returns false for all emails when env var is empty', () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = '';
    expect(isEarlyAccessUser('anyone@gmail.com')).toBe(false);
  });

  it('handles whitespace around emails in the env var', () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = ' alice@gmail.com , bob@example.com ';
    expect(isEarlyAccessUser('alice@gmail.com')).toBe(true);
    expect(isEarlyAccessUser('bob@example.com')).toBe(true);
  });
});

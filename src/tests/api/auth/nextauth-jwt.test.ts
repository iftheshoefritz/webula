/**
 * @jest-environment node
 */

const mockRefresh = jest.fn();
jest.mock('@googleapis/drive', () => ({
  auth: {
    OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn(), refreshAccessToken: () => mockRefresh() })),
  },
}));

import { authOptions } from '../../../app/api/auth/authOptions';

describe('the session length (#1660)', () => {
  it('lasts 90 days and rolls forward once a day', () => {
    expect(authOptions.session).toEqual({ strategy: 'jwt', maxAge: 90 * 24 * 60 * 60, updateAge: 24 * 60 * 60 });
  });
});

describe('a refresh that Google refuses (#1660)', () => {
  const expired = {
    email: 'tester@example.com',
    accessToken: 'old',
    refreshToken: 'revoked',
    accessTokenExpires: Date.now() - 1000,
  };
  const jwt = (token: object) => authOptions.callbacks!.jwt!({ token, account: null, user: undefined as any } as any);

  beforeEach(() => {
    mockRefresh.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps the token and its email, and sets error', async () => {
    mockRefresh.mockRejectedValue(new Error('invalid_grant'));
    const token = (await jwt(expired)) as any;
    expect(token.email).toBe('tester@example.com');
    expect(token.refreshToken).toBe('revoked');
    expect(token.error).toBe('RefreshAccessTokenError');
  });

  it('waits an hour before it tries again', async () => {
    mockRefresh.mockRejectedValue(new Error('invalid_grant'));
    const failed = await jwt(expired);
    const again = (await jwt(failed)) as any;
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(again.email).toBe('tester@example.com');
  });

  it('clears the error once a later refresh succeeds', async () => {
    mockRefresh.mockResolvedValue({ credentials: { access_token: 'new', expiry_date: Date.now() + 3600_000 } });
    const token = (await jwt({ ...expired, error: 'RefreshAccessTokenError', refreshRetryAt: Date.now() - 1 })) as any;
    expect(token.accessToken).toBe('new');
    expect(token.error).toBeUndefined();
    expect(token.refreshRetryAt).toBeUndefined();
    expect(token.email).toBe('tester@example.com');
  });
});

describe('nextauth jwt callback', () => {
  it('computes accessTokenExpires from account.expires_at (absolute epoch seconds) on sign-in', async () => {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600;

    const token = await authOptions.callbacks!.jwt!({
      token: {},
      account: {
        provider: 'google',
        type: 'oauth',
        providerAccountId: 'x',
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        expires_at: expiresAtSeconds,
      },
      user: undefined as any,
    } as any);

    expect((token as any).accessTokenExpires).toBe(expiresAtSeconds * 1000);
  });

  it('leaves accessTokenExpires unchanged on subsequent requests where account is absent', async () => {
    const previousExpires = Date.now() + 100000;
    const previousToken = {
      accessToken: 'existing-token',
      refreshToken: 'existing-refresh',
      accessTokenExpires: previousExpires,
      hasDriveScope: true,
    };

    const token = await authOptions.callbacks!.jwt!({
      token: previousToken,
      account: null,
      user: undefined as any,
    } as any);

    expect((token as any).accessTokenExpires).toBe(previousExpires);
    expect((token as any).accessToken).toBe('existing-token');
  });
});

describe('nextauth redirect callback', () => {
  const baseUrl = 'https://webula.example.com';

  it('resolves a relative callback URL against baseUrl', async () => {
    const result = await authOptions.callbacks!.redirect!({
      url: '/import-trekcc/bulk?share=abc123',
      baseUrl,
    } as any);

    expect(result).toBe(`${baseUrl}/import-trekcc/bulk?share=abc123`);
  });

  it('passes through an absolute callback URL on the same origin', async () => {
    const result = await authOptions.callbacks!.redirect!({
      url: `${baseUrl}/import-trekcc/bulk?share=abc123`,
      baseUrl,
    } as any);

    expect(result).toBe(`${baseUrl}/import-trekcc/bulk?share=abc123`);
  });

  it('falls back to /decks for an off-origin URL', async () => {
    const result = await authOptions.callbacks!.redirect!({
      url: 'https://evil.example.com/phish',
      baseUrl,
    } as any);

    expect(result).toBe(`${baseUrl}/decks`);
  });
});

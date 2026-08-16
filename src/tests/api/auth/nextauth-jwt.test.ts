/**
 * @jest-environment node
 */

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
    },
  },
}));

import { authOptions } from '../../../app/api/auth/[...nextauth]/route';

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

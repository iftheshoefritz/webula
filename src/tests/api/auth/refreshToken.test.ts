/**
 * @jest-environment node
 */

const mockRefreshAccessToken = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock('@googleapis/drive', () => ({
  auth: {
    OAuth2: jest.fn().mockImplementation(() => ({
      setCredentials: (...args: unknown[]) => mockSetCredentials(...args),
      refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
    })),
  },
}));

import { refreshAccessToken } from '../../../app/api/auth/refreshToken';

describe('refreshAccessToken', () => {
  beforeEach(() => {
    mockRefreshAccessToken.mockReset();
    mockSetCredentials.mockReset();
  });

  it('sets accessTokenExpires from expiry_date, the absolute time google-auth-library returns', async () => {
    const expiryDate = Date.now() + 3599 * 1000;
    mockRefreshAccessToken.mockResolvedValue({
      credentials: { access_token: 'new-access-token', expiry_date: expiryDate },
    });

    const result = await refreshAccessToken({ accessToken: 'old', refreshToken: 'refresh-token' });

    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-token' });
    expect(result.accessToken).toBe('new-access-token');
    expect(Number.isFinite(result.accessTokenExpires)).toBe(true);
    expect(result.accessTokenExpires).toBe(expiryDate);
    expect(result.refreshToken).toBe('refresh-token');
  });

  it('falls back to an hour from now when expiry_date is missing', async () => {
    mockRefreshAccessToken.mockResolvedValue({ credentials: { access_token: 'new-access-token' } });

    const before = Date.now();
    const result = await refreshAccessToken({ refreshToken: 'refresh-token' });

    expect(result.accessTokenExpires).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(result.accessTokenExpires).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);
  });

  it('keeps a new refresh token when Google returns one', async () => {
    mockRefreshAccessToken.mockResolvedValue({
      credentials: { access_token: 'a', refresh_token: 'rotated', expiry_date: Date.now() + 1000 },
    });

    const result = await refreshAccessToken({ refreshToken: 'refresh-token' });

    expect(result.refreshToken).toBe('rotated');
  });
});

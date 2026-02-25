import { google } from 'googleapis';

// Utility function to refresh the access token
export async function refreshAccessToken(token) {
  const auth = new google.auth.OAuth2({
    clientId: process.env.NEXTAUTH_CLIENTID,
    clientSecret: process.env.GOOGLE_SECRET,
  });

  auth.setCredentials({ refresh_token: token.refreshToken })

  const { credentials } = await auth.refreshAccessToken()
  const expiresIn = (credentials as any).expires_in;
  return {
    ...token,
    accessToken: credentials.access_token,
    accessTokenExpires: Date.now() + expiresIn * 1000,
    refreshToken: credentials.refresh_token ?? token.refreshToken, // Fall back to old refresh token
  };
}

import * as google from '@googleapis/drive';

// Utility function to refresh the access token
export async function refreshAccessToken(token) {
  const auth = new google.auth.OAuth2({
    clientId: process.env.NEXTAUTH_CLIENTID,
    clientSecret: process.env.GOOGLE_SECRET,
  });

  auth.setCredentials({ refresh_token: token.refreshToken })

  const { credentials } = await auth.refreshAccessToken()
  // google-auth-library turns expires_in into expiry_date, an absolute time in ms
  return {
    ...token,
    accessToken: credentials.access_token,
    accessTokenExpires: credentials.expiry_date ?? Date.now() + 60 * 60 * 1000,
    refreshToken: credentials.refresh_token ?? token.refreshToken, // Fall back to old refresh token
  };
}

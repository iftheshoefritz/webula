import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { refreshAccessToken } from './refreshToken';

export const SESSION_MAX_AGE = 90 * 24 * 60 * 60;
const REFRESH_RETRY_MS = 60 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.NEXTAUTH_CLIENTID as string,
      clientSecret: process.env.GOOGLE_SECRET as string,
      authorization: {
        params: {
          scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          access_type: 'offline',
          include_granted_scopes: true,
        }
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET as string,
  // 90 days, rolled forward once a day by an active user (#1660), so a playtester who comes back
  // stays signed in.
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE, updateAge: 24 * 60 * 60 },
  callbacks: {
    async jwt(
      {
        token,
        account
      }
    ) {
      // If account exists, it means it's a sign-in
      console.log('token in jwt callback=', token)
      console.log('account in jwt callback=', account)
      if (account) {
        delete token.error;
        delete token.refreshRetryAt;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.hasDriveScope = account.scope?.includes('drive.appdata') ?? false;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
      }

      // Return previous token if it hasn't expired yet
      if (Date.now() < (token as { accessTokenExpires: number} ).accessTokenExpires) {
        return token;
      }

      // A refresh that failed is tried again an hour later, not on every request.
      const retryAt = (token as { refreshRetryAt?: number }).refreshRetryAt;
      if (retryAt !== undefined && Date.now() < retryAt) return token;

      // Access token has expired, so we need to refresh it
      console.log('Access token has expired, refreshing...');
      // A refresh Google refuses (no refresh token, or one the app's "Testing" status expired after
      // 7 days) keeps the token and its email (#1660): the playtest and Championship routes need only
      // the email. A Drive call with the stale access token still fails and asks for a sign-in.
      try {
        const refreshed = await refreshAccessToken(token);
        delete refreshed.error;
        delete refreshed.refreshRetryAt;
        return refreshed;
      } catch (error) {
        console.error('Refreshing the access token failed', error);
        return { ...token, error: 'RefreshAccessTokenError', refreshRetryAt: Date.now() + REFRESH_RETRY_MS };
      }
    },
    async session({ session, token }) {
      (session as any).hasDriveScope = (token as any).hasDriveScope ?? false;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/decks`;
    }
  },
}

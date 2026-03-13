import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { refreshAccessToken } from '../refreshToken';


const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.NEXTAUTH_CLIENTID as string,
      clientSecret: process.env.GOOGLE_SECRET as string,
      authorization: {
        params: {
          scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive.appdata'
          ].join(' '),
        }
      }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET as string,
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
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      token.accessTokenExpires = Date.now() + (account?.expires_at || 3600) * 1000;

      // Return previous token if it hasn't expired yet
      if (Date.now() < (token as { accessTokenExpires: number} ).accessTokenExpires) {
        return token;
      }

      // Access token has expired, so we need to refresh it
      console.log('Access token has expired, refreshing...');
      return refreshAccessToken(token);
    },
    async redirect({}) {
      return "/decks"
    }
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

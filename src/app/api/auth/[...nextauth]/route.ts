import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"


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
    async jwt({token, account }) {
      //console.log('*****************JWT CALLBACK!!')
      //console.log('token', token)
      //console.log('account', account)
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account?.refreshToken;
      }
      return token;
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

# Sign-in

The rules of the NextAuth session that the code does not show at a glance. Read this file before you
change `src/app/api/auth/authOptions.ts` or a route that reads the caller's email.

The NextAuth session is a JWT of 90 days, rolled forward once a day by an active user
(`session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE, updateAge }`).

A Google refresh that fails (no refresh token, or one the OAuth app's "Testing" status expired after
7 days) does not sign the caller out: the `jwt` callback keeps the token and its email with
`error: 'RefreshAccessTokenError'`, and tries again an hour later (`refreshRetryAt`). The routes that
need only the email, the playtest, Championship and stats routes, keep answering; a Drive call with
the stale access token still fails.

import { getToken } from 'next-auth/jwt';

// The email of the signed-in caller, from the NextAuth JWT; null for a signed-out caller. The
// Championship deck routes, `/api/stats` and the playtest routes read it.
export async function callerEmail(req: Request): Promise<string | null> {
  try {
    const token = await getToken({ req: req as Parameters<typeof getToken>[0]['req'], secret: process.env.NEXTAUTH_SECRET });
    return typeof token?.email === 'string' ? token.email : null;
  } catch {
    return null;
  }
}

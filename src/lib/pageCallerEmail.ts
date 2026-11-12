import { getToken } from 'next-auth/jwt';
import { cookies, headers } from 'next/headers';

// The email of the signed-in visitor of a server-rendered page, from the NextAuth JWT, as
// `callerEmail` reads it for a route; null for a signed-out visitor. Reading the cookies makes
// the page dynamic, so it is never pre-rendered.
export async function pageCallerEmail(): Promise<string | null> {
  try {
    const req = { cookies: await cookies(), headers: await headers() };
    const token = await getToken({ req: req as unknown as Parameters<typeof getToken>[0]['req'], secret: process.env.NEXTAUTH_SECRET });
    return typeof token?.email === 'string' ? token.email : null;
  } catch {
    return null;
  }
}

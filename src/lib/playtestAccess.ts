import { getPlaytestStore } from './playtestStore';

// Who may read the playtest cards (#1612): an owner, from the server-only `PLAYTEST_ADMIN_EMAILS`
// (not `NEXT_PUBLIC_`, so the list stays out of the client bundle), or an email in `playtest:emails`.

/** The owners, from the server-only `PLAYTEST_ADMIN_EMAILS`, read at call time. */
export function playtestOwnerEmails(env: Record<string, string | undefined> = process.env): string[] {
  return (env.PLAYTEST_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlaytestOwner(email: string | null): boolean {
  return !!email && playtestOwnerEmails().includes(email.trim().toLowerCase());
}

/** An owner, or an email in `playtest:emails`. Throws when the store cannot be read. */
export async function isPlaytester(email: string | null): Promise<boolean> {
  if (!email) return false;
  if (isPlaytestOwner(email)) return true;
  return getPlaytestStore().hasPlaytester(email.trim().toLowerCase());
}

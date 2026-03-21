export function isEarlyAccessUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = new Set(
    (process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return allowlist.has(email.toLowerCase());
}

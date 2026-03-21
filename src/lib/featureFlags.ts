const earlyAccessEmails = new Set(
  (process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isEarlyAccessUser(email: string | null | undefined): boolean {
  return !!email && earlyAccessEmails.has(email.toLowerCase());
}

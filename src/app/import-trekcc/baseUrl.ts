// BASE_URL points at whichever deployment generated the bookmarklet/Shortcut scripts
// (production or a Vercel preview), so a script keeps working when copied from a preview
// URL instead of always hard-coding production.
const BASE_URL =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app');

export default BASE_URL;

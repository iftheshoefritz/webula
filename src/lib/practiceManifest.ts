import type { Metadata } from 'next';

// The two home-screen installs of the practice table (#922). Each page links its own manifest,
// and each manifest has its own `id`, so Chrome keeps the two installs apart instead of letting
// the second replace the first.
export const PRACTICE_MANIFEST = '/practice-table.webmanifest';
export const PRACTICE_FIXTURE_MANIFEST = '/practice-fixture.webmanifest';

export const APPLE_TOUCH_ICON = '/app-icons/apple-touch-icon.png';

export function isFixtureParam(fixture: string | string[] | undefined): boolean {
  return (Array.isArray(fixture) ? fixture[0] : fixture) === '1';
}

// The metadata of `/decks/practice`: the manifest, and the tags iPhone Safari reads, since it
// takes the home-screen title and icon from the page rather than from the manifest.
export function practiceMetadata(fixture: boolean): Metadata {
  const title = fixture ? 'Practice Fixture' : 'Practice Table';
  return {
    title: `Webula – ${title}`,
    manifest: fixture ? PRACTICE_FIXTURE_MANIFEST : PRACTICE_MANIFEST,
    appleWebApp: {
      capable: true,
      title,
      statusBarStyle: 'black-translucent',
    },
    icons: { apple: APPLE_TOUCH_ICON },
    // Next.js writes only `mobile-web-app-capable` for `appleWebApp.capable`, and an iOS older
    // than 16.4 needs the `apple-` tag to open the home-screen icon with no toolbar.
    other: { 'apple-mobile-web-app-capable': 'yes' },
  };
}

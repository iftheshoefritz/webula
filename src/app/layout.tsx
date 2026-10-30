import { Providers } from './providers'
import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import ConsentBanner from '../components/ConsentBanner';
import ErrorBoundary from '../components/ErrorBoundary';

import React from 'react';

type LayoutProps = {
  children: React.ReactNode;
};

export const metadata: Metadata = {
  title: 'Webula – Star Trek CCG Card Search',
  description: 'Search the Star Trek CCG card database.',
  openGraph: {
    siteName: 'Webula',
    images: [{ url: '/og-default.png' }],
  },
};

// Issue #1383: the viewport tag comes from this export, not from a hand-written `<meta>`, so a
// route can override it (`/decks/practice` adds `viewportFit: 'cover'`) and Next swaps the tag on a
// client-side navigation. Each page then has exactly one viewport tag.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <ConsentBanner />
          <footer className="text-center text-xs text-gray-500 py-4">
            <Link href="/privacy" className="underline hover:text-gray-300">
              Privacy Policy
            </Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
};

export default Layout;

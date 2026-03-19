import { Providers } from './providers'
import '../styles/globals.css';
import type { Metadata } from 'next';

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

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
};

export default Layout;

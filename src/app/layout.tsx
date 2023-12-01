import { Analytics } from '@vercel/analytics/react';
import React from 'react';

type LayoutProps = {
  children: React.ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <html lang="en">
      <head>
        <title>Webula</title>
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
};

export default Layout;

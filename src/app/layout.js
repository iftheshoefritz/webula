import { Analytics } from '@vercel/analytics/react';

export default function Layout({ children }) {
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
  )
}

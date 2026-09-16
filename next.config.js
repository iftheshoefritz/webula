/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // An agent that checks the dev server in a browser sets NEXT_PUBLIC_AGENT_BROWSER=1. The dev tools
  // button sits in the bottom-left corner and covers page elements there, such as the practice
  // draw pile. Build errors still show.
  devIndicators: process.env.NEXT_PUBLIC_AGENT_BROWSER === '1' ? false : undefined,
  env: {
    // Vercel sets VERCEL_ENV on the server only. Expose it so client components can tell a
    // preview deployment from production.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || '',
  },
}

module.exports = nextConfig

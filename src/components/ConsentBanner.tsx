'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import posthog from 'posthog-js';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('analytics_consent');
    if (consent === null) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem('analytics_consent', 'true');
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (key && !posthog.__loaded) {
      posthog.init(key, { api_host: host, capture_pageview: false });
    }
    setVisible(false);
  }

  function decline() {
    localStorage.setItem('analytics_consent', 'false');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-300">
      <p>
        This site uses analytics to improve your experience.{' '}
        <Link href="/privacy" className="underline text-blue-400">
          Privacy Policy
        </Link>
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={accept}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
        >
          Accept
        </button>
        <button
          onClick={decline}
          className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

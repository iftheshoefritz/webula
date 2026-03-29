"use client";
import { SessionProvider } from "next-auth/react";
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { Suspense, useEffect } from 'react';
import PostHogPageView from '../components/PostHogPageView';

function PostHogInit({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key) return;

    const consent = localStorage.getItem('analytics_consent');

    if (consent === 'true') {
      // Full tracking with consent
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
      });
    } else {
      // Anonymous cookieless tracking — no consent required under GDPR
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        persistence: 'memory',
        ip: false,
        person_profiles: 'never',
        autocapture: false,
        disable_session_recording: true,
      });
    }
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PostHogProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PostHogInit>{children}</PostHogInit>
    </SessionProvider>
  );
}

"use client";
import { SessionProvider } from "next-auth/react";
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { Suspense, useEffect } from 'react';
import PostHogPageView from '../components/PostHogPageView';
import { reduceEventUrls } from '../lib/analyticsUrls';

function PostHogInit({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      posthog.captureException(event.reason);
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

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
      // No consent, declined or not answered yet (#1408). PostHog's cookieless mode stores
      // nothing on the device: its server makes a visitor id that lasts one day, from a hash of
      // the IP and the browser with a salt it deletes each day. It counts unique visitors and
      // sessions with no cookie and no person profile. No autocapture, which sends the text of
      // the element clicked, and the URLs keep their parameter names but not their values.
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        cookieless_mode: 'always',
        person_profiles: 'never',
        autocapture: false,
        disable_session_recording: true,
        before_send: reduceEventUrls,
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

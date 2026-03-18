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
    if (key) {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
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

import type { Metadata } from 'next';
import { Suspense } from 'react';
import StatsClient from '../../components/StatsClient';

export const metadata: Metadata = { title: 'Agent stats – Webula' };

// The stats come from `/api/stats` at request time (#1417), never at build time, which keeps the
// static HTML small and the stats fresh. The page and the route are public (#1990).
export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsClient />
    </Suspense>
  );
}

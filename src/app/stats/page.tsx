import type { Metadata } from 'next';
import { Suspense } from 'react';
import StatsClient from '../../components/StatsClient';

export const metadata: Metadata = { title: 'Agent stats – Webula' };

// The stats come from `/api/stats` at request time (#1417), never at build time: a build-time read
// would put them into the static HTML, where any user could read them.
export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsClient />
    </Suspense>
  );
}

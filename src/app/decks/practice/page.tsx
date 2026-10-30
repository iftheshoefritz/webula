import type { Metadata, Viewport } from 'next';
import { isDebugTapsParam, isFixtureParam, practiceMetadata } from '../../../lib/practiceManifest';
import PracticeTable from './PracticeTable';

// A server page, so the manifest link can follow `?fixture=1` (#922) and `?debugTaps=1` (#1155). The table itself is the
// client component in PracticeTable.tsx.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ fixture?: string | string[]; debugTaps?: string | string[] }> }
): Promise<Metadata> {
  const { fixture, debugTaps } = await searchParams;
  return practiceMetadata(isFixtureParam(fixture), isDebugTapsParam(debugTaps));
}

// Issue #1383: the practice table draws under the home indicator and the rounded corners of an
// iPhone, and keeps its controls clear of them with `env(safe-area-inset-*)` (`useSafeAreaInsets`).
// Only this route covers the screen; every other page keeps the root layout's viewport.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function PracticeDrawPage() {
  return <PracticeTable />;
}

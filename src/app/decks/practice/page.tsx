import type { Metadata } from 'next';
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

export default function PracticeDrawPage() {
  return <PracticeTable />;
}

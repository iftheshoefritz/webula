import type { Metadata } from 'next';
import { isFixtureParam, practiceMetadata } from '../../../lib/practiceManifest';
import PracticeTable from './PracticeTable';

// A server page, so the manifest link can follow `?fixture=1` (#922). The table itself is the
// client component in PracticeTable.tsx.
export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ fixture?: string | string[] }> }
): Promise<Metadata> {
  const { fixture } = await searchParams;
  return practiceMetadata(isFixtureParam(fixture));
}

export default function PracticeDrawPage() {
  return <PracticeTable />;
}

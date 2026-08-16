import type { Metadata } from 'next';
import { Suspense } from 'react';
import BulkImportClient from '../../../components/BulkImportClient';

export const metadata: Metadata = {
  title: 'Bulk Import from TrekCC – Webula',
  description: 'Import several decks from trekcc.org into your Webula Google Drive at once.',
};

export default function BulkImportPage() {
  return (
    <Suspense>
      <BulkImportClient />
    </Suspense>
  );
}

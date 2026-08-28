import { Suspense } from 'react';
import { loadCards } from '../../../lib/loadCards';
import DeckReportsClient from '../../../components/DeckReportsClient';

export default function DeckReportsPage() {
  const { data } = loadCards();

  return (
    <Suspense>
      <DeckReportsClient data={data} />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { loadCards } from '../../lib/loadCards';
import DeckBuilderClient from '../../components/DeckBuilderClient';

export default function Home() {
  const { data, columns } = loadCards();

  return (
    <Suspense>
      <DeckBuilderClient data={data} columns={columns} />
    </Suspense>
  );
}

import { Suspense } from 'react';
import '../styles/globals.css';
import { loadCards } from '../lib/loadCards';
import CardSearchClient from '../components/CardSearchClient';

export default function Home() {
  const { data, columns } = loadCards();

  return (
    <div>
      <Suspense>
        <CardSearchClient data={data} columns={columns} />
      </Suspense>
    </div>
  );
}

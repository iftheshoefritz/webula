import { Suspense } from 'react';
import type { Metadata } from 'next';
import { loadCards } from '../lib/loadCards';
import { filterCards } from '../lib/filterCards';
import CardSearchClient from '../components/CardSearchClient';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app';

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ q?: string }> }
): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q ?? '';
  const { data, columns } = loadCards();
  const results = query ? filterCards(data, columns, query) : data;
  const count = results.length;

  const title = query
    ? `Webula – "${query}" (${count} card${count !== 1 ? 's' : ''})`
    : 'Webula – Star Trek CCG Card Search';

  const description = query
    ? `${count} card${count !== 1 ? 's' : ''} match "${query}" in Webula 2e search.`
    : 'Search the Star Trek CCG card database.';

  const imageUrl =
    count === 1
      ? `${BASE_URL}/cardimages/${results[0].imagefile}.jpg`
      : `${BASE_URL}/og-default.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [count === 1 ? { url: imageUrl } : { url: imageUrl, width: 1200, height: 630 }],
      siteName: 'Webula',
    },
    twitter: {
      card: count === 1 ? 'summary_large_image' : 'summary',
      title,
      description,
      images: [imageUrl],
    },
  };
}

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

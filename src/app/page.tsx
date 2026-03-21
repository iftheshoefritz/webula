import { Suspense } from 'react';
import type { Metadata } from 'next';
import { loadCards } from '../lib/loadCards';
import { filterCards } from '../lib/filterCards';
import CardSearchClient from '../components/CardSearchClient';

// On Vercel preview deployments, NEXT_PUBLIC_BASE_URL (from .env.production) is always
// 'https://webula.app', so OG image URLs would point to production rather than the preview
// host where the images actually live. Use VERCEL_URL (set automatically per-deployment)
// for previews so Discord can fetch the card images from the correct host.
const BASE_URL =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app');

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ q?: string }> }
): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q ?? '';
  const { data, columns } = loadCards();
  const results = query ? filterCards(data, columns, query) : data;
  const uniqueTitles = [...new Set(results.map((c: any) => c.originalName.replace(/\s+\*VP$/i, '')))];
  const uniqueCount = uniqueTitles.length;

  const title = query
    ? `Webula – "${query}" (${uniqueCount} card${uniqueCount !== 1 ? 's' : ''})`
    : 'Webula – Star Trek CCG Card Search';

  let description: string;
  if (!query) {
    description = 'Search the Star Trek CCG card database.';
  } else if (uniqueCount === 1) {
    description = `1 card matches "${query}" in Webula 2e search.`;
  } else {
    const previewNames = uniqueTitles.slice(0, 3);
    const namesStr = previewNames.join(', ');
    const suffix = uniqueCount > 3 ? ` & more — search Webula 2e` : ` — search Webula 2e`;
    description = `${uniqueCount} cards: ${namesStr}${suffix}`;
  }

  const imageUrl =
    uniqueCount === 1
      ? `${BASE_URL}/cardimages/${results[0].imagefile}.jpg`
      : `${BASE_URL}/og-default.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [uniqueCount === 1 ? { url: imageUrl, width: 357, height: 497 } : { url: imageUrl, width: 1200, height: 630 }],
      siteName: 'Webula',
    },
    twitter: {
      card: uniqueCount === 1 ? 'summary_large_image' : 'summary',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function Home() {
  const { data, columns } = loadCards();
  const isPreview = process.env.VERCEL_ENV === 'preview';

  return (
    <div>
      {isPreview && (
        <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 text-sm flex gap-4 flex-wrap">
          <span className="font-semibold text-yellow-800">Preview links:</span>
          <a href="/decks" className="text-blue-700 underline hover:text-blue-900">/decks</a>
          <a href="/decks?fixture=1" className="text-blue-700 underline hover:text-blue-900">/decks?fixture=1</a>
          <a href="/api/auth/signin" className="text-blue-700 underline hover:text-blue-900">/api/auth/signin</a>
          <a href="/api/auth/signout" className="text-blue-700 underline hover:text-blue-900">/api/auth/signout</a>
        </div>
      )}
      <Suspense>
        <CardSearchClient data={data} columns={columns} />
      </Suspense>
    </div>
  );
}

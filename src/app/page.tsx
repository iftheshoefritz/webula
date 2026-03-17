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
  const count = results.length;

  const title = query
    ? `Webula – "${query}" (${count} card${count !== 1 ? 's' : ''})`
    : 'Webula – Star Trek CCG Card Search';

  let description: string;
  if (!query) {
    description = 'Search the Star Trek CCG card database.';
  } else if (count === 1) {
    description = `1 card matches "${query}" in Webula 2e search.`;
  } else {
    const previewNames = results.slice(0, 3).map((c: any) => c.originalName);
    const namesStr = previewNames.join(', ');
    const suffix = count > 3 ? ` & more — search Webula 2e` : ` — search Webula 2e`;
    description = `${count} cards: ${namesStr}${suffix}`;
  }

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
      images: [count === 1 ? { url: imageUrl, width: 357, height: 497 } : { url: imageUrl, width: 1200, height: 630 }],
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

// GET /api/cards?q=name%3APicard&limit=5
import { NextRequest, NextResponse } from 'next/server';
import { loadCards } from '../../../lib/loadCards';
import { filterCards } from '../../../lib/filterCards';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const BASE_URL =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') ?? '';
  const limit = Math.min(
    parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10),
    MAX_LIMIT,
  );

  const { data, columns } = loadCards();
  const allResults = filterCards(data, columns, q);
  const results = allResults.slice(0, limit);

  const cards = results.map((card) => ({
    name: card.originalName,
    collectorsinfo: card.collectorsinfo,
    imageUrl: card.imagefile ? `${BASE_URL}/cardimages/${card.imagefile}.jpg` : null,
  }));

  return NextResponse.json(
    { q, total: allResults.length, cards },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}

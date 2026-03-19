import { NextRequest, NextResponse } from 'next/server';
import { loadCards } from '../../../../lib/loadCards';
import { filterCards } from '../../../../lib/filterCards';

const BASE_URL =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://webula.app');

// Discord interaction types
const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;

// Discord interaction response types
const RESPONSE_TYPE_PONG = 1;
const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;

async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = hexToUint8Array(publicKey);
    const sigData = hexToUint8Array(signature);
    const message = encoder.encode(timestamp + body);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    return crypto.subtle.verify('Ed25519', cryptoKey, sigData, message);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function buildSearchUrl(query: string): string {
  return `${BASE_URL}/?q=${encodeURIComponent(query)}`;
}

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'Discord public key not configured' }, { status: 500 });
  }

  const signature = req.headers.get('x-signature-ed25519') ?? '';
  const timestamp = req.headers.get('x-signature-timestamp') ?? '';
  const body = await req.text();

  const isValid = await verifyDiscordSignature(publicKey, signature, timestamp, body);
  if (!isValid) {
    return new NextResponse('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Respond to Discord's PING verification challenge
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_TYPE_PONG });
  }

  // Handle /card2e slash command
  if (interaction.type === INTERACTION_TYPE_APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;
    if (commandName === 'card2e') {
      const query: string = interaction.data?.options?.find(
        (o: { name: string }) => o.name === 'query',
      )?.value ?? '';

      const { data, columns } = loadCards();
      const results = filterCards(data, columns, query);
      const searchUrl = buildSearchUrl(query);

      if (results.length === 0) {
        return NextResponse.json({
          type: RESPONSE_TYPE_CHANNEL_MESSAGE,
          data: {
            content: `No cards found for '${query}'`,
          },
        });
      }

      if (results.length === 1) {
        const card = results[0];
        const imageUrl = card.imagefile
          ? `${BASE_URL}/cardimages/${card.imagefile}.jpg`
          : null;

        const embed: Record<string, unknown> = {
          title: card.originalName,
          url: searchUrl,
        };
        if (imageUrl) {
          embed.thumbnail = { url: imageUrl };
        }

        return NextResponse.json({
          type: RESPONSE_TYPE_CHANNEL_MESSAGE,
          data: { embeds: [embed] },
        });
      }

      // Multiple results
      return NextResponse.json({
        type: RESPONSE_TYPE_CHANNEL_MESSAGE,
        data: {
          embeds: [
            {
              title: `${results.length} cards match '${query}'`,
              url: searchUrl,
            },
          ],
        },
      });
    }
  }

  return NextResponse.json({ error: 'Unknown interaction' }, { status: 400 });
}

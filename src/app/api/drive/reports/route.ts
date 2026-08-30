import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"
import { refreshAccessToken } from '../../auth/refreshToken';
import { REPORT_MIME_TYPE } from '../mimeTypes';

async function tokenDecode(req): Promise<{ accessToken: string; accessTokenExpires: number; refreshToken: string | undefined} | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as {accessToken: string, accessTokenExpires: number, refreshToken: string | undefined}
    if (token && token.accessToken && token.accessTokenExpires > Date.now()) {
      return {
        accessToken: token.accessToken,
        accessTokenExpires: token.accessTokenExpires,
        refreshToken: token.refreshToken,
      };
    } else {
      return refreshAccessToken(token)
    }
  } catch (error) {
    console.error('Error decoding token:', error);
    return undefined;
  }
}

export async function GET(req: Request) {
  try {
    let tokenDetails = await tokenDecode(req);
    if (!tokenDetails) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = process.env.NEXTAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SECRET;

    const auth = new google.auth.OAuth2({
      clientId, clientSecret,
    })
    auth.setCredentials({ access_token: tokenDetails.accessToken })

    const drive = google.drive({
      version: 'v3',
      auth: auth,
    })

    const response = await drive.files.list({
      spaces: 'appDataFolder',
      q: `mimeType='${REPORT_MIME_TYPE}'`,
    })

    return new Response(JSON.stringify(response.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Google API returned an error:', error);
    if (error?.response?.status === 403 || error?.code === 403) {
      return new Response(JSON.stringify({ error: 'drive_scope_missing' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export async function POST(req: Request) {
  try {
    let tokenDetails = await tokenDecode(req);
    if (!tokenDetails) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = process.env.NEXTAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SECRET;
    const auth = new google.auth.OAuth2({
      clientId, clientSecret,
    })
    auth.setCredentials({ access_token: tokenDetails.accessToken })

    const drive = google.drive({
      version: 'v3',
      auth: auth,
    })

    const { name, decks } = await req.json();

    const fileMetadata = {
      name,
      mimeType: REPORT_MIME_TYPE,
      parents: ['appDataFolder'],
    }

    const media = {
      mimeType: REPORT_MIME_TYPE,
      body: JSON.stringify({ decks }),
    }

    const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id' });

    return new Response(JSON.stringify(response.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Google API returned an error:', error);
    if (error?.response?.status === 403 || error?.code === 403) {
      return new Response(JSON.stringify({ error: 'drive_scope_missing' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

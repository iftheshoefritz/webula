import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"
import { refreshAccessToken } from '../auth/[...nextauth]/route';

async function tokenDecode(req): Promise<{ accessToken: string; accessTokenExpires: number; refreshToken: string } | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token && token.accessToken && token.accessTokenExpires > Date.now()) {
      console.log('Token is valid', token.accessToken);
      return {
        accessToken: token.accessToken,
        accessTokenExpires: token.accessTokenExpires,
        refreshToken: token.refreshToken,
      };
    } else {
      console.log('Token is invalid or expired, needs refresh.');
      return refreshAccessToken(token)
    }
  } catch (error) {
    console.error('Error decoding token:', error);
    return undefined;
  }
}


export async function POST(
  req: Request
) {
  try {

    let tokenDetails = await tokenDecode(req);
    if (!tokenDetails) {
      // Handle the case where the token is invalid or expired and couldn't be refreshed
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

    const { fileName, content } = await req.json();

    const fileMetadata = {
      'name': fileName,
      'mimeType': 'application/json',
      'parents': ['appDataFolder'],
    }

    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(content)
    }

    const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id' });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  } catch (error) {
    console.error('Google API returned an error:', error);
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  }
}


export async function GET(
  req: Request
) {
  try {
    let tokenDetails = await tokenDecode(req);
    if (!tokenDetails) {
      // Handle the case where the token is invalid or expired and couldn't be refreshed
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
    })
    console.log(response.data)

    return new Response(JSON.stringify(response.data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  } catch (error) {
    console.error('Google API returned an error:', error);
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    })
  }
}

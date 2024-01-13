import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"

async function tokenDecode(req): Promise<string | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as {accessToken: string};
    if (token) {
      //console.log('Decoded JWT:', token);
      console.log('returning token', token.accessToken)
      return token.accessToken
    } else {
      console.log('Invalid or expired JWT');
    }
  } catch (error) {
    console.error('Error verifying JWT:', error);
  }
}

export async function POST(
  req: Request
) {
  try {

    const accessToken = await tokenDecode(req)

    const clientId = process.env.NEXTAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SECRET;
    const auth = new google.auth.OAuth2({
      clientId, clientSecret,
    })
    auth.setCredentials({ access_token: accessToken })

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
    const accessToken = await tokenDecode(req)

    const clientId = process.env.NEXTAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SECRET;

    const auth = new google.auth.OAuth2({
      clientId, clientSecret,
    })
    auth.setCredentials({ access_token: accessToken })

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

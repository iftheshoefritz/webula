import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"
import { refreshAccessToken } from '../../auth/[...nextauth]/route';

async function tokenDecode(req): Promise<{ accessToken: string; accessTokenExpires: number; refreshToken: string | undefined } | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as {accessToken: string, accessTokenExpires: number, refreshToken: string | undefined} 
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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id

  let tokenDetails = await tokenDecode(request);
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

  const fetchedFile = await drive.files.get({
    fileId: id,
    alt: 'media'
  })
  console.log('fetchedFile.data', fetchedFile.data)

  return new Response(JSON.stringify(fetchedFile.data), {
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
  console.log('file id to delete', id)
  console.log('parms', params)

  let tokenDetails = await tokenDecode(request);
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

  const response = await drive.files.delete({
    fileId: id,
  })
  console.log('response.data', response.data)

  return new Response(JSON.stringify(response.data), {
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id

  let tokenDetails = await tokenDecode(request);
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

  const { content } = await request.json()

  const response = await drive.files.update({
    fileId: id,
    uploadType: 'media',
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(content)
    }
  })
  console.log('response.data', response.data)

  return new Response(JSON.stringify(response.data), {
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}

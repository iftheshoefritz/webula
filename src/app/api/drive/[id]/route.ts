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
      return undefined
    }

  } catch (error) {
    console.error('Error verifying JWT:', error);
    return undefined
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id

  const accessToken = await tokenDecode(request)

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

  const lastFile = await drive.files.get({
    fileId: id,
    alt: 'media'
  })
  console.log('lastFile.data', lastFile.data)

  return new Response(JSON.stringify(lastFile.data), {
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}

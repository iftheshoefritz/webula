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

  const response = await drive.files.delete({
    fileId: id,
  })
  console.log('response.data', response.data)

  return new Response(JSON.stringify(response.data), {
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}
    status: 200,
    headers: {'Content-Type': 'application/json'}
  })
}

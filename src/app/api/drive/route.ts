import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"
import { refreshAccessToken } from '../auth/refreshToken';
import { writeDeckIdempotent } from './idempotentWrite';
import { DECK_MIME_TYPE, FOLDER_MIME_TYPE } from './mimeTypes';

async function tokenDecode(req): Promise<{ accessToken: string; accessTokenExpires: number; refreshToken: string | undefined} | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as {accessToken: string, accessTokenExpires: number, refreshToken: string | undefined}
    console.log('route.ts<drive> getToken return=', token)
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

    const { fileName, content, trekccDeckId, folderName, targetParentId } = await req.json();

    // folderName is only sent when creating a folder from the load picker; folders have
    // no content/media, unlike decks.
    if (folderName) {
      const folderMetadata = {
        'name': folderName,
        'mimeType': FOLDER_MIME_TYPE,
        'parents': ['appDataFolder'],
      }

      const response = await drive.files.create({ requestBody: folderMetadata, fields: 'id' });

      return new Response(JSON.stringify({ file: { id: response.data.id } }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        }
      })
    }

    // trekccDeckId is only sent when this deck originated from a trekCC import; in that
    // case, look for an existing Drive file for the same trekCC deck and update it in
    // place instead of creating a duplicate. Manual saves (no trekccDeckId) always create.
    if (trekccDeckId) {
      const { status, fileId } = await writeDeckIdempotent(drive, { fileName, content, trekccDeckId });
      return new Response(JSON.stringify({ file: { id: fileId }, status }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        }
      })
    }

    // targetParentId is only sent when saving into a folder from the load picker's
    // "save here" action; manual saves without it keep creating at the appDataFolder root.
    const fileMetadata = {
      'name': fileName,
      'mimeType': DECK_MIME_TYPE,
      'parents': [targetParentId || 'appDataFolder'],
    }

    const media = {
      mimeType: DECK_MIME_TYPE,
      body: JSON.stringify(content)
    }

    const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id' });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
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

    // Opt-in: includes root-level folders alongside decks and returns each file's
    // mimeType/parents. Without this flag, the query and returned fields must stay
    // exactly as they are today — compare/compare-multi/reports pickers depend on it.
    const includeFolders = new URL(req.url).searchParams.get('includeFolders') === 'true';

    const listParams: { spaces: string; q: string; fields?: string } = {
      spaces: 'appDataFolder',
      q: includeFolders
        ? `mimeType='${DECK_MIME_TYPE}' or mimeType='${FOLDER_MIME_TYPE}'`
        : `mimeType='${DECK_MIME_TYPE}'`,
    }
    if (includeFolders) {
      listParams.fields = 'files(id, name, mimeType, parents)';
    }

    const response = await drive.files.list(listParams)
    console.log(response.data)

    let responseData = response.data;
    if (includeFolders && responseData.files?.length) {
      // Drive's read APIs (files.list/files.get) echo back the App Data folder's real,
      // resolved folder id in `parents` — never the literal string 'appDataFolder'. That
      // literal is only a write-time alias, valid when setting `parents: ['appDataFolder']`
      // on files.create. Rewrite the resolved id back to the literal here so the client
      // (which uses 'appDataFolder' as its root sentinel everywhere) sees consistent data
      // regardless of whether a file came from a create response or a list/get response.
      const appDataFolderId = await drive.files.get({ fileId: 'appDataFolder', fields: 'id' });
      const rootId = appDataFolderId.data.id;
      responseData = {
        ...responseData,
        files: responseData.files.map((file) =>
          file.parents
            ? { ...file, parents: file.parents.map((p) => (p === rootId ? 'appDataFolder' : p)) }
            : file
        ),
      };
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
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
      headers: {
        'Content-Type': 'application/json',
      }
    })
  }
}

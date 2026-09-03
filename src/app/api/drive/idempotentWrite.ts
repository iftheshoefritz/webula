import type { drive_v3 } from 'googleapis';
import { DECK_MIME_TYPE } from './mimeTypes';

// Custom Drive appProperties key used to make trekCC imports idempotent: re-importing
// the same trekCC deck updates its existing appDataFolder file instead of creating a
// duplicate, keyed on the deck's trekCC id (stable) rather than its title (user-editable).
const TREKCC_DECK_ID_PROPERTY = 'trekccDeckId';

function escapeForDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function findFileIdByTrekccDeckId(
  drive: drive_v3.Drive,
  trekccDeckId: string
): Promise<string | null> {
  const response = await drive.files.list({
    spaces: 'appDataFolder',
    q: `appProperties has { key='${TREKCC_DECK_ID_PROPERTY}' and value='${escapeForDriveQuery(trekccDeckId)}' }`,
    fields: 'files(id)',
  });
  const [file] = response.data.files ?? [];
  return file?.id ?? null;
}

export type IdempotentWriteResult = { status: 'created' | 'updated'; fileId: string };

// Creates a Drive appDataFolder file for a deck, or updates it in place if a file with
// a matching trekccDeckId appProperty already exists. Falls back to always creating a
// new file when no trekccDeckId is given (matches the previous, non-idempotent behavior
// used by the manual single-deck save flow). targetParentId picks the destination folder
// on create (defaulting to the appDataFolder root); it has no effect on an update, which
// always writes in place.
export async function writeDeckIdempotent(
  drive: drive_v3.Drive,
  { fileName, content, trekccDeckId, targetParentId }: { fileName: string; content: string; trekccDeckId?: string | null; targetParentId?: string }
): Promise<IdempotentWriteResult> {
  const media = {
    mimeType: DECK_MIME_TYPE,
    body: JSON.stringify(content),
  };

  const existingFileId = trekccDeckId ? await findFileIdByTrekccDeckId(drive, trekccDeckId) : null;

  if (existingFileId) {
    await drive.files.update({
      fileId: existingFileId,
      requestBody: { name: fileName },
      media,
    });
    return { status: 'updated', fileId: existingFileId };
  }

  const requestBody: drive_v3.Schema$File = {
    name: fileName,
    mimeType: DECK_MIME_TYPE,
    parents: [targetParentId || 'appDataFolder'],
    ...(trekccDeckId ? { appProperties: { [TREKCC_DECK_ID_PROPERTY]: trekccDeckId } } : {}),
  };

  const response = await drive.files.create({ requestBody, media, fields: 'id' });
  return { status: 'created', fileId: response.data.id! };
}

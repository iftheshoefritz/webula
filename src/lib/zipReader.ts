// A small reader of a zip file, for the `images.zip` of the playtest upload (#1613). It walks the
// central directory, takes a stored entry (method 0) as it is, and inflates a deflated one
// (method 8) with `DecompressionStream('deflate-raw')`, which every current browser and Node 24
// have. A zip64 archive, an encrypted entry and any other method are errors, not guesses.

export interface ZipEntry {
  /** The path inside the zip, with `/` between folders. */
  name: string;
  data: Uint8Array;
}

export interface ZipContents {
  entries: ZipEntry[];
  errors: string[];
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a zip, folders left out. A zip it cannot read gives no entries and an error. */
export async function readZip(bytes: Uint8Array): Promise<ZipContents> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const errors: string[] = [];

  // The end of central directory record, searched from the end past a comment of up to 64 KB.
  let eocd = -1;
  for (let i = bytes.length - EOCD_SIZE; i >= Math.max(0, bytes.length - EOCD_SIZE - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries: [], errors: ['The file is not a zip'] };

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    return { entries: [], errors: ['The zip is a zip64 archive, which the page cannot read'] };
  }

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      errors.push('The central directory of the zip is damaged');
      break;
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue;
    if (flags & 1) {
      errors.push(`${name} is encrypted`);
      continue;
    }
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      errors.push(`${name} is a zip64 entry, which the page cannot read`);
      continue;
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      errors.push(`${name} is damaged`);
      continue;
    }
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressedSize);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) {
      try {
        entries.push({ name, data: await inflateRaw(raw) });
      } catch {
        errors.push(`${name} is damaged`);
      }
    } else errors.push(`${name} uses compression method ${method}, which the page cannot read`);
  }
  return { entries, errors };
}

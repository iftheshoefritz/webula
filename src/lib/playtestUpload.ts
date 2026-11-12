// The upload of the playtest cards (#1613), the parts with no network and no DOM: the preview the
// owner sees before Publish, and the batches the images go in. The admin cards route reads the
// `ImageFile`s of the TSV with the same function, so the browser and the server agree on them.

import { normalisePlaytestTsv, type PlaytestResult } from './playtestCards';
import { isPlaytestImageFile } from './playtestImageFile';
import type { ZipContents } from './zipReader';

// A Vercel function takes at most a 4.5 MB request body. A batch of images stays well under it.
export const IMAGE_BATCH_MAX_CHARS = 3_000_000;
// The most images one request of the images route takes.
export const IMAGE_BATCH_MAX_IMAGES = 100;

/**
 * The rows of a TSV that `normalisePlaytestTsv` made: every field in double quotes, an inner quote
 * doubled, and no tab or line break inside a field.
 */
export function readNormalisedTsv(tsv: string): Record<string, string>[] {
  const unquote = (field: string) =>
    field.startsWith('"') && field.endsWith('"') && field.length >= 2 ? field.slice(1, -1).replace(/""/g, '"') : field;
  const [header, ...lines] = tsv.split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line !== '');
  if (!header) return [];
  const columns = header.split('\t').map(unquote);
  return lines.map((line) => {
    const values = line.split('\t').map(unquote);
    return Object.fromEntries(columns.map((column, i) => [column, values[i] ?? '']));
  });
}

/** The `ImageFile`s a normalised TSV names, the back of a two-sided card too, each once. */
export function playtestImageFiles(normalisedTsv: string): string[] {
  const names = new Set<string>();
  for (const row of readNormalisedTsv(normalisedTsv)) {
    // A double-sided card names two images, the front first (#765).
    for (const name of (row.ImageFile ?? '').split(',')) {
      if (name.trim()) names.add(name.trim());
    }
  }
  return [...names];
}

/** The number of characters of the base64 of `bytes` bytes. */
export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

// The JSON of one image in a batch: its name, its base64 and the quotes and keys around them.
const imageJsonLength = (imageFile: string, bytes: number) => imageFile.length + base64Length(bytes) + 40;

export interface ZipImages {
  /** The JPEGs of the zip, by `ImageFile`: the file name without its folder and `.jpg`. */
  images: Map<string, Uint8Array>;
  errors: string[];
}

/** The JPEGs of the zip by `ImageFile`. Folders, macOS metadata and other files are left out. */
export function zipImages(zip: ZipContents): ZipImages {
  const images = new Map<string, Uint8Array>();
  const errors = [...zip.errors];
  for (const { name, data } of zip.entries) {
    if (name.startsWith('__MACOSX/')) continue;
    const base = name.slice(name.lastIndexOf('/') + 1);
    if (base.startsWith('.') || !/\.jpe?g$/i.test(base)) continue;
    const imageFile = base.replace(/\.jpe?g$/i, '');
    if (images.has(imageFile)) errors.push(`The zip holds ${imageFile}.jpg more than once`);
    else images.set(imageFile, data);
  }
  return { images, errors };
}

export interface PlaytestPreview {
  result: PlaytestResult;
  /** The number of cards of each type, the most first. */
  byType: { type: string; count: number }[];
  /** The errors of the TSV and of the zip; any one disables Publish. */
  errors: string[];
  warnings: string[];
  /** The `ImageFile`s with no image in the zip. */
  missingImages: string[];
  /** The images of the zip that no card names; Publish does not send them. */
  unusedImages: string[];
  /** The `ImageFile`s to send, in TSV order. */
  imagesToSend: string[];
  canPublish: boolean;
}

const problemText = ({ line, card, message }: { line: number; card?: string; message: string }) =>
  `Line ${line}${card ? ` (${card})` : ''}: ${message}`;

export function playtestPreview(tsv: string, zip: ZipImages, realNames: Set<string>): PlaytestPreview {
  const result = normalisePlaytestTsv(tsv, realNames);
  const errors = [...result.errors.map(problemText), ...zip.errors];
  const warnings = result.warnings.map(problemText);

  const counts = new Map<string, number>();
  for (const row of readNormalisedTsv(result.tsv)) {
    const type = (row.Type ?? '').toLowerCase();
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const byType = [...counts].map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  const named = playtestImageFiles(result.tsv);
  const missingImages = named.filter((name) => !zip.images.has(name));
  const unusedImages = [...zip.images.keys()].filter((name) => !named.includes(name)).sort();
  const imagesToSend = named.filter((name) => zip.images.has(name));

  for (const name of named) {
    if (!isPlaytestImageFile(name)) errors.push(`The ImageFile ${name} may hold only letters, digits, _, - and .`);
  }
  for (const name of imagesToSend) {
    if (imageJsonLength(name, zip.images.get(name)!.length) > IMAGE_BATCH_MAX_CHARS) {
      errors.push(`The image ${name}.jpg is too large to send; keep each image under 2 MB`);
    }
  }
  if (missingImages.length > 0) errors.push(`${missingImages.length} card image(s) are not in the zip`);
  if (result.cards === 0 && result.errors.length === 0) errors.push('The TSV holds no cards');

  return { result, byType, errors, warnings, missingImages, unusedImages, imagesToSend, canPublish: errors.length === 0 };
}

/** The images in batches whose JSON stays under `maxChars`, at most `maxImages` each. */
export function imageBatches(
  images: { imageFile: string; bytes: number }[],
  maxChars = IMAGE_BATCH_MAX_CHARS,
  maxImages = IMAGE_BATCH_MAX_IMAGES,
): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = 0;
  for (const { imageFile, bytes } of images) {
    const length = imageJsonLength(imageFile, bytes);
    if (batch.length > 0 && (size + length > maxChars || batch.length >= maxImages)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(imageFile);
    size += length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

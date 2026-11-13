// The upload of the playtest cards (#1613), the parts with no network and no DOM: the preview the
// owner sees before Publish, and the batches the images go in. The admin cards route reads the
// `ImageFile`s of the TSV with the same function, so the browser and the server agree on them.

import { SETS } from './missionRequirements';
import { normalisePlaytestTsv, PLAYTEST_PREFIX, playtestDeckKey, type OtherPlaytestSets, type PlaytestResult } from './playtestCards';
import { isPlaytestImageFile, isPlaytestSetName, playtestSetKey } from './playtestImageFile';
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

/** The single valid `Set` of a normalised TSV, or the error that keeps it from being one (#1644). */
export function setNameOfTsv(normalisedTsv: string): { name: string } | { error: string } {
  const names = [...new Set(readNormalisedTsv(normalisedTsv).map((row) => (row.Set ?? '').trim()))];
  if (names.length === 0 || (names.length === 1 && names[0] === '')) return { error: 'The rows name no Set' };
  if (names.length > 1) return { error: `The rows name more than one Set: ${names.map((n) => n || '(none)').join(', ')}` };
  if (!isPlaytestSetName(names[0])) {
    return { error: `The Set ${names[0]} may hold only letters, digits, _, - and ., and must start with a letter or a digit` };
  }
  return { name: names[0] };
}

/** A set in testing as the upload checks see it: its name and the cards a deck could name. */
export interface PlaytestSetCards {
  name: string;
  /** The `Name` of each card. */
  cardNames: string[];
  /** The `CollectorsInfo` of each card, as the owner wrote it, with no `PT-`. */
  collectorsInfo: string[];
}

/** The names and the `CollectorsInfo`s of the cards of a stored, normalised TSV. */
export function playtestSetCardsOf(name: string, normalisedTsv: string): PlaytestSetCards {
  const rows = readNormalisedTsv(normalisedTsv);
  return {
    name,
    cardNames: rows.map((row) => row.Name ?? '').filter(Boolean),
    collectorsInfo: rows
      .map((row) => (row.CollectorsInfo ?? '').replace(new RegExp(`^${PLAYTEST_PREFIX}`), ''))
      .filter(Boolean),
  };
}

export interface PlaytestSetCheck {
  /** The `Set` of the rows, when they name exactly one valid set. */
  name: string | null;
  /** The key of the set in testing the upload replaces, or null for a new set. */
  replace: string | null;
  errors: string[];
}

/**
 * The checks of the set of an upload (#1644): the rows name exactly one valid set, which is not a
 * real set nor `playtest`; a new set is not in testing yet; a replace names a set in testing, and the
 * new name is no other set in testing. `replace` is the name of the set the upload replaces, null for
 * a new set, or undefined for the set of the same name when one is in testing.
 */
export function checkPlaytestSet(
  normalisedTsv: string,
  setsInTesting: PlaytestSetCards[],
  replace?: string | null,
): PlaytestSetCheck {
  const inTesting = new Map(setsInTesting.map((set) => [playtestSetKey(set.name), set.name]));
  const found = setNameOfTsv(normalisedTsv);
  if ('error' in found) return { name: null, replace: null, errors: [found.error] };
  const { name } = found;
  const key = playtestSetKey(name);
  const errors: string[] = [];
  if (key === 'playtest' || SETS.some((set) => set.value.toLowerCase() === key)) {
    errors.push(`The Set ${name} is the name of a real set`);
  }
  const replaceKey = replace === undefined ? (inTesting.has(key) ? key : null) : replace === null ? null : playtestSetKey(replace);
  if (replaceKey === null) {
    if (inTesting.has(key)) errors.push(`The set ${inTesting.get(key)} is already in testing: replace it, or name the new set otherwise`);
  } else {
    if (!inTesting.has(replaceKey)) errors.push(`The set ${replace} is not in testing`);
    else if (replaceKey !== key && inTesting.has(key)) errors.push(`The set ${inTesting.get(key)} is already in testing`);
  }
  return { name, replace: replaceKey, errors };
}

/** The cards of the sets in testing other than the set of the upload and the set it replaces. */
export function otherPlaytestSets(setsInTesting: PlaytestSetCards[], exclude: (string | null)[]): OtherPlaytestSets {
  const skip = new Set(exclude.filter((key): key is string => key !== null));
  const others: OtherPlaytestSets = { names: new Map(), keys: new Map() };
  for (const set of setsInTesting) {
    if (skip.has(playtestSetKey(set.name))) continue;
    set.cardNames.forEach((name) => others.names.set(name, set.name));
    set.collectorsInfo.forEach((info) => others.keys.set(playtestDeckKey(info), set.name));
  }
  return others;
}

/**
 * The normalised TSV of an upload with every check of #1644: the TSV itself, the set, and no card
 * name or `CollectorsInfo` of another set in testing. The admin cards route and the preview share it.
 */
export function checkPlaytestUpload(
  text: string,
  realNames: Set<string>,
  setsInTesting: PlaytestSetCards[],
  replace?: string | null,
): { result: PlaytestResult; set: PlaytestSetCheck } {
  const first = normalisePlaytestTsv(text, realNames);
  if (first.errors.length > 0 || first.cards === 0) return { result: first, set: { name: null, replace: null, errors: [] } };
  const set = checkPlaytestSet(first.tsv, setsInTesting, replace);
  if (set.name === null) return { result: first, set };
  const others = otherPlaytestSets(setsInTesting, [playtestSetKey(set.name), set.replace]);
  return { result: normalisePlaytestTsv(text, realNames, others), set };
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
  /** The set of the rows, and the set in testing it replaces. */
  set: PlaytestSetCheck;
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

export function playtestPreview(
  tsv: string,
  zip: ZipImages,
  realNames: Set<string>,
  setsInTesting: PlaytestSetCards[] = [],
  replace?: string | null,
): PlaytestPreview {
  const { result, set } = checkPlaytestUpload(tsv, realNames, setsInTesting, replace);
  const errors = [...result.errors.map(problemText), ...set.errors, ...zip.errors];
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

  return { result, set, byType, errors, warnings, missingImages, unusedImages, imagesToSend, canPublish: errors.length === 0 };
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

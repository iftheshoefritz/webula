// The rule for an `ImageFile` of a playtest card (#1612), apart from the store so the upload page
// (#1613) can check a name in the browser without the Redis client in its bundle.

// An `ImageFile` the store could hold: letters, digits, `_`, `-` and `.`, and no `..`.
const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

/** An `ImageFile` the store could hold. Anything else is not there, and is not looked up. */
export function isPlaytestImageFile(imageFile: string): boolean {
  return IMAGE_FILE_PATTERN.test(imageFile) && !imageFile.includes('..');
}

// The name of a playtest set (#1644), the `Set` column of its TSV: letters, digits, `_`, `-` and
// `.`, starting with a letter or a digit, so it can go into a Redis key and a URL path as it is.
const SET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function isPlaytestSetName(name: string): boolean {
  return SET_NAME_PATTERN.test(name) && !name.includes('..');
}

/** The key of a set in the store, the URL and the `set` of its rows: the name, lowercased. */
export function playtestSetKey(name: string): string {
  return name.toLowerCase();
}

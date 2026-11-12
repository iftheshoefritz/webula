// The rule for an `ImageFile` of a playtest card (#1612), apart from the store so the upload page
// (#1613) can check a name in the browser without the Redis client in its bundle.

// An `ImageFile` the store could hold: letters, digits, `_`, `-` and `.`, and no `..`.
const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

/** An `ImageFile` the store could hold. Anything else is not there, and is not looked up. */
export function isPlaytestImageFile(imageFile: string): boolean {
  return IMAGE_FILE_PATTERN.test(imageFile) && !imageFile.includes('..');
}

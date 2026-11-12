import { base64Length, bytesToBase64, imageBatches, IMAGE_BATCH_MAX_CHARS, zipImages } from '../../lib/playtestUpload';

describe('imageBatches', () => {
  it('sends 70 images of 300 KB in batches whose JSON stays under the limit', () => {
    const images = Array.from({ length: 70 }, (_, i) => ({ imageFile: `PT${9300 + i}`, bytes: 300_000 }));
    const batches = imageBatches(images);
    expect(batches.flat()).toEqual(images.map((i) => i.imageFile));
    for (const batch of batches) {
      expect(batch.length * (base64Length(300_000) + 50)).toBeLessThanOrEqual(IMAGE_BATCH_MAX_CHARS);
    }
    expect(batches.length).toBeGreaterThan(1);
  });

  it('caps the number of images in a batch', () => {
    const images = Array.from({ length: 5 }, (_, i) => ({ imageFile: `X${i}`, bytes: 10 }));
    expect(imageBatches(images, 1_000_000, 2)).toEqual([['X0', 'X1'], ['X2', 'X3'], ['X4']]);
  });
});

describe('zipImages', () => {
  it('keys the JPEGs by file name and leaves out folders, macOS metadata and other files', () => {
    const data = new Uint8Array([1]);
    const { images, errors } = zipImages({
      entries: [
        { name: 'a/PT1.jpg', data },
        { name: '__MACOSX/a/._PT1.jpg', data },
        { name: 'a/.hidden.jpg', data },
        { name: 'readme.txt', data },
        { name: 'b/PT1.JPG', data },
      ],
      errors: [],
    });
    expect([...images.keys()]).toEqual(['PT1']);
    expect(errors).toEqual(['The zip holds PT1.jpg more than once']);
  });
});

describe('bytesToBase64', () => {
  it('encodes bytes', () => {
    expect(bytesToBase64(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('/9j/');
  });
});

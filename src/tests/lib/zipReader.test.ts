/**
 * @jest-environment node
 */

import { readZip } from '../../lib/zipReader';
import { makeZip } from '../fixtures/makeZip';

const text = (data: Uint8Array) => Buffer.from(data).toString();

describe('readZip', () => {
  it('reads a stored and a deflated file, and leaves folders out', async () => {
    const zip = makeZip([
      { name: 'images/', data: '' },
      { name: 'images/PT001.jpg', data: 'stored bytes' },
      { name: 'images/PT002.jpg', data: 'deflated bytes '.repeat(20), deflate: true },
    ]);
    const { entries, errors } = await readZip(zip);
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(['images/PT001.jpg', 'images/PT002.jpg']);
    expect(text(entries[0].data)).toBe('stored bytes');
    expect(text(entries[1].data)).toBe('deflated bytes '.repeat(20));
  });

  it('reports a file that is not a zip', async () => {
    expect(await readZip(new TextEncoder().encode('not a zip at all, just text'))).toEqual({
      entries: [],
      errors: ['The file is not a zip'],
    });
  });

  it('reports an encrypted entry and an unknown method, and keeps the rest', async () => {
    const zip = makeZip([
      { name: 'A.jpg', data: 'a', flags: 1 },
      { name: 'B.jpg', data: 'b', method: 12 },
      { name: 'C.jpg', data: 'c' },
    ]);
    const { entries, errors } = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['C.jpg']);
    expect(errors).toEqual(['A.jpg is encrypted', 'B.jpg uses compression method 12, which the page cannot read']);
  });

  it('reports a zip64 archive', async () => {
    const zip = makeZip([{ name: 'A.jpg', data: 'a' }]);
    const view = new DataView(zip.buffer);
    view.setUint32(zip.length - 22 + 16, 0xffffffff, true);
    expect((await readZip(zip)).errors).toEqual(['The zip is a zip64 archive, which the page cannot read']);
  });
});

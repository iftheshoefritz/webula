import fs from 'fs';
import path from 'path';

// The providers and the table are not needed to read the exports.
jest.mock('../../app/providers', () => ({ Providers: ({ children }: { children: unknown }) => children }));
jest.mock('../../app/decks/practice/PracticeTable', () => () => null);

import { viewport as rootViewport } from '../../app/layout';
import { viewport as practiceViewport } from '../../app/decks/practice/page';

// Issue #1383: only the practice route covers the screen, `viewport-fit=cover`.
describe('viewport exports (#1383)', () => {
  it('gives the practice route viewportFit cover', () => {
    expect(practiceViewport).toEqual({ width: 'device-width', initialScale: 1, viewportFit: 'cover' });
  });

  it('gives the root layout no viewportFit', () => {
    expect(rootViewport).toEqual({ width: 'device-width', initialScale: 1 });
    expect(rootViewport).not.toHaveProperty('viewportFit');
  });

  it('leaves no hand-written viewport tag in the root layout', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../app/layout.tsx'), 'utf8');
    expect(source).not.toMatch(/<meta\s+name="viewport"/);
  });
});

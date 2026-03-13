import '@testing-library/jest-dom'

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
}))

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Provide a minimal fetch stub for tests (jsdom does not include fetch).
// Returns a representative sample of filter options so tests that interact
// with dynamic typeaheads (affiliations, icons, keywords, sets, species) work.
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        sets: ['1e', '2e', 'ac', 'aoy', 'r2'],
        species: ['bajoran', 'borg', 'cardassian', 'changeling', 'human', 'vulcan'],
        keywords: [
          'admiral',
          'artifact',
          'bajoran resistance',
          'cadet',
          'drone',
          'founder',
          'shape-shifter',
        ],
        affiliations: ['bajoran', 'borg', 'cardassian', 'dominion', 'federation', 'ferengi', 'klingon', 'non-aligned', 'romulan', 'starfleet', 'vidiian'],
        icons: ['au', 'cmd', 'ds9', 'e', 'fut', 'maq', 'pa', 'stf', 'tn', 'tng', 'tos', 'voy'],
      }),
  } as Response)
)

import { queryFields, track } from '../../lib/analytics';
import { reduceEventUrls, reduceUrl } from '../../lib/analyticsUrls';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { capture: jest.fn() },
}));

const posthog = jest.requireMock('posthog-js').default;

describe('queryFields (#1408)', () => {
  it('names the fields of a query, abbreviations made full, and a bare text term', () => {
    expect(queryFields('a:federation sk:medical picard')).toEqual({ fields: ['affiliation', 'skills'], text: true });
  });

  it('never returns a value of the query', () => {
    expect(JSON.stringify(queryFields('n:"jean-luc picard" cost:2-4 -k:borg secret'))).not.toMatch(/picard|borg|secret|2|4/);
  });

  it('names an excluded field and a numeric field', () => {
    expect(queryFields('-k:borg cost:2-4')).toEqual({ fields: ['cost', 'keywords'], text: false });
  });

  it('gives a query of bare text no fields', () => {
    expect(queryFields('picard')).toEqual({ fields: [], text: true });
    expect(queryFields('')).toEqual({ fields: [], text: false });
  });
});

describe('reduceUrl (#1408)', () => {
  it('keeps the origin, the path and the parameter names, and drops the values and the hash', () => {
    expect(reduceUrl('https://webula.app/decks?share=abc123&driveFileId=xyz#top')).toBe('https://webula.app/decks?share&driveFileId');
  });

  it('reduces a path with no origin', () => {
    expect(reduceUrl('/decks?share=abc123')).toBe('/decks?share');
    expect(reduceUrl('/')).toBe('/');
  });
});

describe('reduceEventUrls (#1408)', () => {
  it('reduces every URL property of an event and leaves the rest', () => {
    const event = reduceEventUrls({
      properties: {
        $current_url: 'https://webula.app/decks?share=abc',
        $referrer: 'https://www.google.com/search?q=my+name',
        $pathname: '/decks',
        lines: 3,
      },
      $set_once: { $initial_current_url: 'https://webula.app/?q=x' },
    });
    expect(event.properties).toEqual({
      $current_url: 'https://webula.app/decks?share',
      $referrer: 'https://www.google.com/search?q',
      $pathname: '/decks',
      lines: 3,
    });
    expect(event.$set_once).toEqual({ $initial_current_url: 'https://webula.app/?q' });
  });

  it('passes a dropped event on', () => {
    expect(reduceEventUrls(null)).toBeNull();
  });
});

describe('track', () => {
  beforeEach(() => posthog.capture.mockClear());

  it('captures the event with its properties', () => {
    track('deckBuilder.lackeyExport.finish', { bytes: 12 });
    expect(posthog.capture).toHaveBeenCalledWith('deckBuilder.lackeyExport.finish', { bytes: 12 });
  });

  it('captures an event that has no properties with the name alone', () => {
    track('deckBuilder.lackeyExport.start');
    expect(posthog.capture).toHaveBeenCalledWith('deckBuilder.lackeyExport.start');
  });

  it('takes no free text where a property is a field name (a yarn typecheck check)', () => {
    // @ts-expect-error a typed string is not a QueryField
    track('deckBuilder.setFiltered', { fields: ['picard'], text: false, results: 0 });
    // @ts-expect-error an event that has no properties takes none
    track('deckBuilder.lackeyExport.start', { q: 'picard' });
    // @ts-expect-error an unknown event
    track('deckBuilder.search', { q: 'picard' });
    expect(posthog.capture).toHaveBeenCalledTimes(3);
  });
});

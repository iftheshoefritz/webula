// The URL reduction of the no-consent mode (#1408), with no import, so the server's
// `onRequestError` uses it too.

// A URL reduced to its origin, its path and the names of its query parameters, with no values and
// no hash: `/decks?share=abc` gives `/decks?share`. The no-consent mode sends no parameter value,
// such as a Drive file id or a share id, and no search text of a referrer.
export function reduceUrl(url: string): string {
  // A path such as the `$current_url` of `PostHogPageView` has no origin, and keeps none.
  const base = 'http://relative.invalid';
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return url;
  }
  const origin = parsed.origin === base ? '' : parsed.origin;
  const names = Array.from(new Set(Array.from(parsed.searchParams.keys())));
  return `${origin}${parsed.pathname}${names.length ? `?${names.join('&')}` : ''}`;
}

const isUrlProperty = (key: string) => /(url|referrer)$/.test(key);

function reduceUrlProperties(properties: Record<string, unknown> | undefined): void {
  if (!properties) return;
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && isUrlProperty(key)) properties[key] = reduceUrl(value);
  }
}

// The `before_send` of the no-consent config: every URL property of every event, a page view and
// an exception too, keeps only its origin, path and parameter names. It drops the `title` that
// posthog-js adds to a page view, the `document.title`, because the title of a search page holds
// the query and that of the deck builder the deck's title (follow-up for #1413).
export function reduceEventUrls<T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | null>(event: T): T {
  if (!event) return event;
  reduceUrlProperties(event.properties);
  if (event.properties) delete event.properties.title;
  reduceUrlProperties(event.$set);
  reduceUrlProperties(event.$set_once);
  return event;
}

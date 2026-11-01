// The reasons `/api/share` gives for a failure (#1441), and the messages the deck builder
// shows for them. The route puts a `code` beside `error` in every error answer, so the
// client does not have to guess the cause from the status.

export type ShareErrorCode =
  | 'bad_request'
  | 'upstream_unreachable'
  | 'upstream_busy'
  | 'not_found'
  | 'upstream_error';

/** The code for a non-OK answer of dpaste. */
export function upstreamErrorCode(status: number, notFound: boolean): ShareErrorCode {
  if (status === 429 || status >= 500) return 'upstream_busy';
  if (notFound && status === 404) return 'not_found';
  return 'upstream_error';
}

/** A failure on the client: `offline` when the request never got an answer. */
export type ShareFailureCode = ShareErrorCode | 'offline' | 'other';

export interface ShareFailure {
  code: ShareFailureCode;
  status: number | null;
}

export class ShareRequestError extends Error {
  readonly failure: ShareFailure;

  constructor(failure: ShareFailure) {
    super(`Share request failed: ${failure.code}`);
    this.name = 'ShareRequestError';
    this.failure = failure;
  }
}

const KNOWN_CODES: readonly ShareErrorCode[] = [
  'bad_request',
  'upstream_unreachable',
  'upstream_busy',
  'not_found',
  'upstream_error',
];

/** Reads the failure from a non-OK answer of `/api/share`. */
export async function shareFailureFromResponse(res: Response): Promise<ShareFailure> {
  let code: ShareFailureCode = 'other';
  try {
    const body = await res.json();
    if (KNOWN_CODES.includes(body?.code)) code = body.code;
  } catch {
    // No JSON body: the status alone names the failure.
  }
  return { code, status: res.status };
}

/** The failure of a `fetch` that threw, or any other error before an answer. */
export function shareFailureFromError(error: unknown): ShareFailure {
  if (error instanceof ShareRequestError) return error.failure;
  return { code: 'offline', status: null };
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The message for a failed "Copy share link". */
export function shareCreateMessage(failure: ShareFailure): string {
  switch (failure.code) {
    case 'offline':
      return 'You are offline. Connect and try again.';
    case 'upstream_unreachable':
      return 'The share service cannot be reached. Try again later, or copy the deck as text.';
    case 'upstream_busy':
      return 'The share service is busy. Try again in a minute.';
    default:
      return failure.status === null ? 'Share failed.' : `Share failed (HTTP ${failure.status}).`;
  }
}

/** The message for a `?share=` link that did not load. */
export function shareLoadMessage(failure: ShareFailure): string {
  switch (failure.code) {
    case 'offline':
      return 'You are offline, so the shared deck cannot be loaded. Connect and reload the page.';
    case 'not_found':
      return 'This shared deck has expired or does not exist.';
    case 'upstream_unreachable':
      return 'The share service cannot be reached, so the shared deck cannot be loaded. Try again later.';
    case 'upstream_busy':
      return 'The share service is busy, so the shared deck cannot be loaded. Try again in a minute.';
    default:
      return failure.status === null
        ? 'Failed to load shared deck.'
        : `Failed to load shared deck (HTTP ${failure.status}).`;
  }
}

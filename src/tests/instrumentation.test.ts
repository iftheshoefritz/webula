/**
 * @jest-environment node
 */

const captureExceptionImmediate = jest.fn().mockResolvedValue(undefined);
const getPostHogServerMock = jest.fn();

jest.mock('../lib/posthogServer', () => ({
  getPostHogServer: getPostHogServerMock,
  __resetPostHogServerForTests: jest.fn(),
}));

import type { Instrumentation } from 'next';
import { onRequestError } from '../instrumentation';

type ErrorRequest = Parameters<Instrumentation.onRequestError>[1];
type ErrorContext = Parameters<Instrumentation.onRequestError>[2];

const baseRequest: ErrorRequest = {
  path: '/api/test-error',
  method: 'GET',
  headers: {},
};

const baseContext: ErrorContext = {
  routerKind: 'App Router',
  routePath: '/api/test-error',
  routeType: 'route',
  revalidateReason: undefined,
};

describe('instrumentation onRequestError', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_RUNTIME = 'nodejs';
    getPostHogServerMock.mockReturnValue({ captureExceptionImmediate });
  });

  afterAll(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
  });

  it('forwards errors from the /api/test-error route to PostHog', async () => {
    const err = new Error('Intentional server-side test error');

    await onRequestError(err, baseRequest, baseContext);

    expect(captureExceptionImmediate).toHaveBeenCalledTimes(1);
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      err,
      undefined,
      expect.objectContaining({
        $current_url: '/api/test-error',
        $request_method: 'GET',
        route: '/api/test-error',
        routeType: 'route',
        routerKind: 'App Router',
      })
    );
  });

  it('extracts a distinct_id from the PostHog browser cookie when present', async () => {
    const cookieValue = encodeURIComponent(
      JSON.stringify({ distinct_id: 'user_abc_123' })
    );
    const request: ErrorRequest = {
      ...baseRequest,
      headers: {
        cookie: `foo=bar; ph_phc_testproject_posthog=${cookieValue}; baz=qux`,
      },
    };

    await onRequestError(new Error('boom'), request, baseContext);

    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      expect.any(Error),
      'user_abc_123',
      expect.any(Object)
    );
  });

  it('still captures the error when the PostHog cookie is malformed', async () => {
    const request: ErrorRequest = {
      ...baseRequest,
      headers: {
        cookie: 'ph_phc_testproject_posthog=not-valid-json',
      },
    };

    await onRequestError(new Error('boom'), request, baseContext);

    expect(captureExceptionImmediate).toHaveBeenCalledTimes(1);
    expect(captureExceptionImmediate).toHaveBeenCalledWith(
      expect.any(Error),
      undefined,
      expect.any(Object)
    );
  });

  it('does nothing when running in the edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';

    await onRequestError(new Error('boom'), baseRequest, baseContext);

    expect(getPostHogServerMock).not.toHaveBeenCalled();
    expect(captureExceptionImmediate).not.toHaveBeenCalled();
  });

  it('does nothing when PostHog is not configured (no key)', async () => {
    getPostHogServerMock.mockReturnValue(null);

    await onRequestError(new Error('boom'), baseRequest, baseContext);

    expect(captureExceptionImmediate).not.toHaveBeenCalled();
  });
});

/**
 * @jest-environment node
 */

jest.mock('posthog-node', () => {
  const mockCaptureExceptionImmediate = jest.fn().mockResolvedValue(undefined);
  const MockPostHog = jest.fn().mockImplementation(() => ({
    captureExceptionImmediate: mockCaptureExceptionImmediate,
  }));
  // Attach spies to the constructor so tests can access them
  (MockPostHog as any).__mockCaptureExceptionImmediate = mockCaptureExceptionImmediate;
  return { PostHog: MockPostHog };
});

import { PostHog } from 'posthog-node';
import { onRequestError } from '../instrumentation';

const MockPostHog = PostHog as jest.MockedClass<typeof PostHog>;
const getMockInstance = () => MockPostHog.mock.results[0]?.value as {
  captureExceptionImmediate: jest.Mock;
};

const makeError = (message: string): { digest: string } & Error => {
  const err = new Error(message) as { digest: string } & Error;
  err.digest = 'test-digest';
  return err;
};

const makeContext = (overrides = {}) => ({
  routerKind: 'App Router',
  routePath: '/api/test-error',
  routeType: 'route',
  ...overrides,
});

describe('onRequestError', () => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
  });

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime;
    process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
    process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost;
  });

  describe('when NEXT_RUNTIME is nodejs', () => {
    beforeEach(() => {
      process.env.NEXT_RUNTIME = 'nodejs';
    });

    it('constructs PostHog with the correct key and host', async () => {
      const err = makeError('test error');
      await onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).toHaveBeenCalledWith('phc_test_key', {
        host: 'https://eu.i.posthog.com',
      });
    });

    it('calls captureExceptionImmediate with the error and route context', async () => {
      const err = makeError('test error');
      const context = makeContext({ routePath: '/api/some-route', routeType: 'route' });
      await onRequestError(err, new Request('http://localhost/api/some-route'), context);

      const instance = getMockInstance();
      expect(instance.captureExceptionImmediate).toHaveBeenCalledWith(err, undefined, {
        route: '/api/some-route',
        routeType: 'route',
      });
    });

    it('awaits captureExceptionImmediate so the event is sent before the hook returns', async () => {
      const err = makeError('test error');
      await onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      const instance = getMockInstance();
      expect(instance.captureExceptionImmediate).toHaveBeenCalled();
    });
  });

  describe('when NEXT_RUNTIME is not nodejs', () => {
    it('returns early and does not call captureExceptionImmediate on edge runtime', async () => {
      process.env.NEXT_RUNTIME = 'edge';
      const err = makeError('test error');
      await onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).not.toHaveBeenCalled();
    });

    it('returns early and does not call captureExceptionImmediate when runtime is undefined', async () => {
      delete process.env.NEXT_RUNTIME;
      const err = makeError('test error');
      await onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).not.toHaveBeenCalled();
    });
  });

  describe('when NEXT_PUBLIC_POSTHOG_KEY is undefined', () => {
    it('returns early without constructing PostHog (graceful no-op in local dev)', async () => {
      process.env.NEXT_RUNTIME = 'nodejs';
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const err = makeError('test error');

      await onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).not.toHaveBeenCalled();
    });
  });
});

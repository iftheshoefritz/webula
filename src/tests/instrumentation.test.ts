/**
 * @jest-environment node
 */

jest.mock('posthog-node', () => {
  const mockCaptureException = jest.fn();
  const mockShutdown = jest.fn().mockResolvedValue(undefined);
  const MockPostHog = jest.fn().mockImplementation(() => ({
    captureException: mockCaptureException,
    shutdown: mockShutdown,
  }));
  // Attach spies to the constructor so tests can access them
  (MockPostHog as any).__mockCaptureException = mockCaptureException;
  (MockPostHog as any).__mockShutdown = mockShutdown;
  return { PostHog: MockPostHog };
});

import { PostHog } from 'posthog-node';
import { onRequestError } from '../instrumentation';

const MockPostHog = PostHog as jest.MockedClass<typeof PostHog>;
const getMockInstance = () => MockPostHog.mock.results[0]?.value as {
  captureException: jest.Mock;
  shutdown: jest.Mock;
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

    it('constructs PostHog with the correct key and host', () => {
      const err = makeError('test error');
      onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).toHaveBeenCalledWith('phc_test_key', {
        host: 'https://eu.i.posthog.com',
      });
    });

    it('calls captureException with the error and route context', () => {
      const err = makeError('test error');
      const context = makeContext({ routePath: '/api/some-route', routeType: 'route' });
      onRequestError(err, new Request('http://localhost/api/some-route'), context);

      const instance = getMockInstance();
      expect(instance.captureException).toHaveBeenCalledWith(err, undefined, {
        route: '/api/some-route',
        routeType: 'route',
      });
    });

    it('returns client.shutdown() to flush events before function exits', () => {
      const err = makeError('test error');
      const result = onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      const instance = getMockInstance();
      expect(instance.shutdown).toHaveBeenCalled();
      expect(result).toBe(instance.shutdown.mock.results[0].value);
    });
  });

  describe('when NEXT_RUNTIME is not nodejs', () => {
    it('returns early and does not call captureException on edge runtime', () => {
      process.env.NEXT_RUNTIME = 'edge';
      const err = makeError('test error');
      onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).not.toHaveBeenCalled();
    });

    it('returns early and does not call captureException when runtime is undefined', () => {
      delete process.env.NEXT_RUNTIME;
      const err = makeError('test error');
      onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());

      expect(MockPostHog).not.toHaveBeenCalled();
    });
  });

  describe('when NEXT_PUBLIC_POSTHOG_KEY is undefined', () => {
    it('does not throw (graceful no-op since PostHog is disabled in local dev)', () => {
      process.env.NEXT_RUNTIME = 'nodejs';
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const err = makeError('test error');

      expect(() => {
        onRequestError(err, new Request('http://localhost/api/test-error'), makeContext());
      }).not.toThrow();
    });
  });
});

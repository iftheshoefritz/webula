import { render } from '@testing-library/react';
import { Providers } from '../../app/providers';

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { init: jest.fn(), capture: jest.fn(), captureException: jest.fn() },
}));
jest.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const posthog = jest.requireMock('posthog-js').default;

// #1408: with no consent PostHog runs in its cookieless mode, which stores nothing on the device.
describe('PostHogInit', () => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    posthog.init.mockClear();
    localStorage.clear();
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  });

  const initConfig = () => {
    render(<Providers><div /></Providers>);
    expect(posthog.init).toHaveBeenCalledTimes(1);
    return posthog.init.mock.calls[0][1];
  };

  it.each([
    ['no answer', null],
    ['a decline', 'false'],
  ])('runs the cookieless config after %s', (_label, consent) => {
    if (consent !== null) localStorage.setItem('analytics_consent', consent);
    expect(initConfig()).toEqual(expect.objectContaining({
      cookieless_mode: 'always',
      person_profiles: 'never',
      autocapture: false,
      disable_session_recording: true,
      before_send: expect.any(Function),
    }));
  });

  it('runs the full config, not cookieless, after an accept', () => {
    localStorage.setItem('analytics_consent', 'true');
    const config = initConfig();
    expect(config.cookieless_mode).toBeUndefined();
    expect(config.before_send).toBeUndefined();
  });
});

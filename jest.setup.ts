import '@testing-library/jest-dom'

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    capture: jest.fn(),
    init: jest.fn(),
  },
}))

jest.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}))

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

import { configure } from '@testing-library/react'
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

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

// Role queries (getByRole and the others) check that each element is not hidden. The check calls
// getComputedStyle on the element and on its ancestors, and jsdom makes that slow. On a large
// component such as DeckBuilderClient one getAllByRole('button') takes about 0.7 s. Under a full
// parallel run those tests go past the 5 s timeout. The jsdom tests load no CSS, so the check
// finds only the hidden attribute, inline styles, and aria-hidden.
configure({ defaultHidden: true })

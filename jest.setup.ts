import '@testing-library/jest-dom'

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
}))

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

import '@testing-library/jest-dom'

jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
}))

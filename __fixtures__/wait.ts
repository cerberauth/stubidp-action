import { jest } from '@jest/globals'

export const waitForReady =
  jest.fn<typeof import('../src/wait.js').waitForReady>()

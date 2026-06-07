import type { ChildProcess } from 'child_process'
import { jest } from '@jest/globals'

export const mockChildProcess = {
  unref: jest.fn(),
  pid: 12345
} as unknown as ChildProcess

export const spawn = jest.fn<typeof import('child_process').spawn>()
export const execFileSync =
  jest.fn<typeof import('child_process').execFileSync>()

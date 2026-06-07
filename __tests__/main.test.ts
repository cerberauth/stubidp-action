import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import {
  spawn,
  execFileSync,
  mockChildProcess
} from '../__fixtures__/child_process.js'
import * as cacheFixture from '../__fixtures__/cache.js'
import { waitForReady } from '../__fixtures__/wait.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/cache', () => cacheFixture)
jest.unstable_mockModule('child_process', () => ({ spawn, execFileSync }))
jest.unstable_mockModule('../src/wait.js', () => ({ waitForReady }))

const { run } = await import('../src/main.js')

const defaultInputs: Record<string, string> = {
  port: '8484',
  'client-id': '',
  'client-secret': '',
  'redirect-uri': '',
  'skip-prompt': 'true',
  'default-user': '',
  version: 'latest'
}

describe('main.ts', () => {
  beforeEach(() => {
    core.getInput.mockImplementation((name) => defaultInputs[name] ?? '')
    cacheFixture.restoreCache.mockResolvedValue('hit')
    spawn.mockReturnValue(mockChildProcess)
    waitForReady.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('starts stubidp and sets all outputs', async () => {
    await run()

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('stubidp'),
      [],
      expect.objectContaining({ detached: true })
    )
    expect(mockChildProcess.unref).toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith(
      'issuer',
      'http://localhost:8484'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'discovery-url',
      'http://localhost:8484/.well-known/openid-configuration'
    )
    expect(core.setOutput).toHaveBeenCalledWith('port', '8484')
    expect(core.setOutput).toHaveBeenCalledWith(
      'client-id',
      expect.stringMatching(/^[0-9a-f]{32}$/)
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'client-secret',
      expect.stringMatching(/^[0-9a-f]{32}$/)
    )
  })

  it('uses provided client-id and client-secret', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'client-id') return 'my-client'
      if (name === 'client-secret') return 'my-secret'
      return defaultInputs[name] ?? ''
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('client-id', 'my-client')
    expect(core.setOutput).toHaveBeenCalledWith('client-secret', 'my-secret')
  })

  it('uses provided issuer', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'issuer') return 'http://auth.example.com'
      return defaultInputs[name] ?? ''
    })

    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'issuer',
      'http://auth.example.com'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'discovery-url',
      'http://auth.example.com/.well-known/openid-configuration'
    )
  })

  it('passes redirect-uri env when provided', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'redirect-uri') return 'http://localhost:3000/callback'
      return defaultInputs[name] ?? ''
    })

    await run()

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('stubidp'),
      [],
      expect.objectContaining({
        env: expect.objectContaining({
          STUBIDP_REDIRECT_URI: 'http://localhost:3000/callback'
        })
      })
    )
  })

  it('polls discovery endpoint after spawn', async () => {
    await run()

    expect(waitForReady).toHaveBeenCalledWith(
      'http://localhost:8484/.well-known/openid-configuration'
    )
  })

  it('installs package on cache miss', async () => {
    cacheFixture.restoreCache.mockResolvedValue(undefined)

    await run()

    expect(execFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '--prefix']),
      expect.anything()
    )
    expect(core.saveState).toHaveBeenCalledWith('cacheMiss', 'true')
  })

  it('skips install on cache hit', async () => {
    cacheFixture.restoreCache.mockResolvedValue('stubidp-npm-linux-vlatest')

    await run()

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.saveState).toHaveBeenCalledWith('cacheMiss', 'false')
  })

  it('saves pid to state after spawn', async () => {
    await run()

    expect(core.saveState).toHaveBeenCalledWith('pid', '12345')
  })

  it('sets failed status on error', async () => {
    spawn.mockImplementation(() => {
      throw new Error('binary not found')
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('binary not found')
  })
})

import { jest } from '@jest/globals'
import type { ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
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

const { run, ENV_INPUTS } = await import('../src/main.js')

const defaultInputs: Record<string, string> = {
  port: '8484',
  'redirect-uri': 'http://localhost:3000/callback',
  'skip-prompt': 'true',
  'rate-limit-disabled': 'true',
  version: 'latest'
}

const metadata = {
  issuer: 'http://localhost:8484',
  authorization_endpoint: 'http://localhost:8484/auth',
  token_endpoint: 'http://localhost:8484/token',
  userinfo_endpoint: 'http://localhost:8484/me',
  jwks_uri: 'http://localhost:8484/jwks',
  end_session_endpoint: 'http://localhost:8484/session/end'
}

let inputs: Record<string, string>

function spawnEnv(): NodeJS.ProcessEnv {
  return (spawn.mock.calls[0][2] as { env: NodeJS.ProcessEnv }).env
}

describe('main.ts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stubidp-action-'))

  beforeEach(() => {
    process.env.RUNNER_TEMP = tmp
    inputs = { ...defaultInputs }
    core.getInput.mockImplementation((name) => inputs[name] ?? '')
    cacheFixture.restoreCache.mockResolvedValue('hit')
    execFileSync.mockReturnValue('"0.6.0"')
    spawn.mockReturnValue(mockChildProcess)
    waitForReady.mockResolvedValue(metadata)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  afterAll(() => {
    delete process.env.RUNNER_TEMP
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('starts stubidp and sets all outputs', async () => {
    await run()

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('stubidp'),
      [],
      expect.objectContaining({ detached: true })
    )
    expect(mockChildProcess.unref).toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith(
      'issuer',
      'http://localhost:8484'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'discovery-url',
      'http://localhost:8484/.well-known/openid-configuration'
    )
    expect(core.setOutput).toHaveBeenCalledWith('port', '8484')
    expect(core.setOutput).toHaveBeenCalledWith('version', '0.6.0')
    expect(core.setOutput).toHaveBeenCalledWith(
      'log-file',
      path.join(tmp, 'stubidp-8484.log')
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'client-id',
      expect.stringMatching(/^[0-9a-f]{32}$/)
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'client-secret',
      expect.stringMatching(/^[0-9a-f]{32}$/)
    )
    expect(core.setSecret).toHaveBeenCalled()
  })

  it('exposes endpoints from discovery metadata', async () => {
    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'token-endpoint',
      'http://localhost:8484/token'
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'jwks-uri',
      'http://localhost:8484/jwks'
    )
    expect(core.setOutput).toHaveBeenCalledWith('registration-endpoint', '')
  })

  it('uses provided client-id and client-secret', async () => {
    inputs['client-id'] = 'my-client'
    inputs['client-secret'] = 'my-secret'

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('client-id', 'my-client')
    expect(core.setOutput).toHaveBeenCalledWith('client-secret', 'my-secret')
    expect(spawnEnv()).toMatchObject({
      STUBIDP_CLIENT_ID: 'my-client',
      STUBIDP_CLIENT_SECRET: 'my-secret'
    })
  })

  it('does not set a client secret for public clients', async () => {
    inputs['public-client'] = 'true'
    inputs['client-secret'] = 'ignored'

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('client-secret', '')
    expect(spawnEnv().STUBIDP_CLIENT_SECRET).toBeUndefined()
    expect(spawnEnv().STUBIDP_PUBLIC_CLIENT).toBe('true')
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('client-secret')
    )
  })

  it('uses provided issuer', async () => {
    inputs.issuer = 'http://auth.example.com'

    await run()

    expect(core.setOutput).toHaveBeenCalledWith(
      'issuer',
      'http://auth.example.com'
    )
    expect(waitForReady).toHaveBeenCalledWith(
      'http://auth.example.com/.well-known/openid-configuration'
    )
  })

  it('passes redirect-uri env', async () => {
    await run()

    expect(spawnEnv().STUBIDP_REDIRECT_URI).toBe(
      'http://localhost:3000/callback'
    )
  })

  it('forwards every set input as its STUBIDP_* env variable', async () => {
    for (const input of Object.keys(ENV_INPUTS)) inputs[input] = `v-${input}`

    await run()

    const env = spawnEnv()
    for (const [input, name] of Object.entries(ENV_INPUTS)) {
      expect(env[name]).toBe(`v-${input}`)
    }
  })

  it('does not set env variables for empty inputs', async () => {
    await run()

    const env = spawnEnv()
    expect(env.STUBIDP_ACCESS_TOKEN_TTL).toBeUndefined()
    expect(env.STUBIDP_ENABLE_JAR).toBeUndefined()
    expect(env.STUBIDP_SKIP_PROMPT).toBe('true')
  })

  it('fails without redirect-uri, preset or registration', async () => {
    inputs['redirect-uri'] = ''

    await run()

    expect(spawn).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('redirect-uri')
    )
  })

  it('allows registration-only mode without a static client', async () => {
    inputs['redirect-uri'] = ''
    inputs['enable-registration'] = 'true'
    waitForReady.mockResolvedValue({
      ...metadata,
      registration_endpoint: 'http://localhost:8484/reg'
    })

    await run()

    expect(core.setFailed).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('client-id', '')
    expect(core.setOutput).toHaveBeenCalledWith('client-secret', '')
    expect(core.setOutput).toHaveBeenCalledWith(
      'registration-endpoint',
      'http://localhost:8484/reg'
    )
    expect(spawnEnv().STUBIDP_CLIENT_ID).toBeUndefined()
  })

  it('passes --preset arg when provided', async () => {
    inputs['redirect-uri'] = ''
    inputs.preset = 'next-auth'

    await run()

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('stubidp'),
      ['--preset', 'next-auth'],
      expect.objectContaining({ detached: true })
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'client-id',
      expect.stringMatching(/^[0-9a-f]{32}$/)
    )
  })

  it('resolves dist-tags to a concrete version for the cache key', async () => {
    cacheFixture.restoreCache.mockResolvedValue(undefined)

    await run()

    expect(execFileSync).toHaveBeenCalledWith(
      'npm',
      ['view', '@cerberauth/stubidp@latest', 'version', '--json'],
      expect.anything()
    )
    expect(cacheFixture.restoreCache).toHaveBeenCalledWith(
      [expect.any(String)],
      `stubidp-npm-${process.platform}-v0.6.0`
    )
    expect(execFileSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '@cerberauth/stubidp@0.6.0']),
      expect.anything()
    )
    expect(core.saveState).toHaveBeenCalledWith('cacheMiss', 'true')
  })

  it('takes the highest match when a range resolves to several versions', async () => {
    inputs.version = '^0.5'
    execFileSync.mockReturnValue('["0.5.0","0.5.1"]')

    await run()

    expect(core.setOutput).toHaveBeenCalledWith('version', '0.5.1')
  })

  it('falls back to the requested version when it cannot be resolved', async () => {
    execFileSync.mockImplementation(() => {
      throw new Error('offline')
    })

    await run()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('offline')
    )
    expect(core.setOutput).toHaveBeenCalledWith('version', 'latest')
  })

  it('skips lookup and install for an exact version on cache hit', async () => {
    inputs.version = '0.6.0'

    await run()

    expect(execFileSync).not.toHaveBeenCalled()
    expect(core.saveState).toHaveBeenCalledWith('cacheMiss', 'false')
  })

  it('saves pid to state after spawn', async () => {
    await run()

    expect(core.saveState).toHaveBeenCalledWith('pid', '12345')
  })

  it('fails and prints the log when stubidp exits early', async () => {
    fs.writeFileSync(path.join(tmp, 'stubidp-8484.log'), '')
    const onMock = mockChildProcess.on as unknown as jest.Mock<
      (event: string, cb: (...args: unknown[]) => void) => ChildProcess
    >
    onMock.mockImplementation((event, cb) => {
      if (event === 'exit') {
        fs.appendFileSync(path.join(tmp, 'stubidp-8484.log'), 'boom\n')
        cb(1, null)
      }
      return mockChildProcess
    })
    waitForReady.mockReturnValue(new Promise(() => {}))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'stubidp exited before becoming ready (code 1)'
    )
    expect(core.info).toHaveBeenCalledWith('boom')
  })

  it('sets failed status on error', async () => {
    spawn.mockImplementation(() => {
      throw new Error('binary not found')
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('binary not found')
  })
})

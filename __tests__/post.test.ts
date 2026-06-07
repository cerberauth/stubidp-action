import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as cacheFixture from '../__fixtures__/cache.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/cache', () => cacheFixture)

const { cleanup } = await import('../src/post.js')

describe('post.ts', () => {
  const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true)

  beforeEach(() => {
    core.getState.mockImplementation((name) => {
      if (name === 'pid') return '12345'
      if (name === 'cacheMiss') return 'false'
      if (name === 'cacheKey') return 'stubidp-npm-linux-v1.0.0'
      if (name === 'installDir') return '/home/runner/.cache/stubidp-action'
      return ''
    })
    cacheFixture.saveCache.mockResolvedValue(0)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('kills stubidp process by pid', async () => {
    await cleanup()

    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM')
    expect(core.info).toHaveBeenCalledWith('stubidp (pid 12345) stopped')
  })

  it('saves cache on cache miss', async () => {
    core.getState.mockImplementation((name) => {
      if (name === 'pid') return '12345'
      if (name === 'cacheMiss') return 'true'
      if (name === 'cacheKey') return 'stubidp-npm-linux-vlatest'
      if (name === 'installDir') return '/home/runner/.cache/stubidp-action'
      return ''
    })

    await cleanup()

    expect(cacheFixture.saveCache).toHaveBeenCalledWith(
      ['/home/runner/.cache/stubidp-action'],
      'stubidp-npm-linux-vlatest'
    )
  })

  it('skips cache save on cache hit', async () => {
    await cleanup()

    expect(cacheFixture.saveCache).not.toHaveBeenCalled()
  })

  it('warns on kill failure', async () => {
    killSpy.mockImplementation(() => {
      throw new Error('no such process')
    })

    await cleanup()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('no such process')
    )
  })
})

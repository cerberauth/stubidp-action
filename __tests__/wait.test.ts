import { jest } from '@jest/globals'
import { waitForReady } from '../src/wait.js'

describe('waitForReady', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves when endpoint returns ok', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(
      waitForReady('http://localhost:8484/.well-known/openid-configuration')
    ).resolves.toBeUndefined()
  })

  it('retries on non-ok response then resolves', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(
      waitForReady(
        'http://localhost:8484/.well-known/openid-configuration',
        5000,
        10
      )
    ).resolves.toBeUndefined()

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws when timeout exceeded', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection refused'))

    await expect(
      waitForReady(
        'http://localhost:8484/.well-known/openid-configuration',
        100,
        10
      )
    ).rejects.toThrow('did not become ready within 100ms')
  })
})

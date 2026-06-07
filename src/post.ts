import * as core from '@actions/core'
import * as cache from '@actions/cache'

export async function cleanup(): Promise<void> {
  const pidStr = core.getState('pid')
  if (pidStr) {
    const pid = parseInt(pidStr, 10)
    try {
      process.kill(pid, 'SIGTERM')
      core.info(`stubidp (pid ${pid}) stopped`)
    } catch (err) {
      core.warning(
        `Failed to stop stubidp: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const cacheMiss = core.getState('cacheMiss') === 'true'
  const cacheKey = core.getState('cacheKey')
  const installDir = core.getState('installDir')
  if (cacheMiss && cacheKey && installDir) {
    try {
      await cache.saveCache([installDir], cacheKey)
      core.debug(`Saved @cerberauth/stubidp to cache (key: ${cacheKey})`)
    } catch (err) {
      core.warning(
        `Failed to save cache: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
}

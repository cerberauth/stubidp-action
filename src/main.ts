import * as core from '@actions/core'
import * as cache from '@actions/cache'
import { spawn, execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import * as os from 'os'
import * as path from 'path'
import { waitForReady } from './wait.js'

export async function run(): Promise<void> {
  try {
    const port = core.getInput('port') || '8484'
    const clientId =
      core.getInput('client-id') || randomBytes(16).toString('hex')
    const clientSecret =
      core.getInput('client-secret') || randomBytes(16).toString('hex')
    const redirectUri = core.getInput('redirect-uri', { required: true })
    const skipPrompt = core.getInput('skip-prompt') || 'true'
    const defaultUser = core.getInput('default-user')
    const version = core.getInput('version') || 'latest'
    const issuer = core.getInput('issuer') || `http://localhost:${port}`

    const installDir = path.join(os.homedir(), '.cache', 'stubidp-action')
    const cacheKey = `stubidp-npm-${process.platform}-v${version}`

    const cacheHit = await cache.restoreCache([installDir], cacheKey)
    if (!cacheHit) {
      core.debug(`Installing @cerberauth/stubidp@${version}`)
      execFileSync(
        'npm',
        ['install', '--prefix', installDir, `@cerberauth/stubidp@${version}`],
        { stdio: 'inherit' }
      )
    } else {
      core.debug(`Restored @cerberauth/stubidp from cache (key: ${cacheKey})`)
    }

    core.saveState('installDir', installDir)
    core.saveState('cacheKey', cacheKey)
    core.saveState('cacheMiss', String(!cacheHit))

    const stubidpBin = path.join(
      installDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'stubidp.cmd' : 'stubidp'
    )

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STUBIDP_PORT: port,
      STUBIDP_ISSUER: issuer,
      STUBIDP_CLIENT_ID: clientId,
      STUBIDP_CLIENT_SECRET: clientSecret,
      STUBIDP_SKIP_PROMPT: skipPrompt,
      STUBIDP_RATE_LIMIT_DISABLED: 'true'
    }

    if (redirectUri) {
      env.STUBIDP_REDIRECT_URI = redirectUri
    }
    if (defaultUser) {
      env.STUBIDP_DEFAULT_USER = defaultUser
    }

    core.debug(`Starting stubidp on port ${port}`)
    const child = spawn(stubidpBin, [], {
      env,
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    core.saveState('pid', String(child.pid))

    const discoveryUrl = `${issuer}/.well-known/openid-configuration`
    core.debug(`Waiting for stubidp at ${discoveryUrl}`)
    await waitForReady(discoveryUrl)

    core.setOutput('issuer', issuer)
    core.setOutput('discovery-url', discoveryUrl)
    core.setOutput('client-id', clientId)
    core.setOutput('client-secret', clientSecret)
    core.setOutput('port', port)

    core.info(`stubidp ready at ${issuer}`)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

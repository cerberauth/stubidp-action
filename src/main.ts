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
    const redirectUri = core.getInput('redirect-uri')
    const skipPrompt = core.getInput('skip-prompt') || 'true'
    const defaultUser = core.getInput('default-user')
    const version = core.getInput('version') || 'latest'
    const issuer = core.getInput('issuer') || `http://localhost:${port}`
    const preset = core.getInput('preset')
    const jwksFile = core.getInput('jwks-file')
    const logLevel = core.getInput('log-level')
    const rateLimitDisabled = core.getInput('rate-limit-disabled') || 'true'
    const rateLimitWindowMs = core.getInput('rate-limit-window-ms')
    const rateLimitMax = core.getInput('rate-limit-max')
    const enableRegistration = core.getInput('enable-registration')
    const registrationInitialAccessToken = core.getInput(
      'registration-initial-access-token'
    )
    const trustProxy = core.getInput('trust-proxy')
    const httpsRedirect = core.getInput('https-redirect')
    const securityHeaders = core.getInput('security-headers')
    const postLogoutRedirectUri = core.getInput('post-logout-redirect-uri')
    const publicClient = core.getInput('public-client')

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
      STUBIDP_RATE_LIMIT_DISABLED: rateLimitDisabled
    }

    if (redirectUri) {
      env.STUBIDP_REDIRECT_URI = redirectUri
    }
    if (defaultUser) {
      env.STUBIDP_DEFAULT_USER = defaultUser
    }
    if (jwksFile) {
      env.STUBIDP_JWKS_FILE = jwksFile
    }
    if (logLevel) {
      env.STUBIDP_LOG_LEVEL = logLevel
    }
    if (rateLimitWindowMs) {
      env.STUBIDP_RATE_LIMIT_WINDOW_MS = rateLimitWindowMs
    }
    if (rateLimitMax) {
      env.STUBIDP_RATE_LIMIT_MAX = rateLimitMax
    }
    if (enableRegistration) {
      env.STUBIDP_ENABLE_REGISTRATION = enableRegistration
    }
    if (registrationInitialAccessToken) {
      env.STUBIDP_REGISTRATION_INITIAL_ACCESS_TOKEN =
        registrationInitialAccessToken
    }
    if (trustProxy) {
      env.STUBIDP_TRUST_PROXY = trustProxy
    }
    if (httpsRedirect) {
      env.STUBIDP_HTTPS_REDIRECT = httpsRedirect
    }
    if (securityHeaders) {
      env.STUBIDP_SECURITY_HEADERS = securityHeaders
    }
    if (postLogoutRedirectUri) {
      env.STUBIDP_POST_LOGOUT_REDIRECT_URI = postLogoutRedirectUri
    }
    if (publicClient) {
      env.STUBIDP_PUBLIC_CLIENT = publicClient
    }

    const args: string[] = []
    if (preset) args.push('--preset', preset)

    core.debug(`Starting stubidp on port ${port}`)
    const child = spawn(stubidpBin, args, {
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

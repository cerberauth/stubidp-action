import * as core from '@actions/core'
import * as cache from '@actions/cache'
import { spawn, execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { waitForReady } from './wait.js'

const PACKAGE = '@cerberauth/stubidp'

/**
 * Action inputs forwarded verbatim to stubidp as STUBIDP_* environment
 * variables when set. Inputs that need special handling (port, issuer, client
 * credentials, redirect URI, preset, version) are handled separately.
 */
export const ENV_INPUTS: Readonly<Record<string, string>> = {
  'skip-prompt': 'STUBIDP_SKIP_PROMPT',
  'default-user': 'STUBIDP_DEFAULT_USER',
  'post-logout-redirect-uri': 'STUBIDP_POST_LOGOUT_REDIRECT_URI',
  scopes: 'STUBIDP_SCOPES',
  claims: 'STUBIDP_CLAIMS',
  // Signing keys
  'jwks-file': 'STUBIDP_JWKS_FILE',
  jwks: 'STUBIDP_JWKS',
  // Tokens
  'access-token-format': 'STUBIDP_ACCESS_TOKEN_FORMAT',
  'access-token-ttl': 'STUBIDP_ACCESS_TOKEN_TTL',
  'id-token-ttl': 'STUBIDP_ID_TOKEN_TTL',
  'refresh-token-ttl': 'STUBIDP_REFRESH_TOKEN_TTL',
  'session-ttl': 'STUBIDP_SESSION_TTL',
  'id-token-includes-userinfo-claims':
    'STUBIDP_ID_TOKEN_INCLUDES_USERINFO_CLAIMS',
  'interaction-path': 'STUBIDP_INTERACTION_PATH',
  // Logging / telemetry
  'log-level': 'STUBIDP_LOG_LEVEL',
  'disable-telemetry': 'STUBIDP_DISABLE_TELEMETRY',
  // Rate limiting
  'rate-limit-disabled': 'STUBIDP_RATE_LIMIT_DISABLED',
  'rate-limit-window-ms': 'STUBIDP_RATE_LIMIT_WINDOW_MS',
  'rate-limit-max': 'STUBIDP_RATE_LIMIT_MAX',
  // Dynamic client registration
  'enable-registration': 'STUBIDP_ENABLE_REGISTRATION',
  'registration-initial-access-token':
    'STUBIDP_REGISTRATION_INITIAL_ACCESS_TOKEN',
  // Client ID Metadata Documents
  'enable-cimd': 'STUBIDP_ENABLE_CIMD',
  'cimd-trusted-origins': 'STUBIDP_CIMD_TRUSTED_ORIGINS',
  // JWT introspection / userinfo responses
  'enable-jwt-introspection': 'STUBIDP_ENABLE_JWT_INTROSPECTION',
  'introspection-signed-response-alg':
    'STUBIDP_INTROSPECTION_SIGNED_RESPONSE_ALG',
  'enable-jwt-userinfo': 'STUBIDP_ENABLE_JWT_USERINFO',
  'userinfo-signed-response-alg': 'STUBIDP_USERINFO_SIGNED_RESPONSE_ALG',
  // JWT-Secured Authorization Requests
  'enable-jar': 'STUBIDP_ENABLE_JAR',
  'request-object-signing-alg': 'STUBIDP_REQUEST_OBJECT_SIGNING_ALG',
  'require-signed-request-object': 'STUBIDP_REQUIRE_SIGNED_REQUEST_OBJECT',
  // Static client public keys
  'client-jwks': 'STUBIDP_CLIENT_JWKS',
  'client-jwks-file': 'STUBIDP_CLIENT_JWKS_FILE',
  'client-jwks-uri': 'STUBIDP_CLIENT_JWKS_URI',
  // Security / proxy
  'trust-proxy': 'STUBIDP_TRUST_PROXY',
  'https-redirect': 'STUBIDP_HTTPS_REDIRECT',
  'security-headers': 'STUBIDP_SECURITY_HEADERS'
}

/** Discovery metadata fields exposed as action outputs. */
const DISCOVERY_OUTPUTS: Readonly<Record<string, string>> = {
  'authorization-endpoint': 'authorization_endpoint',
  'token-endpoint': 'token_endpoint',
  'userinfo-endpoint': 'userinfo_endpoint',
  'jwks-uri': 'jwks_uri',
  'end-session-endpoint': 'end_session_endpoint',
  'introspection-endpoint': 'introspection_endpoint',
  'revocation-endpoint': 'revocation_endpoint',
  'registration-endpoint': 'registration_endpoint'
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * Resolves a dist-tag or range (e.g. `latest`, `^0.6`) to a concrete version so
 * the cache key changes when a new stubidp release is published.
 */
export function resolveVersion(version: string): string {
  if (EXACT_VERSION.test(version)) return version
  try {
    const out = execFileSync(
      'npm',
      ['view', `${PACKAGE}@${version}`, 'version', '--json'],
      { encoding: 'utf8' }
    )
    const parsed: unknown = JSON.parse(String(out).trim())
    const resolved = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed
    if (typeof resolved === 'string' && resolved) return resolved
  } catch (err) {
    core.warning(
      `Could not resolve ${PACKAGE}@${version}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  return version
}

/** Truthy check matching core.getBooleanInput, but tolerant of empty input. */
function getFlag(name: string): boolean {
  return ['true', 'True', 'TRUE'].includes(core.getInput(name))
}

function printLog(logFile: string): void {
  try {
    const content = fs.readFileSync(logFile, 'utf8').trim()
    if (!content) return
    core.startGroup('stubidp log')
    core.info(content)
    core.endGroup()
  } catch {
    // no log available
  }
}

export async function run(): Promise<void> {
  let logFile = ''
  try {
    const port = core.getInput('port') || '8484'
    const issuer = core.getInput('issuer') || `http://localhost:${port}`
    const redirectUri = core.getInput('redirect-uri')
    const preset = core.getInput('preset')
    const publicClient = getFlag('public-client')
    const enableRegistration = getFlag('enable-registration')
    const requestedVersion = core.getInput('version') || 'latest'

    if (!redirectUri && !preset && !enableRegistration) {
      throw new Error(
        'One of `redirect-uri`, `preset` or `enable-registration: true` is required'
      )
    }

    // stubidp only creates the static client when a redirect URI is known
    // (explicitly or from a preset).
    const hasStaticClient = Boolean(redirectUri || preset)
    const clientId = hasStaticClient
      ? core.getInput('client-id') || randomBytes(16).toString('hex')
      : ''
    let clientSecret = ''
    if (hasStaticClient && !publicClient) {
      clientSecret =
        core.getInput('client-secret') || randomBytes(16).toString('hex')
    } else if (publicClient && core.getInput('client-secret')) {
      core.warning('`client-secret` is ignored when `public-client` is true')
    }
    if (clientSecret) core.setSecret(clientSecret)

    const version = resolveVersion(requestedVersion)
    const installDir = path.join(os.homedir(), '.cache', 'stubidp-action')
    const cacheKey = `stubidp-npm-${process.platform}-v${version}`

    const cacheHit = await cache.restoreCache([installDir], cacheKey)
    if (!cacheHit) {
      core.info(`Installing ${PACKAGE}@${version}`)
      execFileSync(
        'npm',
        ['install', '--prefix', installDir, `${PACKAGE}@${version}`],
        { stdio: 'inherit' }
      )
    } else {
      core.debug(`Restored ${PACKAGE} from cache (key: ${cacheKey})`)
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
      STUBIDP_ISSUER: issuer
    }
    if (redirectUri) env.STUBIDP_REDIRECT_URI = redirectUri
    if (clientId) env.STUBIDP_CLIENT_ID = clientId
    if (clientSecret) env.STUBIDP_CLIENT_SECRET = clientSecret
    if (publicClient) env.STUBIDP_PUBLIC_CLIENT = 'true'
    for (const [input, name] of Object.entries(ENV_INPUTS)) {
      const value = core.getInput(input)
      if (value) env[name] = value
    }

    const args: string[] = []
    if (preset) args.push('--preset', preset)

    logFile = path.join(
      process.env.RUNNER_TEMP || os.tmpdir(),
      `stubidp-${port}.log`
    )
    const logFd = fs.openSync(logFile, 'w')

    core.info(`Starting stubidp ${version} on port ${port}`)
    const child = spawn(stubidpBin, args, {
      env,
      detached: true,
      stdio: ['ignore', logFd, logFd]
    })
    fs.closeSync(logFd)
    child.unref()

    core.saveState('pid', String(child.pid))
    core.saveState('logFile', logFile)

    const exited = new Promise<never>((_, reject) => {
      child.on('exit', (code, signal) =>
        reject(
          new Error(
            `stubidp exited before becoming ready (${signal ?? `code ${code}`})`
          )
        )
      )
    })

    const discoveryUrl = `${issuer}/.well-known/openid-configuration`
    core.debug(`Waiting for stubidp at ${discoveryUrl}`)
    const metadata = await Promise.race([waitForReady(discoveryUrl), exited])

    core.setOutput('issuer', issuer)
    core.setOutput('discovery-url', discoveryUrl)
    core.setOutput('client-id', clientId)
    core.setOutput('client-secret', clientSecret)
    core.setOutput('port', port)
    core.setOutput('version', version)
    core.setOutput('log-file', logFile)
    for (const [output, field] of Object.entries(DISCOVERY_OUTPUTS)) {
      const value = metadata[field]
      core.setOutput(output, typeof value === 'string' ? value : '')
    }

    core.info(`stubidp ready at ${issuer}`)
  } catch (error) {
    if (logFile) printLog(logFile)
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

# StubIdP Action

![CI](https://github.com/cerberauth/stubidp-action/actions/workflows/ci.yml/badge.svg)
![Check dist/](https://github.com/cerberauth/stubidp-action/actions/workflows/check-dist.yml/badge.svg)
![CodeQL](https://github.com/cerberauth/stubidp-action/actions/workflows/codeql-analysis.yml/badge.svg)
![Coverage](./badges/coverage.svg)

GitHub Action that starts a stub OpenID Connect identity provider for testing
using [StubIdP](https://github.com/cerberauth/stubidp).

StubIdP is a lightweight, headless OIDC provider designed for CI — no real user
accounts, no external dependencies. It auto-approves login and consent so your
tests run without human interaction.

## Usage

```yaml
steps:
  - name: Start StubIdP
    id: stubidp
    uses: cerberauth/stubidp-action@v1
    with:
      redirect-uri: http://localhost:3000/callback

  - name: Run tests
    env:
      OIDC_ISSUER: ${{ steps.stubidp.outputs.issuer }}
      OIDC_CLIENT_ID: ${{ steps.stubidp.outputs.client-id }}
      OIDC_CLIENT_SECRET: ${{ steps.stubidp.outputs.client-secret }}
    run: npm test
```

## Inputs

### Core

| Input           | Description                                                                              | Default                   |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| `port`          | Port to run StubIdP on                                                                   | `8484`                    |
| `issuer`        | OIDC issuer URL                                                                          | `http://localhost:<port>` |
| `client-id`     | OIDC client ID                                                                           | auto-generated            |
| `client-secret` | OIDC client secret                                                                       | auto-generated            |
| `redirect-uri`  | Allowed redirect URI for the OIDC client (required unless `preset` or registration)      | —                         |
| `skip-prompt`   | Auto-approve login/consent prompts for headless CI                                       | `true`                    |
| `default-user`  | JSON object of OIDC claims for the stub user                                             | —                         |
| `preset`        | Preconfigure for an auth library (`better-auth`, `next-auth`)                            | —                         |
| `public-client` | Public client mode (`token_endpoint_auth_method=none`, no secret) — for SPAs/native apps | —                         |
| `scopes`        | Comma-separated supported scopes                                                         | `openid,offline_access,…` |
| `claims`        | JSON object mapping scopes to claim arrays (overrides auto-derived claims)               | —                         |
| `version`       | Version, range or dist-tag of `@cerberauth/stubidp` to install                           | `latest`                  |

`redirect-uri` is required unless a `preset` (which brings its own redirect URI)
or `enable-registration: true` is set. Without either, the action fails right
away instead of waiting for a server that cannot start.

When `client-id` or `client-secret` are not provided, random 16-byte hex values
are generated and exposed via outputs. Public clients get no secret, so the
`client-secret` output is empty. In registration-only mode (no `redirect-uri` or
`preset`), no static client is created and both outputs are empty.

`version` is resolved to a concrete release before install, so `latest` picks up
new StubIdP releases instead of reusing a stale cache entry.

### Signing Keys

| Input       | Description                                                                 | Default |
| ----------- | --------------------------------------------------------------------------- | ------- |
| `jwks-file` | Path to a JWKS JSON file (key pair auto-generated if omitted)               | —       |
| `jwks`      | Inline JWKS JSON (private keys), an alternative to `jwks-file`; use secrets | —       |

Generate a key with `npx -p @cerberauth/stubidp stubidp-jwks`.

### Tokens and Sessions

| Input                               | Description                                                      | Default        |
| ----------------------------------- | ---------------------------------------------------------------- | -------------- |
| `access-token-format`               | `opaque` or `jwt` (JWT access tokens carry identity claims)      | `opaque`       |
| `access-token-ttl`                  | Access token lifetime in seconds (incl. client credentials)      | `3600`         |
| `id-token-ttl`                      | ID token lifetime in seconds                                     | `3600`         |
| `refresh-token-ttl`                 | Refresh token lifetime in seconds                                | `1209600`      |
| `session-ttl`                       | Login session lifetime in seconds                                | `1209600`      |
| `id-token-includes-userinfo-claims` | Put email/profile/etc. claims in the ID token (not spec default) | `false`        |
| `interaction-path`                  | Base path for the login/consent UI                               | `/interaction` |

### Logging

| Input       | Description                                                              | Default |
| ----------- | ------------------------------------------------------------------------ | ------- |
| `log-level` | Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) | `info`  |

The server log is written to the file in the `log-file` output and printed in
the step log if StubIdP fails to start.

### Telemetry

| Input               | Description                                                       | Default |
| ------------------- | ----------------------------------------------------------------- | ------- |
| `disable-telemetry` | Disable StubIdP usage analytics (also honoured: `DO_NOT_TRACK=1`) | `false` |

### Rate Limiting

| Input                  | Description                            | Default  |
| ---------------------- | -------------------------------------- | -------- |
| `rate-limit-disabled`  | Disable rate limiting                  | `true`   |
| `rate-limit-window-ms` | Rate limit time window in milliseconds | `900000` |
| `rate-limit-max`       | Max requests per window per IP         | `100`    |

### Dynamic Client Registration

| Input                               | Description                                                                | Default |
| ----------------------------------- | -------------------------------------------------------------------------- | ------- |
| `enable-registration`               | Enable dynamic client registration (RFC 7591) and management (RFC 7592)    | —       |
| `registration-initial-access-token` | Bearer token required to register new clients (omit for open registration) | —       |

### Client ID Metadata Documents

| Input                  | Description                                                           | Default                          |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------- |
| `enable-cimd`          | Enable OAuth Client ID Metadata Document support (draft-02)           | `false`                          |
| `cimd-trusted-origins` | Comma-separated trusted origins (prefix if ending in `/`, else exact) | `https://cimd.cerberauth.com/t/` |

### JWT Responses

| Input                               | Description                                                       | Default |
| ----------------------------------- | ----------------------------------------------------------------- | ------- |
| `enable-jwt-introspection`          | Enable JWT Response for Token Introspection (RFC 9701)            | `false` |
| `introspection-signed-response-alg` | Signing alg (e.g. `RS256`) for introspection on the static client | —       |
| `enable-jwt-userinfo`               | Enable JWT UserInfo responses (OIDC Core 5.3.2)                   | `false` |
| `userinfo-signed-response-alg`      | Signing alg (e.g. `RS256`) for UserInfo on the static client      | —       |

### JWT-Secured Authorization Requests (JAR)

| Input                           | Description                                                    | Default |
| ------------------------------- | -------------------------------------------------------------- | ------- |
| `enable-jar`                    | Enable JAR (RFC 9101): accept the `request` parameter on /auth | `false` |
| `request-object-signing-alg`    | Signing alg (e.g. `RS256`, `HS256`) for the static client      | —       |
| `require-signed-request-object` | Require signed Request Objects                                 | `false` |
| `client-jwks`                   | Inline JWKS JSON with the static client public keys            | —       |
| `client-jwks-file`              | Path to a JWKS JSON file with the static client public keys    | —       |
| `client-jwks-uri`               | URL of the static client JWKS document                         | —       |

### Security / Proxy

| Input              | Description                                          | Default |
| ------------------ | ---------------------------------------------------- | ------- |
| `trust-proxy`      | Trust reverse proxy headers (`X-Forwarded-*`)        | —       |
| `https-redirect`   | Redirect HTTP requests to HTTPS                      | —       |
| `security-headers` | Enable security headers (CSP, HSTS, etc.) via helmet | —       |

### Logout

| Input                      | Description                      | Default |
| -------------------------- | -------------------------------- | ------- |
| `post-logout-redirect-uri` | Allowed post-logout redirect URI | —       |

## Outputs

| Output                   | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| `issuer`                 | OIDC issuer URL (e.g. `http://localhost:8484`)               |
| `discovery-url`          | OIDC discovery URL                                           |
| `client-id`              | OIDC client ID (empty in registration-only mode)             |
| `client-secret`          | OIDC client secret (empty for public clients)                |
| `port`                   | Port StubIdP is running on                                   |
| `version`                | Resolved `@cerberauth/stubidp` version                       |
| `log-file`               | Path to the StubIdP server log                               |
| `authorization-endpoint` | Authorization endpoint URL                                   |
| `token-endpoint`         | Token endpoint URL                                           |
| `userinfo-endpoint`      | UserInfo endpoint URL                                        |
| `jwks-uri`               | JWKS URL with the public signing keys                        |
| `end-session-endpoint`   | End session (logout) endpoint URL                            |
| `introspection-endpoint` | Token introspection endpoint URL                             |
| `revocation-endpoint`    | Token revocation endpoint URL                                |
| `registration-endpoint`  | Dynamic client registration endpoint URL (only when enabled) |

Endpoint outputs are read from the discovery document once StubIdP is ready.

## Examples

### Custom port and credentials

```yaml
- name: Start StubIdP
  id: stubidp
  uses: cerberauth/stubidp-action@v1
  with:
    port: '9090'
    client-id: my-test-client
    client-secret: my-test-secret
    redirect-uri: http://localhost:3000/callback
```

### Custom stub user

```yaml
- name: Start StubIdP
  id: stubidp
  uses: cerberauth/stubidp-action@v1
  with:
    default-user:
      '{"sub":"user-123","email":"test@example.com","name":"Test User"}'
```

### JWT access tokens with short lifetimes

```yaml
- name: Start StubIdP
  id: stubidp
  uses: cerberauth/stubidp-action@v1
  with:
    redirect-uri: http://localhost:3000/callback
    access-token-format: jwt
    access-token-ttl: '30'
```

### Upload the server log

```yaml
- name: Upload StubIdP log
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: stubidp-log
    path: ${{ steps.stubidp.outputs.log-file }}
```

### Full workflow example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start StubIdP
        id: stubidp
        uses: cerberauth/stubidp-action@v1
        with:
          redirect-uri: http://localhost:3000/callback

      - name: Run integration tests
        env:
          OIDC_ISSUER: ${{ steps.stubidp.outputs.issuer }}
          OIDC_CLIENT_ID: ${{ steps.stubidp.outputs.client-id }}
          OIDC_CLIENT_SECRET: ${{ steps.stubidp.outputs.client-secret }}
        run: npm run test:integration
```

## Local Testing

Use [`@github/local-action`](https://github.com/github/local-action) to run the
action locally without pushing to GitHub:

```bash
npx @github/local-action . src/main.ts .env
```

Copy `.env.example` to `.env` and adjust inputs as needed.

## How It Works

The action resolves the requested `@cerberauth/stubidp` version, installs it
(cached with `@actions/cache`), and launches it as a detached background
process, passing configuration through `STUBIDP_*` environment variables. It
then polls the OpenID Connect discovery endpoint
(`/.well-known/openid-configuration`) until the server is ready (30-second
timeout, or immediately failing if the process exits), then sets outputs and
exits. The StubIdP process continues running for the remainder of the workflow
job.

Rate limiting is disabled by default (`rate-limit-disabled: true`) for CI
compatibility.

## License

[MIT](./LICENSE)

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
| `redirect-uri`  | Allowed redirect URI for the OIDC client                                                 | —                         |
| `skip-prompt`   | Auto-approve login/consent prompts for headless CI                                       | `true`                    |
| `default-user`  | JSON object of OIDC claims for the stub user                                             | —                         |
| `preset`        | Preconfigure for an auth library (`better-auth`, `next-auth`)                            | —                         |
| `public-client` | Public client mode (`token_endpoint_auth_method=none`, no secret) — for SPAs/native apps | —                         |
| `version`       | Version of `@cerberauth/stubidp` to install                                              | `latest`                  |

When `client-id` or `client-secret` are not provided, random 16-byte hex values
are generated and exposed via outputs.

### JWKS

| Input       | Description                                                   | Default |
| ----------- | ------------------------------------------------------------- | ------- |
| `jwks-file` | Path to a JWKS JSON file (key pair auto-generated if omitted) | —       |

### Logging

| Input       | Description                                                              | Default |
| ----------- | ------------------------------------------------------------------------ | ------- |
| `log-level` | Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) | `info`  |

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

| Output          | Description                                    |
| --------------- | ---------------------------------------------- |
| `issuer`        | OIDC issuer URL (e.g. `http://localhost:8484`) |
| `discovery-url` | OIDC discovery URL                             |
| `client-id`     | OIDC client ID                                 |
| `client-secret` | OIDC client secret                             |
| `port`          | Port StubIdP is running on                     |

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

The action launches StubIdP via `npx @cerberauth/stubidp` as a detached
background process, passing configuration through environment variables. It then
polls the OpenID Connect discovery endpoint
(`/.well-known/openid-configuration`) until the server is ready (30-second
timeout), then sets outputs and exits. The StubIdP process continues running for
the remainder of the workflow job.

Rate limiting is disabled by default (`rate-limit-disabled: true`) for CI
compatibility.

## License

[MIT](./LICENSE)

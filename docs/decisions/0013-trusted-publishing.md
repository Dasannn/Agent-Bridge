# 0013: npm Trusted Publishing

- Status: Accepted
- Date: 2026-10-14

## Context

The publish workflow used a granular npm token with a seven-day expiry and
two-factor authentication bypass. It expires and needs replacing. It can
also leak from the repository secret or wherever it is handled.

## Decision

Use npm trusted publishing through GitHub Actions, with provenance. The
owner has configured `cloud-agent-bridge` on npm for user `Dasannn`,
repository `Agent-Bridge`, workflow `publish.yml`, and no environment.
The trusted publisher allows `npm stage publish` only. Each release is
staged for the owner's approval with 2FA.

The workflow keeps `contents: read` and adds `id-token: write`. It runs on
Node.js 22 (22.14.0 or later) and installs npm 11.15.0 or later. It stages
with `npm stage publish --access public`.

`npm stage publish` detects OIDC automatically and generates provenance.
The workflow sets no token and
does not pass `registry-url` to `actions/setup-node`, whose generated
`.npmrc` could make npm use a placeholder token instead of OIDC.

## Consequences

- Staging needs no repository secret or npm token.
- Each release needs human approval with 2FA before it becomes public;
  OIDC tokens cannot approve, so a compromised workflow cannot publish alone.
- A staged version reserves its semver version.
- Provenance is generated automatically and shown on npm.
- The runner needs npm 11.15.0 or later and Node.js 22.14.0 or later.
- The first trusted release verifies the setup end to end.
- After it succeeds, the owner deletes the old repository secret and npm
  token, following `docs/guides/release.md`.

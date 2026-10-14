# Security Policy

## Supported versions

Only the latest published version on [npm](https://www.npmjs.com/package/cloud-agent-bridge)
is supported.

## What Agent-Bridge handles and what it never does

Agent-Bridge runs inside your container. Pasted codes and callback addresses
go only to the CLI being logged in: through its input, or to its listener on
the container's loopback interface after checking the redirect address and
state. They are never logged, stored, or echoed, and are masked in errors.
Codes and tokens are never written to Agent-Bridge logs or state.

Credentials stay where each CLI keeps them, inside the container.
Agent-Bridge never reads, copies, or edits credential files. It never asks
for, accepts, or relays API keys through the chat. Put API keys in your cloud
environment's secrets or environment variables.

Agent-Bridge keeps its own state outside your repository. It writes nothing
into the repository except the single skill file from `bridge skill --repo`,
on request. Permission rules from `bridge setup` are limited to Agent-Bridge
and the binaries of the listed CLIs. Other settings are preserved.

Releases are published from GitHub Actions with npm trusted publishing.
They are staged and approved by the owner with 2FA, with provenance
([decision 0013](docs/decisions/0013-trusted-publishing.md)). You can check
provenance on the [npm package page](https://www.npmjs.com/package/cloud-agent-bridge).

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: Security tab →
[Report a vulnerability](https://github.com/Dasannn/Agent-Bridge/security/advisories/new).
Do not open a public issue. Never include real login codes, tokens, or
credentials in a report.

The maintainer is a single person and replies on a best-effort basis.

## Out of scope

The security of the third-party CLIs themselves, and the providers' accounts
and terms, are outside Agent-Bridge's scope. Review each provider's terms.
See the [README warning about Antigravity](README.md#agent-bridge).

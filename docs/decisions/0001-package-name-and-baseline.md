# 0001: Package Name and Container Baseline

- Status: Accepted (package name provisional until the Phase 0 review)
- Date: 2026-10-13

## Context

Plan question 9: is the npm package name `agent-bridge` available? The spike
also needs a record of the cloud container it runs in.

## Findings

Container baseline (Claude Code on the web):

| Item | Value |
|---|---|
| OS | Ubuntu 24.04.5 LTS, x86_64 |
| Node.js | v22.22.0 |
| npm | 10.9.4 |
| `script` (util-linux) | available at `/usr/bin/script` |
| npm registry | reachable through the environment proxy |
| GitHub (git) | reachable |
| `opencode`, `agy`, `codex` | not preinstalled |

npm names checked with `npm view <name>`:

| Name | Status |
|---|---|
| `agent-bridge` | Taken (an unrelated local-first context hand-off CLI) |
| `@dasannn/agent-bridge` | Free (requires an npm user or org named `dasannn`) |
| `agentbridge` | Free |
| `cloud-agent-bridge` | Free |
| `agent-bridge-cli`, `agents-bridge` | Taken |

## Decision

Publish as `@dasannn/agent-bridge`. The scoped name keeps the project name
and avoids confusion with the unrelated `agent-bridge` package. The package
still provides the `agent-bridge` and `bridge` commands.

The project owner confirms the name, and the npm scope, at the Phase 0
review. `cloud-agent-bridge` is the unscoped fallback.

## Consequences

- The setup script line becomes
  `npx -y @dasannn/agent-bridge setup --agents opencode,agy`.
- `docs/plan.md` Phase 5 and the README must use the final package name.
- Node.js 22 is available in the cloud container, so the Node.js 20 floor in
  `docs/spec.md` holds.
